/**
 * A8 Petition Engine (AI-first, fallback-safe)
 * - Uses data/sector_map.json to route (primary/through/cc)
 * - AI FIRST: reads complaint -> extracts facts -> decides best outcome
 * - Structure/logic validates + routes + enforces mandatory CCs
 * - If OPENAI_API_KEY is set, enriches petition using AI
 * - Preview locking: unpaid => short preview + lock line
 *
 * OPTIONAL (recommended for full Nigeria coverage):
 * - data/location_map.json to cover ALL cities/LGAs without bloating code
 */

const fs = require("fs");
const path = require("path");

let OpenAI = null;
try {
  OpenAI = require("openai").OpenAI || require("openai");
} catch (_) {
  OpenAI = null;
}

/* =========================
   CONFIG
========================= */
const PRICE = 1150;
const CURRENCY = "NGN";
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

/* =========================
   Sector map loader
========================= */
function loadSectorMap() {
  try {
    const p = path.join(__dirname, "data", "sector_map.json");
    const raw = fs.readFileSync(p, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.sectors)) return null;
    return parsed;
  } catch (e) {
    console.warn("[A8] sector_map.json not found/invalid:", e?.message || e);
    return null;
  }
}
const SECTOR_MAP = loadSectorMap();

/* =========================
   Location map loader (OPTIONAL)
   - Extends CITY_TO_STATE safely
   Supported formats:
   1) { "cities": { "kubwa": "FCT, Abuja", ... } }
   2) { "map": { ... } }
   3) { "items": [ { "city": "kubwa", "state": "FCT, Abuja" }, ... ] }
   4) plain object { "kubwa": "FCT, Abuja", ... }
========================= */
function loadLocationMap() {
  try {
    const p = path.join(__dirname, "data", "location_map.json");
    if (!fs.existsSync(p)) return null;

    const raw = fs.readFileSync(p, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed) return null;

    // Format 1 / 2
    const obj = parsed.cities || parsed.map;
    if (obj && typeof obj === "object" && !Array.isArray(obj)) return obj;

    // Format 3
    if (Array.isArray(parsed.items)) {
      const out = {};
      for (const it of parsed.items) {
        const c = String(it?.city || it?.name || "").trim().toLowerCase();
        const s = String(it?.state || it?.region || "").trim();
        if (c && s) out[c] = s;
      }
      return Object.keys(out).length ? out : null;
    }

    // Format 4 (plain object map)
    if (typeof parsed === "object" && !Array.isArray(parsed)) {
      const out = {};
      for (const [k, v] of Object.entries(parsed)) {
        const c = String(k || "").trim().toLowerCase();
        const s = String(v || "").trim();
        if (c && s) out[c] = s;
      }
      return Object.keys(out).length ? out : null;
    }

    return null;
  } catch (e) {
    console.warn("[A8] location_map.json not found/invalid:", e?.message || e);
    return null;
  }
}

/* =========================
   OpenAI client
========================= */
let openai = null;
try {
  const key = String(process.env.OPENAI_API_KEY || "").trim();
  if (OpenAI && key) {
    openai = new OpenAI({ apiKey: key });
    console.log("[A8] OpenAI client initialised");
  } else {
    console.warn("[A8] OPENAI_API_KEY not set - fallback mode active.");
  }
} catch (err) {
  console.warn("[A8] OpenAI init error:", err?.message || err);
  openai = null;
}

/* =========================
   Helpers
========================= */
const safeString = (v) => (typeof v === "string" ? v : "");
const clean = (s) =>
  safeString(s)
    .replace(/\s+/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();

function uniqueByOrg(list = []) {
  const seen = new Set();
  return (list || []).filter((i) => {
    const org = clean(i?.org || i?.name || "");
    const key = org.toLowerCase();
    if (!org) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* =========================
   Nigeria location/state inference
   RULE: Do NOT remove what works.
   UPGRADE: Extend cities via data/location_map.json if present.
========================= */
const NIGERIA_STATES = [
  "Abia","Adamawa","Akwa Ibom","Anambra","Bauchi","Bayelsa","Benue","Borno",
  "Cross River","Delta","Ebonyi","Edo","Ekiti","Enugu","Gombe","Imo","Jigawa",
  "Kaduna","Kano","Katsina","Kebbi","Kogi","Kwara","Lagos","Nasarawa","Niger",
  "Ogun","Ondo","Osun","Oyo","Plateau","Rivers","Sokoto","Taraba","Yobe","Zamfara"
];

// YOUR EXISTING BASE MAP (kept as-is)
const CITY_TO_STATE_BASE = {
  // FCT / Abuja
  "abuja": "FCT, Abuja",
  "fct": "FCT, Abuja",
  "garki": "FCT, Abuja",
  "wuse": "FCT, Abuja",
  "maitama": "FCT, Abuja",
  "asokoro": "FCT, Abuja",
  "gwarinpa": "FCT, Abuja",
  "kubwa": "FCT, Abuja",
  "utako": "FCT, Abuja",
  "kubwa abuja": "FCT, Abuja",
  "kuje": "FCT, Abuja",
  "bwari": "FCT, Abuja",
  "gwagwalada": "FCT, Abuja",
  "abaji": "FCT, Abuja",
  "kwali": "FCT, Abuja",
  // A few common city->state anchors (expand later safely)
  "ikeja": "Lagos",
  "lekki": "Lagos",
  "surulere": "Lagos",
  "ikorodu": "Lagos",
  "port harcourt": "Rivers",
  "ph": "Rivers",
  "benin": "Edo",
  "benin city": "Edo",
  "warri": "Delta",
  "asaba": "Delta",
  "ilorin": "Kwara",
  "aba": "Abia",
  "onitsha": "Anambra",
  "awka": "Anambra",
  "enugu": "Enugu",
  "jos": "Plateau",
  "makurdi": "Benue",
  "yola": "Adamawa",
  "maiduguri": "Borno",
  "kano": "Kano",
  "kaduna": "Kaduna",
  "minna": "Niger",
  "lafia": "Nasarawa",
  "lokoja": "Kogi",
  "gombe": "Gombe"
};

// Extend safely with location_map.json (if present)
const LOCATION_MAP_EXT = loadLocationMap();
const CITY_TO_STATE = {
  ...CITY_TO_STATE_BASE,
  ...(LOCATION_MAP_EXT || {}),
};

function inferStateFromText(text = "") {
  const t = clean(text).toLowerCase();
  if (!t) return null;

  // explicit FCT/Abuja wins
  if (/\b(fct|abuja)\b/.test(t)) return "FCT, Abuja";

  // explicit state name match (e.g. "Gombe State")
  for (const st of NIGERIA_STATES) {
    const key = st.toLowerCase();
    const rx = new RegExp(`\\b${escapeRegExp(key)}\\b`, "i");
    if (rx.test(t)) return st;
    const rx2 = new RegExp(`\\b${escapeRegExp(key)}\\s+state\\b`, "i");
    if (rx2.test(t)) return st;
  }

  // city/LGA anchors (choose longest first)
  const keys = Object.keys(CITY_TO_STATE).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (t.includes(k)) return CITY_TO_STATE[k];
  }

  return null;
}

/* =========================
   Routing using sector_map.json (YOUR LOGIC KEPT)
========================= */
function detectSector(description = "") {
  if (!SECTOR_MAP?.sectors?.length) return null;
  const text = clean(description).toLowerCase();

  let best = null;
  let bestScore = 0;

  for (const s of SECTOR_MAP.sectors) {
    const kws = Array.isArray(s.keywords) ? s.keywords : [];
    let score = 0;
    for (const k of kws) {
      const kk = String(k || "").toLowerCase();
      if (!kk) continue;
      if (text.includes(kk)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }

  return bestScore > 0 ? best : null;
}

function enforceMandatoryCC(cc = [], description = "") {
  const out = [...(cc || [])];
  const has = (needle) =>
    out.some((c) => clean(c?.org).toLowerCase().includes(clean(needle).toLowerCase()));

  // Always PCC
  if (!has("public complaints commission")) {
    out.push({ org: "Public Complaints Commission" });
  }

  // Add sector hints based on complaint language (broad, not risky)
  const t = clean(description).toLowerCase();

  if (/(rights|abuse|detention|torture|assault|unlawful arrest|illegal arrest|police|extortion|bribe)/i.test(t)) {
    if (!has("human rights")) {
      out.push({ org: "National Human Rights Commission Nigeria" });
    }
  }

  if (/(hospital|doctor|medical|health|clinic|patient|nurse)/i.test(t)) {
    if (!has("medical and dental")) {
      out.push({ org: "Medical and Dental Council of Nigeria" });
    }
  }

  return uniqueByOrg(out);
}

function buildRouting(description) {
  const sector = detectSector(description);
  const routing = {
    sector: sector?.sector || null,
    primary: sector?.federal_primary ? { org: sector.federal_primary } : null,
    through: sector?.state_through ? { org: sector.state_through } : null,
    cc: [],
    subject: "FORMAL COMPLAINT / PETITION",
  };

  // Sector-provided CC
  if (Array.isArray(sector?.mandatory_cc)) {
    routing.cc = sector.mandatory_cc.map((x) => ({ org: String(x) }));
  }

  routing.cc = enforceMandatoryCC(routing.cc, description);
  return routing;
}

/**
 * Decorate "Through" line using inferred state/FCT so it doesn't look incomplete.
 * This does NOT invent officials, addresses, or unit names beyond state/FCT context.
 */
function decorateThroughOrg(rawThroughOrg, inferredState) {
  const throughOrg = clean(rawThroughOrg);
  const st = clean(inferredState);

  if (!throughOrg) return throughOrg;
  if (!st) return throughOrg;

  const isFCT = st.toLowerCase().includes("fct");
  const stateLabel = isFCT ? "FCT, Abuja" : st;

  if (throughOrg.toLowerCase().includes("state police command")) {
    if (isFCT) return "FCT Police Command / Commissioner of Police (FCT, Abuja)";
    return `${stateLabel} State Police Command / Commissioner of Police (${stateLabel} State)`;
  }

  if (throughOrg.toLowerCase().startsWith("state ministry")) {
    if (isFCT) return throughOrg.replace(/^State\s+/i, "FCT ");
    return `${stateLabel} ${throughOrg}`;
  }

  if (/\bstate\b/i.test(throughOrg) && !/federal/i.test(throughOrg)) {
    if (isFCT && !/fct/i.test(throughOrg))
      return `FCT ${throughOrg.replace(/\bState\b/i, "").trim()}`.trim();
    if (!isFCT) return throughOrg.replace(/\bState\b/i, `${stateLabel} State`);
  }

  return throughOrg;
}

function buildRoutingSummary(primary, through, cc) {
  const parts = [];
  if (primary?.org) parts.push(`Primary: ${primary.org}`);
  if (through?.org) parts.push(`Through: ${through.org}`);
  if (cc?.length) parts.push(`CC: ${cc.map((x) => x.org).filter(Boolean).join(", ")}`);
  return parts.join(" | ");
}

/* =========================
   Deterministic legal template (fallback-safe)
========================= */
function formatDate() {
  try {
    return new Date().toLocaleDateString("en-NG", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch (_) {
    return new Date().toDateString();
  }
}

/* =========================
   AI PRE-ANALYSIS (95% driver)
   - AI reads complaint first, extracts facts, classifies, recommends subject/reliefs.
   - MUST NOT invent names/addresses/case numbers.
   - Returns a safe JSON analysis object or fallback heuristics.
========================= */
function fallbackAnalysis(description = "") {
  const t = clean(description).toLowerCase();
  const out = {
    case_type: "general complaint",
    severity: "medium",
    key_facts: [],
    missing_info: ["date", "time", "exact location", "names of officers/units (if known)", "evidence"],
    recommended_subject: "FORMAL COMPLAINT / PETITION",
    recommended_reliefs: [
      "Immediate investigation and written findings",
      "Accountability measures where wrongdoing is established",
      "Written acknowledgement and a clear timeline for resolution",
    ],
    routing_keywords: [],
  };

  if (/(unlawful arrest|illegal arrest|arrested|detention|police|extortion|bribe)/i.test(t)) {
    out.case_type = "police misconduct / unlawful arrest / extortion";
    out.severity = "high";
    out.routing_keywords.push("police", "unlawful arrest", "extortion", "bribe");
    out.recommended_subject = "FORMAL COMPLAINT ON ALLEGED UNLAWFUL ARREST, EXTORTION AND MISCONDUCT";
  }

  if (/(torture|assault|beaten|injury)/i.test(t)) {
    out.severity = "high";
    out.routing_keywords.push("assault", "torture");
  }

  return out;
}

async function analyzeComplaintAI({ complainant, description, inferredState }) {
  const base = fallbackAnalysis(description);
  if (!openai) return base;

  const system = [
    "You are a senior Nigerian legal triage analyst.",
    "Your task: read the complaint and produce a STRICT JSON object for internal routing and drafting.",
    "Do NOT draft the letter here. ONLY analysis.",
    "Do NOT invent addresses, names, unit names, dates, or case numbers.",
    "If facts are missing, list them under missing_info.",
    "Return ONLY valid JSON (no markdown, no commentary).",
  ].join(" ");

  const schemaHint = {
    case_type: "short label like: police misconduct / banking dispute / medical negligence / employment / tenancy / consumer / cybercrime / etc",
    severity: "low | medium | high",
    key_facts: ["bullet-like strings"],
    missing_info: ["what is needed to strengthen the petition"],
    recommended_subject: "a strong formal subject line",
    recommended_reliefs: ["3-7 reliefs tailored to the complaint"],
    routing_keywords: ["extra keywords that help sector matching"],
  };

  const userPayload = {
    complainant: {
      fullName: clean(complainant?.fullName),
      address: clean(complainant?.address),
    },
    inferred_state_or_fct: inferredState || null,
    complaint_description: clean(description),
    output_format: schemaHint,
  };

  try {
    const resp = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.1,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
    });

    const raw = (resp?.choices?.[0]?.message?.content || "").trim();
    if (!raw) return base;

    // Try parse JSON safely
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      // If AI returned extra text, try extract JSON block
      const m = raw.match(/\{[\s\S]*\}$/);
      if (m) {
        try { parsed = JSON.parse(m[0]); } catch (_) { parsed = null; }
      }
    }

    if (!parsed || typeof parsed !== "object") return base;

    // Sanitize
    const out = {
      case_type: clean(parsed.case_type) || base.case_type,
      severity: ["low","medium","high"].includes(String(parsed.severity || "").toLowerCase())
        ? String(parsed.severity).toLowerCase()
        : base.severity,
      key_facts: Array.isArray(parsed.key_facts) ? parsed.key_facts.map(clean).filter(Boolean).slice(0, 12) : base.key_facts,
      missing_info: Array.isArray(parsed.missing_info) ? parsed.missing_info.map(clean).filter(Boolean).slice(0, 12) : base.missing_info,
      recommended_subject: clean(parsed.recommended_subject) || base.recommended_subject,
      recommended_reliefs: Array.isArray(parsed.recommended_reliefs)
        ? parsed.recommended_reliefs.map(clean).filter(Boolean).slice(0, 10)
        : base.recommended_reliefs,
      routing_keywords: Array.isArray(parsed.routing_keywords)
        ? parsed.routing_keywords.map(clean).filter(Boolean).slice(0, 20)
        : base.routing_keywords,
    };

    return out;
  } catch (err) {
    console.warn("[A8] AI analysis failed, using fallback analysis:", err?.message || err);
    return base;
  }
}

/* =========================
   Deterministic fallback petition
   - Now uses analysis to improve structure even without OpenAI
========================= */
function buildDeterministicPetition({ complainant, description, routing, inferredState, analysis }) {
  const fullName = clean(complainant?.fullName) || "A Concerned Citizen";
  const email = clean(complainant?.email);
  const phone = clean(complainant?.phone);
  const address = clean(complainant?.address);

  const primaryOrg = clean(routing?.primary?.org) || "The Appropriate Authority";
  const throughRaw = clean(routing?.through?.org);
  const throughOrg = decorateThroughOrg(throughRaw, inferredState);

  const ccList = uniqueByOrg(routing?.cc || []);
  const subject = clean(routing?.subject) || "FORMAL COMPLAINT / PETITION";

  const a = analysis || fallbackAnalysis(description);

  const lines = [];

  // Sender block
  if (fullName) lines.push(fullName);
  if (address) lines.push(address);
  if (email) lines.push(`Email: ${email}`);
  if (phone) lines.push(`Phone: ${phone}`);
  lines.push("");
  lines.push(formatDate());
  lines.push("");

  // Addressee
  lines.push(primaryOrg);
  if (throughOrg) lines.push(`Through: ${throughOrg}`);
  lines.push("");

  // CC block
  if (ccList.length) {
    lines.push("CC:");
    for (const c of ccList) lines.push(`- ${c.org}`);
    lines.push("");
  }

  // Subject
  lines.push(`Subject: ${subject}`);
  lines.push("");

  // Salutation
  lines.push("Dear Sir/Madam,");
  lines.push("");

  // Body
  lines.push("I write to formally lodge this complaint and request your urgent intervention in respect of the matter described below.");
  lines.push("");

  lines.push("BACKGROUND / SUMMARY");
  lines.push(`- ${clean(description)}`);
  if (a?.case_type) lines.push(`- Case Type (for clarity): ${clean(a.case_type)}`);
  lines.push("");

  lines.push("FACTS / ISSUES");
  if (Array.isArray(a?.key_facts) && a.key_facts.length) {
    for (const f of a.key_facts) lines.push(`- ${clean(f)}`);
  } else {
    lines.push("- [Insert date], [insert time], [insert exact location].");
    lines.push("- Identify the officers/officials involved (names, units, or description if names unknown).");
    lines.push("- State what was demanded/said/done and any threats, detention, or harm.");
  }
  lines.push("");

  lines.push("RELIEFS SOUGHT");
  const rel = Array.isArray(a?.recommended_reliefs) && a.recommended_reliefs.length
    ? a.recommended_reliefs
    : [
        "Immediate investigation and written findings.",
        "Appropriate corrective action and accountability measures where wrongdoing is established.",
        "Clear timeline for resolution and feedback to the complainant.",
      ];
  for (const r of rel) lines.push(`- ${clean(r)}`);
  lines.push("");

  lines.push("REQUEST FOR ACKNOWLEDGEMENT");
  lines.push("I respectfully request a written acknowledgement of receipt of this petition and a reference number (where applicable), as well as a timeline for response.");
  lines.push("");

  if (Array.isArray(a?.missing_info) && a.missing_info.length) {
    lines.push("NOTE (INFORMATION TO ADD IF AVAILABLE)");
    for (const mi of a.missing_info) lines.push(`- ${clean(mi)}`);
    lines.push("");
  }

  lines.push("Yours faithfully,");
  lines.push(fullName);

  return lines.join("\n");
}

/* =========================
   AI petition drafting (AI takes front seat)
   - Uses analysis output
   - Guardrails: do not invent addresses/names/case numbers
========================= */
async function buildAIPetition({ complainant, description, routing, inferredState, analysis }) {
  const base = buildDeterministicPetition({ complainant, description, routing, inferredState, analysis });
  if (!openai) return base;

  const primaryOrg = clean(routing?.primary?.org) || "The Appropriate Authority";
  const throughRaw = clean(routing?.through?.org);
  const throughOrg = decorateThroughOrg(throughRaw, inferredState);
  const ccOrgs = uniqueByOrg(routing?.cc || []).map((x) => x.org).filter(Boolean);

  const a = analysis || fallbackAnalysis(description);

  const system = [
    "You are a senior Nigerian legal drafting assistant.",
    "AI-FIRST RULE: Use the analysis object as the main driver for the letter.",
    "Write a professional, formal petition/complaint letter suitable for submission.",
    "Keep it factual, structured, and legally cautious (no case law citations).",
    "Do NOT invent addresses, names of officials, unit names, dates, or case numbers.",
    "Use ONLY the provided agencies exactly as the addressee/through/cc.",
    "If some facts are missing, include short neutral placeholders like [insert date].",
    "Output ONLY the letter (no markdown).",
  ].join(" ");

  const user = {
    complainant: {
      fullName: clean(complainant?.fullName),
      email: clean(complainant?.email),
      phone: clean(complainant?.phone),
      address: clean(complainant?.address),
    },
    date: formatDate(),
    inferred_state_or_fct: inferredState || null,
    agencies: {
      addressee_primary: primaryOrg,
      through: throughOrg || null,
      cc: ccOrgs,
    },
    analysis: a,
    subject: clean(routing?.subject || a?.recommended_subject || "FORMAL COMPLAINT / PETITION"),
    complaint_description: clean(description),
    required_sections: [
      "Background/Summary",
      "Facts/Issues",
      "Reliefs sought",
      "Request for acknowledgement and timeline",
      "Closing",
    ],
  };

  try {
    const resp = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(user) },
      ],
    });

    const text = resp?.choices?.[0]?.message?.content || "";
    const out = text.trim();
    return out.length > 200 ? out : base;
  } catch (err) {
    console.warn("[A8] OpenAI generation failed, using deterministic fallback:", err?.message || err);
    return base;
  }
}

/* =========================
   MAIN
========================= */
async function generatePetitionA8(args = {}) {
  const descriptionRaw = clean(args.description || "");
  const complainant = args.complainant || {};
  const paid = args.paid === true;

  if (!descriptionRaw || descriptionRaw.length < 10) {
    throw new Error("Description too short.");
  }

  // Infer state/FCT from complainant address + description (best effort)
  const inferredState =
    inferStateFromText(`${complainant?.address || ""} ${descriptionRaw}`) ||
    inferStateFromText(descriptionRaw) ||
    inferStateFromText(complainant?.address || "") ||
    null;

  // 1) AI PRE-ANALYSIS (95% driver)
  const analysis = await analyzeComplaintAI({ complainant, description: descriptionRaw, inferredState });

  // 2) STRUCTURE/LOGIC (5% guardrail) — keep routing logic, but let analysis help matching
  //    We DO NOT replace your routing; we only "assist" it by adding safe keywords for detection.
  const assistedDescription = [descriptionRaw, ...(analysis?.routing_keywords || [])].join(" ").trim();
  const routing = buildRouting(assistedDescription);

  // Subject preference: analysis suggestion if present (still safe)
  if (analysis?.recommended_subject) routing.subject = clean(analysis.recommended_subject) || routing.subject;

  // Decorate through using inferred state (for better letter quality)
  if (routing?.through?.org) {
    routing.through.org = decorateThroughOrg(routing.through.org, inferredState);
  }

  // 3) AI drafts petition using analysis, deterministic fallback if needed
  const fullPetition = await buildAIPetition({
    complainant,
    description: descriptionRaw,
    routing,
    inferredState,
    analysis,
  });

  // Locking (unchanged behavior)
  const previewLimit = 900;
  const petitionText = paid
    ? fullPetition
    : fullPetition.slice(0, previewLimit) +
      `\n\n🔒 FULL PETITION LOCKED\nPay ₦${PRICE.toLocaleString("en-NG")} to unlock full access.`;

  return {
    petitionText,
    primaryInstitution: routing.primary,
    throughInstitution: routing.through,
    ccList: paid ? routing.cc : (routing.cc || []).slice(0, 2),
    routingSummary: buildRoutingSummary(routing.primary, routing.through, routing.cc),
    subject: routing.subject,
    inferredState: inferredState,
    analysis: paid ? analysis : undefined, // keep analysis internal unless you want to show it
    access: {
      paid,
      price: PRICE,
      currency: CURRENCY,
      canViewFull: paid,
      canCopy: paid,
      canDownloadPdf: paid,
      canEmail: paid,
    },
  };
}

module.exports = { generatePetitionA8 };

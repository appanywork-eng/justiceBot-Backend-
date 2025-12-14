/**
 * A8 Petition Engine (AI-first, fallback-safe)
 * - Uses data/sector_map.json to route (primary/through/cc)
 * - Builds a proper legal-style petition text
 * - If OPENAI_API_KEY is set, enriches the petition using AI
 * - Preview locking: unpaid => short preview + lock line
 */

const fs = require("fs");
const path = require("path");

let OpenAI = null;
try {
  OpenAI = require("openai").OpenAI || require("openai"); // supports different exports
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
    return JSON.parse(raw);
  } catch (e) {
    console.warn("[A8] sector_map.json not found/invalid:", e?.message || e);
    return null;
  }
}
const SECTOR_MAP = loadSectorMap();

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
    console.warn("[A8] OPENAI_API_KEY not set - fallback mode");
  }
} catch (err) {
  console.warn("[A8] OpenAI init error:", err?.message || err);
  openai = null;
}

/* =========================
   Helpers
========================= */
const safeString = (v) => (typeof v === "string" ? v : "");
const clean = (s) => safeString(s).replace(/\s+/g, " ").trim();

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

/* =========================
   Routing using sector_map.json
========================= */
function detectSector(description = "") {
  if (!SECTOR_MAP?.sectors?.length) return null;
  const text = description.toLowerCase();

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
  const has = (needle) => out.some((c) => clean(c.org).toLowerCase().includes(needle));

  // Always PCC
  if (!has("public complaints commission")) {
    out.push({ org: "Public Complaints Commission", title: "Public Complaints Commission" });
  }

  // Add sector hints
  const t = description.toLowerCase();
  if (/(rights|abuse|detention|torture|assault|negligence)/i.test(t)) {
    if (!has("human rights")) {
      out.push({ org: "National Human Rights Commission Nigeria", title: "National Human Rights Commission" });
    }
  }
  if (/(hospital|doctor|medical|health|clinic|patient)/i.test(t)) {
    if (!has("medical and dental")) {
      out.push({ org: "Medical and Dental Council of Nigeria", title: "MDCN" });
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
  return new Date().toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" });
}

function buildDeterministicPetition({ complainant, description, routing }) {
  const fullName = clean(complainant?.fullName) || "A Concerned Citizen";
  const email = clean(complainant?.email);
  const phone = clean(complainant?.phone);
  const address = clean(complainant?.address);

  const lines = [];
  if (fullName) lines.push(fullName);
  if (address) lines.push(address);
  if (phone) lines.push(`Phone: ${phone}`);
  if (email) lines.push(`Email: ${email}`);
  lines.push("");
  lines.push(formatDate());
  lines.push("");

  const primaryLine = routing?.primary?.org ? `The Head of ${routing.primary.org}` : "The Appropriate Authority";
  lines.push(primaryLine);

  // Optional "Through"
  if (routing?.through?.org) {
    lines.push(`Through: ${routing.through.org}`);
  }

  // CC block
  if (routing?.cc?.length) {
    lines.push("CC:");
    for (const c of routing.cc) lines.push(`- ${c.org}`);
  }

  lines.push("");
  lines.push(`SUBJECT: ${routing?.subject || "FORMAL COMPLAINT / PETITION"}`);
  lines.push("");

  // Body (structured)
  lines.push("I write to formally lodge this complaint and request urgent intervention regarding the matter stated below:");
  lines.push("");
  lines.push("1) SUMMARY OF COMPLAINT");
  lines.push(`- ${clean(description)}`);
  lines.push("");
  lines.push("2) WHY THIS MATTER REQUIRES URGENT ACTION");
  lines.push("- This conduct amounts to service failure and may endanger citizens and violate applicable duties of care.");
  lines.push("");
  lines.push("3) RELIEFS SOUGHT");
  lines.push("- Immediate investigation and written findings.");
  lines.push("- Immediate restoration/continuation of proper service delivery.");
  lines.push("- Disciplinary action where wrongdoing is established.");
  lines.push("- Clear timeline for resolution and feedback to the complainant.");
  lines.push("");
  lines.push("I kindly request acknowledgment of receipt and updates on actions taken.");
  lines.push("");
  lines.push("Yours faithfully,");
  lines.push(fullName);

  return lines.join("\n");
}

/* =========================
   AI enhancement
========================= */
async function buildAIPetition({ complainant, description, routing }) {
  // If no OpenAI, return deterministic (still full, still structured)
  const base = buildDeterministicPetition({ complainant, description, routing });
  if (!openai) return base;

  const primary = routing?.primary?.org || "The Appropriate Authority";
  const through = routing?.through?.org || "";
  const cc = (routing?.cc || []).map((x) => x.org).filter(Boolean);

  const system = [
    "You are a senior Nigerian legal drafting assistant.",
    "Write a professional, formal petition/complaint letter in Nigerian context.",
    "Keep it factual, structured, and suitable for submission to agencies.",
    "Do NOT invent addresses, names of officials, or case numbers.",
    "Use the provided routing agencies exactly as addressees/CC.",
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
    addressee_primary: primary,
    through: through || null,
    cc,
    subject: routing?.subject || "FORMAL COMPLAINT / PETITION",
    complaint_description: clean(description),
    required_sections: [
      "Background/summary",
      "Facts/Issues",
      "Applicable duty/standard (general, no citations if unsure)",
      "Reliefs sought",
      "Request for acknowledgment and timeline",
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
    console.warn("[A8] OpenAI generation failed, using deterministic:", err?.message || err);
    return base;
  }
}

/* =========================
   MAIN
========================= */
async function generatePetitionA8(args = {}) {
  const description = clean(args.description || "");
  const complainant = args.complainant || {};
  const paid = args.paid === true;

  if (!description || description.length < 10) {
    throw new Error("Description too short.");
  }

  // Build routing from sector map
  const routing = buildRouting(description);

  // Build petition (AI-first, deterministic fallback)
  const fullPetition = await buildAIPetition({ complainant, description, routing });

  // Locking
  const previewLimit = 900; // show more than your current 2 lines
  const petitionText = paid
    ? fullPetition
    : fullPetition.slice(0, previewLimit) +
      "\n\n🔒 FULL PETITION LOCKED\nPay ₦1,150 to unlock full access.";

  return {
    petitionText,
    primaryInstitution: routing.primary,
    throughInstitution: routing.through,
    ccList: paid ? routing.cc : routing.cc.slice(0, 2),
    routingSummary: buildRoutingSummary(routing.primary, routing.through, routing.cc),
    subject: routing.subject,
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

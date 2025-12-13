/**
 * core/aiRouting.js
 * Entity-first routing engine (PDPS 2.7)
 *
 * Goals:
 *  - Entity-first: the complained-about entity should become PRIMARY whenever possible.
 *  - AI-assisted: use aiAuthorityGraph when OpenAI is available.
 *  - Safe fallbacks: never hijack routing with static generic bodies.
 *  - PCC is NEVER PRIMARY unless explicitly referenced by user.
 *  - Dynamic CC: add oversight bodies based on sector + severity.
 */

const { getAuthorityGraph } = require("./aiAuthorityGraph");
let classifySeverity;

try {
  ({ classifySeverity } = require("./aiSeverity"));
} catch (e) {
  try {
    ({ classifySeverity } = require("./aiSeverity.js"));
  } catch (e2) {
    console.warn("⚠️ aiSeverity module not found, using fallback");
    classifySeverity = (text = "") => {
      const t = text.toLowerCase();

      if (
        t.includes("refusing to treat") ||
        t.includes("detained") ||
        t.includes("assault") ||
        t.includes("abuse") ||
        t.includes("death") ||
        t.includes("life threatening")
      ) {
        return { level: "high", score: 0.8 };
      }

      if (
        t.includes("delay") ||
        t.includes("complaint") ||
        t.includes("unprofessional")
      ) {
        return { level: "medium", score: 0.5 };
      }

      return { level: "low", score: 0.2 };
    };
  }
}

/** -----------------------------
 *  Helpers
 * ------------------------------*/

function cleanStr(v) {
  return (v || "").toString().trim();
}

function uniqAuthorities(list) {
  const seen = new Set();
  const out = [];
  for (const a of list || []) {
    const key = JSON.stringify({
      name: cleanStr(a?.name || a),
      level: cleanStr(a?.level),
      country: cleanStr(a?.country),
      state: cleanStr(a?.state),
      city: cleanStr(a?.city),
    }).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(normalizeAuthority(a));
  }
  return out;
}

function normalizeAuthority(a) {
  if (!a) return null;
  if (typeof a === "string") return { name: a };
  return {
    name: cleanStr(a.name),
    role: cleanStr(a.role),
    level: cleanStr(a.level), // e.g. "local" | "state" | "federal" | "international"
    country: cleanStr(a.country),
    state: cleanStr(a.state),
    city: cleanStr(a.city),
    address: cleanStr(a.address),
    email: cleanStr(a.email),
    phone: cleanStr(a.phone),
    notes: cleanStr(a.notes),
  };
}

function containsWord(text, word) {
  return new RegExp(`\\b${word}\\b`, "i").test(text || "");
}

/**
 * Very light entity extraction fallback (non-AI).
 * It is intentionally conservative: only tries to catch obvious org names.
 */
function extractEntityFallback(text) {
  const t = cleanStr(text);
  // Common org patterns
  const patterns = [
    /(general hospital|teaching hospital|medical centre|clinic)\b[^.\n]*/i,
    /\b([A-Z][A-Za-z&.\- ]+)\s+(Police Command|Police Station|Area Command)\b/i,
    /\b(guaranty trust bank|gtbank|zenith bank|access bank|first bank|uba|ecobank|fidelity bank|union bank|stanbic ibtc|sterling bank|wema bank|polaris bank)\b[^.\n]*/i,
    /\b(ministry of health|ministry of education|ministry of transportation|ministry of aviation|ministry of works|ministry of environment|ministry of justice)\b[^.\n]*/i,
    /\b(national agency|federal ministry|commission|authority|board|corporation)\b[^.\n]*/i,
  ];

  for (const p of patterns) {
    const m = t.match(p);
    if (m && m[0]) return cleanStr(m[0]);
  }

  return "";
}

/**
 * Basic sector inference fallback
 */
function inferSectorFallback(text) {
  const t = cleanStr(text).toLowerCase();

  const buckets = [
    { sector: "health", keys: ["hospital", "clinic", "doctor", "nurse", "medical", "patient", "treatment", "refusing to treat", "pharmacy"] },
    { sector: "police", keys: ["police", "detained", "arrest", "cell", "bail", "station", "officer", "extortion"] },
    { sector: "banking", keys: ["bank", "transfer", "reversed", "atm", "debit", "credit", "transaction", "pos", "chargeback"] },
    { sector: "power", keys: ["disco", "meter", "electricity", "power", "billing", "estimated", "token", "transformer"] },
    { sector: "telecom", keys: ["network", "sim", "ncc", "data", "airtime", "mtn", "glo", "airtel", "9mobile"] },
    { sector: "transport", keys: ["road", "vehicle", "transport", "train", "aviation", "flight", "airport", "maritime", "ship", "port"] },
    { sector: "education", keys: ["school", "university", "student", "waec", "jamb", "tuition", "exam"] },
    { sector: "housing", keys: ["land", "rent", "tenant", "landlord", "estate", "plot", "housing", "development control"] },
    { sector: "human_rights", keys: ["human rights", "torture", "abuse", "harassment", "assault", "discrimination"] },
  ];

  for (const b of buckets) {
    if (b.keys.some(k => t.includes(k))) return b.sector;
  }

  return "general";
}

/**
 * Minimal location inference fallback: tries to detect "in <State>" or "<State> state"
 */
function inferStateFallback(text) {
  const t = cleanStr(text);
  const m = t.match(/\b(in|at)\s+([A-Za-z.\- ]+?)\s+(state)\b/i) || t.match(/\b([A-Za-z.\- ]+)\s+State\b/i);
  if (!m) return "";
  // best effort: pick last captured group that looks like a name
  const candidate = (m[2] || m[1] || "").replace(/\bstate\b/i, "").trim();
  return candidate;
}

/**
 * Guard: PCC / Ombudsman-like bodies must never be PRIMARY unless explicitly mentioned.
 */
function isGenericOversightBody(name) {
  const n = cleanStr(name).toLowerCase();
  if (!n) return false;
  return (
    n.includes("public complaints commission") ||
    n === "pcc" ||
    n.includes("ombudsman") ||
    n.includes("human rights commission") ||
    n.includes("nhcr") ||
    n.includes("public protector")
  );
}

function userExplicitlyMentions(text, authorityName) {
  const t = cleanStr(text).toLowerCase();
  const a = cleanStr(authorityName).toLowerCase();
  if (!t || !a) return false;
  // allow abbreviations for PCC/NHRC
  if (a.includes("public complaints commission")) return t.includes("public complaints commission") || containsWord(t, "pcc");
  if (a.includes("human rights commission")) return t.includes("human rights commission") || containsWord(t, "nhrc");
  return t.includes(a);
}

/** -----------------------------
 *  Sector routing policies
 * ------------------------------*/

function getSectorPolicy(sector) {
  const policies = {
    health: {
      through: (ctx) => [
        ctx.state ? { name: `${ctx.state} State Ministry of Health`, level: "state", country: ctx.country || "Nigeria", state: ctx.state } : null,
        { name: "Federal Ministry of Health", level: "federal", country: ctx.country || "Nigeria" },
      ],
      ccHigh: (ctx) => [
        { name: "Medical and Dental Council of Nigeria (MDCN)", level: "federal", country: ctx.country || "Nigeria" },
        { name: "National Human Rights Commission (NHRC)", level: "federal", country: ctx.country || "Nigeria" },
      ],
    },

    banking: {
      through: (ctx) => [
        { name: "Head Office (Customer Experience / Compliance)", level: "corporate", country: ctx.country || "Nigeria" },
      ],
      ccHigh: (ctx) => [
        { name: "Central Bank of Nigeria (CBN)", level: "federal", country: ctx.country || "Nigeria" },
        { name: "Nigeria Deposit Insurance Corporation (NDIC)", level: "federal", country: ctx.country || "Nigeria" },
      ],
      ccMed: (ctx) => [
        { name: "Central Bank of Nigeria (CBN)", level: "federal", country: ctx.country || "Nigeria" },
      ],
    },

    police: {
      through: (ctx) => [
        { name: "Inspector-General of Police, Nigeria Police Force", level: "federal", country: ctx.country || "Nigeria" },
      ],
      ccHigh: (ctx) => [
        { name: "Police Service Commission (PSC)", level: "federal", country: ctx.country || "Nigeria" },
        { name: "National Human Rights Commission (NHRC)", level: "federal", country: ctx.country || "Nigeria" },
      ],
    },

    power: {
      through: (ctx) => [
        ctx.state ? { name: `${ctx.state} State Electricity/Consumer Protection Desk`, level: "state", country: ctx.country || "Nigeria", state: ctx.state } : null,
      ],
      ccHigh: (ctx) => [
        { name: "Nigerian Electricity Regulatory Commission (NERC)", level: "federal", country: ctx.country || "Nigeria" },
      ],
      ccMed: (ctx) => [
        { name: "Nigerian Electricity Regulatory Commission (NERC)", level: "federal", country: ctx.country || "Nigeria" },
      ],
    },

    telecom: {
      through: (ctx) => [],
      ccHigh: (ctx) => [
        { name: "Nigerian Communications Commission (NCC)", level: "federal", country: ctx.country || "Nigeria" },
      ],
      ccMed: (ctx) => [
        { name: "Nigerian Communications Commission (NCC)", level: "federal", country: ctx.country || "Nigeria" },
      ],
    },

    housing: {
      through: (ctx) => [
        ctx.state ? { name: `${ctx.state} State Urban & Regional Planning / Development Control`, level: "state", country: ctx.country || "Nigeria", state: ctx.state } : null,
      ],
      ccHigh: (ctx) => [
        { name: "Federal Ministry of Works & Housing (or relevant Housing Authority)", level: "federal", country: ctx.country || "Nigeria" },
      ],
    },

    human_rights: {
      through: (ctx) => [],
      ccHigh: (ctx) => [
        { name: "National Human Rights Commission (NHRC)", level: "federal", country: ctx.country || "Nigeria" },
      ],
      // PCC can be CC if user wants administrative redress, but never primary by default.
      ccMed: (ctx) => [
        { name: "National Human Rights Commission (NHRC)", level: "federal", country: ctx.country || "Nigeria" },
      ],
    },

    general: {
      through: (ctx) => [],
      ccHigh: (ctx) => [
        // DO NOT auto-add PCC here as primary/through.
        { name: "National Human Rights Commission (NHRC)", level: "federal", country: ctx.country || "Nigeria" },
      ],
    },
  };

  return policies[sector] || policies.general;
}

/** -----------------------------
 *  Core routing decision builder
 * ------------------------------*/

/**
 * Given AI graph + fallbacks, decide:
 *  - primary: MUST be entity-first (the complained-about org)
 *  - through: escalation chain
 *  - cc: oversight agencies, severity-driven
 */
function buildDecision({ text, aiGraph }) {
  const t = cleanStr(text);

  const jurisdiction = aiGraph?.jurisdiction || {};
  const country = cleanStr(jurisdiction.country) || (t.toLowerCase().includes("rwanda") ? "Rwanda" : "Nigeria");
  const state = cleanStr(jurisdiction.state_or_region) || inferStateFallback(t);
  const city = cleanStr(jurisdiction.city_or_locality);

  // sector
  const sector = cleanStr(aiGraph?.sector) || inferSectorFallback(t);

  // severity
  const severity = classifySeverity(t); // expected: { level: "low|medium|high|critical", score, reasons[] }
  const sevLevel = cleanStr(severity?.level || "medium").toLowerCase();

  const ctx = { country, state, city, sector, severity: sevLevel };

  // AI suggested entities/authorities
  const identifiedEntities = Array.isArray(aiGraph?.entities_identified) ? aiGraph.entities_identified : [];

  const authorityGraph = aiGraph?.authority_graph || {};
  const aiPrimary = uniqAuthorities(authorityGraph.primary || []);
  const aiSecondary = uniqAuthorities(authorityGraph.secondary || []);
  const aiCC = uniqAuthorities(authorityGraph.oversight_or_cc || []);

  // Fallback entity
  const fallbackEntity = extractEntityFallback(t);

  /** ENTITY-FIRST PRIMARY SELECTION:
   * Priority:
   *  1) AI Primary that is NOT generic oversight body (PCC/NHRC) unless user explicitly asked for it
   *  2) AI Secondary (same guard)
   *  3) identified entity name
   *  4) fallback extracted entity
   */
  function pickEntityFirstPrimary() {
    const candidates = [...aiPrimary, ...aiSecondary].filter(Boolean);

    for (const c of candidates) {
      const nm = cleanStr(c.name);
      if (!nm) continue;

      if (isGenericOversightBody(nm) && !userExplicitlyMentions(t, nm)) {
        continue;
      }
      return normalizeAuthority(c);
    }

    // Try identified entities
    for (const e of identifiedEntities) {
      const nm = cleanStr(e?.name || e);
      if (!nm) continue;

      if (isGenericOversightBody(nm) && !userExplicitlyMentions(t, nm)) {
        continue;
      }
      return { name: nm, country, state, city, level: state ? "state" : "local" };
    }

    if (fallbackEntity) {
      if (!isGenericOversightBody(fallbackEntity) || userExplicitlyMentions(t, fallbackEntity)) {
        return { name: fallbackEntity, country, state, city, level: state ? "state" : "local" };
      }
    }

    // last resort: NEVER PCC. Use a neutral placeholder ministry depending on sector
    if (sector === "health") {
      return { name: state ? `${state} State Ministry of Health` : "Federal Ministry of Health", country, state, city, level: state ? "state" : "federal" };
    }
    if (sector === "police") {
      return { name: state ? `${state} State Police Command` : "Nigeria Police Force", country, state, city, level: state ? "state" : "federal" };
    }
    if (sector === "banking") {
      return { name: "Bank Customer Care / Compliance Unit", country, state, city, level: "corporate" };
    }

    return { name: state ? `${state} State Government (Relevant Ministry/Agency)` : "Relevant Government Authority", country, state, city, level: state ? "state" : "federal" };
  }

  const primary = pickEntityFirstPrimary();

  // THROUGH + CC policies
  const policy = getSectorPolicy(sector);
  let through = uniqAuthorities((policy.through ? policy.through(ctx) : [])).filter(Boolean);

  // If AI provided a sensible escalation chain and it is not generic oversight as primary, allow it as THROUGH
  // (but still de-duplicate and keep policy ones first).
  const aiThroughFiltered = aiSecondary.filter(a => {
    const nm = cleanStr(a?.name);
    if (!nm) return false;
    // do not add the same as primary
    if (nm.toLowerCase() === cleanStr(primary?.name).toLowerCase()) return false;
    // allow oversight bodies in THROUGH only if user explicitly mentions them
    if (isGenericOversightBody(nm) && !userExplicitlyMentions(t, nm)) return false;
    return true;
  });

  through = uniqAuthorities([...through, ...aiThroughFiltered]).filter(Boolean);

  // CC based on severity
  let cc = [];

  // AI CC suggestions, filtered
  const aiCcFiltered = aiCC.filter(a => {
    const nm = cleanStr(a?.name);
    if (!nm) return false;
    // never allow PCC in CC unless user or policy or high severity wants it (we still allow NHRC, etc.)
    // PCC is allowed in CC on general admin redress, but do not force it here.
    if (nm.toLowerCase().includes("public complaints commission") && !userExplicitlyMentions(t, "public complaints commission")) return false;
    return true;
  });

  cc = [...cc, ...aiCcFiltered];

  if (sevLevel === "critical" || sevLevel === "high") {
    cc = [...cc, ...(policy.ccHigh ? policy.ccHigh(ctx) : [])];
  } else if (sevLevel === "medium") {
    cc = [...cc, ...(policy.ccMed ? policy.ccMed(ctx) : [])];
  }

  // FINAL PCC SAFETY: remove PCC from PRIMARY if it sneaks in
  if (primary?.name && isGenericOversightBody(primary.name) && !userExplicitlyMentions(t, primary.name)) {
    // replace with sector neutral fallback
    const safePrimary = (() => {
      if (sector === "health") return { name: state ? `${state} State Ministry of Health` : "Federal Ministry of Health", country, state, city, level: state ? "state" : "federal" };
      if (sector === "police") return { name: state ? `${state} State Police Command` : "Nigeria Police Force", country, state, city, level: state ? "state" : "federal" };
      if (sector === "banking") return { name: "Bank Customer Care / Compliance Unit", country, state, city, level: "corporate" };
      return { name: state ? `${state} State Government (Relevant Ministry/Agency)` : "Relevant Government Authority", country, state, city, level: state ? "state" : "federal" };
    })();
    primary.name = safePrimary.name;
    primary.level = safePrimary.level;
    primary.country = safePrimary.country;
    primary.state = safePrimary.state;
    primary.city = safePrimary.city;
  }

  // De-dup and remove anything that equals primary
  cc = uniqAuthorities(cc)
    .filter(Boolean)
    .filter(a => cleanStr(a.name).toLowerCase() !== cleanStr(primary?.name).toLowerCase());

  // Optional: if through accidentally contains primary, remove
  through = uniqAuthorities(through)
    .filter(Boolean)
    .filter(a => cleanStr(a.name).toLowerCase() !== cleanStr(primary?.name).toLowerCase());

  // confidence
  const overall_confidence =
    typeof aiGraph?.overall_confidence === "number" && aiGraph.overall_confidence > 0
      ? aiGraph.overall_confidence
      : (primary?.name ? 0.68 : 0.45);

  return {
    jurisdiction: {
      country,
      state_or_region: state,
      city_or_locality: city,
    },
    sector,
    severity: severity || { level: sevLevel },
    entities_identified: identifiedEntities,
    authority_graph: {
      primary: primary ? [primary] : [],
      through,
      cc,
    },
    routing_notes: cleanStr(aiGraph?.routing_notes) || "",
    overall_confidence,
  };
}

/** -----------------------------
 *  Public API
 * ------------------------------*/

/**
 * Main routing entrypoint.
 * Returns a robust routing decision even when OpenAI is unavailable.
 *
 * @param {string} text
 * @param {object} opts
 * @returns {Promise<object>}
 */
async function routeCase(text, opts = {}) {
  const t = cleanStr(text);
  if (!t) {
    return {
      jurisdiction: { country: "", state_or_region: "", city_or_locality: "" },
      sector: "general",
      severity: classifySeverity("") || { level: "low" },
      entities_identified: [],
      authority_graph: { primary: [], through: [], cc: [] },
      routing_notes: "Empty complaint text.",
      overall_confidence: 0,
    };
  }

  let aiGraph = null;
  try {
    aiGraph = await getAuthorityGraph(t, opts);
  } catch (e) {
    aiGraph = null;
  }

  // Ensure aiGraph structure exists
  if (!aiGraph || typeof aiGraph !== "object") {
    aiGraph = {
      jurisdiction: { country: "", state_or_region: "", city_or_locality: "" },
      sector: inferSectorFallback(t),
      entities_identified: [],
      authority_graph: { primary: [], secondary: [], oversight_or_cc: [] },
      routing_notes: "AI graph unavailable; using fallback routing.",
      overall_confidence: 0,
    };
  }

  const decision = buildDecision({ text: t, aiGraph });
  return decision;
}

module.exports = {
  routeCase,
};

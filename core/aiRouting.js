/**
 * core/aiRouting.js
 * Entity-first routing engine (PDPS 2.8)
 *
 * Design: 80% AI, 20% logic.
 * - If OpenAI is available => ask AI for jurisdiction + entities + authority graph (primary/through/cc)
 * - Logic validates, normalizes, and ENFORCES safety rules (especially PCC rule)
 * - If OpenAI not available => deterministic fallback (entity/sector/location) WITHOUT hijacking to PCC
 *
 * HARD RULE:
 * - PCC is NEVER PRIMARY unless the user explicitly mentions PCC (or "Public Complaints Commission").
 */

const { getAuthorityGraph } = require("./aiAuthorityGraph");

// ------------------------
// Severity loader (robust)
// ------------------------
let classifySeverity = null;

function loadSeverity() {
  const candidates = [
    "./aiSeverity",
    "./aiSeverity.js",
    "./severity",
    "./severity.js",
  ];

  for (const p of candidates) {
    try {
      const mod = require(p);
      // allow either default export function or named export
      if (typeof mod === "function") return mod;
      if (mod && typeof mod.classifySeverity === "function") return mod.classifySeverity;
    } catch (_) {}
  }

  // last resort inline fallback
  return (text = "") => {
    const t = String(text || "").toLowerCase();
    if (
      t.includes("refusing to treat") ||
      t.includes("detained") ||
      t.includes("kidnap") ||
      t.includes("assault") ||
      t.includes("abuse") ||
      t.includes("death") ||
      t.includes("life threatening") ||
      t.includes("shoot") ||
      t.includes("gun") ||
      t.includes("bleeding")
    ) return { level: "high", score: 0.85 };

    if (
      t.includes("delay") ||
      t.includes("complaint") ||
      t.includes("unprofessional") ||
      t.includes("fraud") ||
      t.includes("scam")
    ) return { level: "medium", score: 0.55 };

    return { level: "low", score: 0.25 };
  };
}

classifySeverity = loadSeverity();

// ------------------------
// Helpers
// ------------------------
function cleanStr(v) {
  return (v || "").toString().trim();
}

function hasAny(text, arr) {
  const t = String(text || "").toLowerCase();
  return arr.some(k => t.includes(String(k).toLowerCase()));
}

function normalizeOrg(o) {
  if (!o) return null;
  return {
    org: cleanStr(o.org || o.name || ""),
    title: cleanStr(o.title || ""),
    country: cleanStr(o.country || ""),
    state_or_region: cleanStr(o.state_or_region || ""),
    city_or_locality: cleanStr(o.city_or_locality || ""),
    address: cleanStr(o.address || ""),
    email: cleanStr(o.email || ""),
  };
}

function uniqOrgs(list) {
  const seen = new Set();
  const out = [];
  for (const item of list || []) {
    const o = normalizeOrg(item);
    if (!o || !o.org) continue;
    const key = `${o.org}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(o);
  }
  return out;
}

function isPCC(orgName) {
  const n = String(orgName || "").toLowerCase();
  return n.includes("public complaints commission") || n === "pcc";
}

function enforcePCCRule(text, primaryCandidate) {
  const userMentionsPCC = hasAny(text, ["public complaints commission", "pcc"]);
  if (!primaryCandidate) return null;
  if (isPCC(primaryCandidate.org) && !userMentionsPCC) {
    return null; // strip PCC as primary if not explicitly mentioned
  }
  return primaryCandidate;
}

// ------------------------
// Fallback routing (NO AI)
// ------------------------
function fallbackRoute(text) {
  const t = String(text || "").toLowerCase();

  // crude sector inference (good enough for fallback)
  const sector =
    hasAny(t, ["gtbank", "access bank", "zenith", "uba", "ecobank", "bank", "atm", "transfer", "reversal"]) ? "banking" :
    hasAny(t, ["police", "igp", "dpo", "arrest", "detain", "detained", "assault"]) ? "police" :
    hasAny(t, ["hospital", "doctor", "nurse", "clinic", "refusing to treat", "treatment", "medical"]) ? "health" :
    hasAny(t, ["landlord", "rent", "tenant"]) ? "housing" :
    "general";

  // entity-first guess
  let primary = null;
  let through = null;
  let cc = [];

  // BANKING fallback: bank => bank HO through + CBN/NDIC cc
  if (sector === "banking") {
    // If a specific bank name appears, route to that bank, NOT PCC
    const bankMatch =
      (t.includes("gtbank") && "Guaranty Trust Bank Plc (GTBank)") ||
      (t.includes("ecobank") && "Ecobank Nigeria") ||
      (t.includes("access") && "Access Bank Plc") ||
      (t.includes("zenith") && "Zenith Bank Plc") ||
      (t.includes("uba") && "United Bank for Africa (UBA)") ||
      null;

    if (bankMatch) {
      primary = { org: bankMatch, title: "Customer Service / Complaints Unit", country: "Nigeria" };
      through = { org: `${bankMatch} Head Office`, title: "", country: "Nigeria" };
      cc = [
        { org: "Central Bank of Nigeria (CBN)", title: "", country: "Nigeria" },
        { org: "Nigeria Deposit Insurance Corporation (NDIC)", title: "", country: "Nigeria" },
      ];
    }
  }

  // POLICE fallback: state police command primary, through IGP
  if (!primary && sector === "police") {
    // Try infer state from text (very rough)
    const state =
      (t.includes("zamfara") && "Zamfara") ||
      (t.includes("nasarawa") && "Nasarawa") ||
      (t.includes("gombe") && "Gombe") ||
      (t.includes("fct") || t.includes("abuja") && "FCT") ||
      null;

    if (state && state !== "FCT") {
      primary = { org: `${state} State Police Command`, title: "Commissioner of Police", country: "Nigeria" };
    } else if (state === "FCT") {
      primary = { org: "Federal Capital Territory Police Command", title: "Commissioner of Police", country: "Nigeria" };
    } else {
      primary = { org: "Nigeria Police Force", title: "Commissioner of Police (Appropriate Command)", country: "Nigeria" };
    }

    through = { org: "Inspector-General of Police, Nigeria Police Force", title: "Inspector-General of Police", country: "Nigeria" };
    cc = [];
  }

  // HEALTH fallback: hospital management primary, through state MoH, cc FMoH
  if (!primary && sector === "health") {
    // Detect “X general hospital” pattern
    const gh = /([a-z\s]+)\s+general\s+hospital/.exec(t);
    const hospitalName = gh ? `${gh[1].trim().replace(/\b\w/g, c => c.toUpperCase())} General Hospital` : "Hospital Management";

    primary = { org: hospitalName, title: "Medical Director / Hospital Management", country: "Nigeria" };

    // state inference
    const state =
      (t.includes("gombe") && "Gombe") ||
      (t.includes("zamfara") && "Zamfara") ||
      (t.includes("nasarawa") && "Nasarawa") ||
      (t.includes("fct") || t.includes("abuja") && "FCT") ||
      null;

    if (state && state !== "FCT") {
      through = { org: `${state} State Ministry of Health`, title: "Honourable Commissioner for Health", country: "Nigeria" };
      cc = [{ org: "Federal Ministry of Health, Nigeria", title: "", country: "Nigeria" }];
    } else if (state === "FCT") {
      through = { org: "FCT Health and Human Services Secretariat", title: "", country: "Nigeria" };
      cc = [{ org: "Federal Ministry of Health, Nigeria", title: "", country: "Nigeria" }];
    } else {
      through = { org: "Federal Ministry of Health, Nigeria", title: "", country: "Nigeria" };
      cc = [];
    }
  }

  // GENERAL fallback: if user explicitly mentions PCC then PCC can be primary
  if (!primary) {
    if (hasAny(text, ["public complaints commission", "pcc"])) {
      primary = { org: "Public Complaints Commission", title: "The Honourable Chief Commissioner", country: "Nigeria" };
    } else {
      // safest generic destination, not PCC
      primary = { org: "Appropriate Responsible Authority (Manual Review Needed)", title: "", country: "" };
    }
    through = null;
    cc = [];
  }

  // Enforce PCC hard rule
  primary = enforcePCCRule(text, normalizeOrg(primary)) || primary;

  return {
    ok: true,
    severity: classifySeverity(text),
    primary: normalizeOrg(primary),
    through: normalizeOrg(through),
    cc: uniqOrgs(cc),
    confidence: sector === "general" ? 0.35 : 0.55,
    mode: "fallback",
    notes: `fallback sector=${sector}`,
  };
}

// ------------------------
// AI-first routing
// ------------------------
async function routeComplaintEntityFirst(text) {
  const severity = classifySeverity(text);

  // Ask AI for authority graph (includes jurisdiction + entities)
  const ai = await getAuthorityGraph(text);

  // If AI failed OR returned nothing usable => fallback
  const aiPrimary = ai?.authority_graph?.primary?.[0] || null;
  const aiThrough = ai?.authority_graph?.secondary?.[0] || null;
  const aiCC = ai?.authority_graph?.oversight_or_cc || [];

  const normalizedPrimary = enforcePCCRule(text, normalizeOrg(aiPrimary));

  // If AI is unusable, fallback
  if (!normalizedPrimary || !normalizedPrimary.org) {
    return {
      ...fallbackRoute(text),
      severity,
      notes: "AI returned no valid primary; used fallback",
    };
  }

  // Build output
  const out = {
    ok: true,
    severity,
    primary: normalizedPrimary,
    through: normalizeOrg(aiThrough),
    cc: uniqOrgs(aiCC),
    confidence: Math.max(0.65, Number(ai?.overall_confidence || 0.7)),
    mode: "ai",
    routing_notes: cleanStr(ai?.routing_notes || ""),
    jurisdiction: ai?.jurisdiction || {},
    entities_identified: ai?.entities_identified || [],
  };

  // Safety: never allow PCC primary unless explicit
  if (isPCC(out.primary.org) && !hasAny(text, ["public complaints commission", "pcc"])) {
    // degrade to fallback instead of wrong PCC
    const fb = fallbackRoute(text);
    return {
      ...fb,
      severity,
      notes: "Blocked PCC-as-primary (not explicitly mentioned); used fallback",
    };
  }

  return out;
}

module.exports = {
  routeComplaintEntityFirst,
};

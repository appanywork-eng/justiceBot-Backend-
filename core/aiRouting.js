"use strict";

/**
 * core/aiRouting.js
 * ENTITY-FIRST AI ROUTING (PDPS 2.6+)
 *
 * Goals:
 * 1) AI extracts ENTITIES first (institutions, locations, regulators).
 * 2) AI produces strict JSON routing output.
 * 3) Logic validates, de-duplicates, fixes "generic placeholders".
 * 4) Nigeria datasets ENRICH (bank canonicalization, police state command naming)
 *    but DO NOT destroy AI intent.
 *
 * IMPORTANT TRUTH:
 * - AI cannot "scrape verified" info from the web inside this backend.
 * - So we enforce: if not sure, leave email/address blank + set needsVerification=true.
 * - PetitionDesk can later add a human verification step or a separate verified directory service.
 */

const fs = require("fs");
const path = require("path");

const { getOpenAI, isOpenAIReady } = require("./openaiClient");

// ------------------------------------------------------------
// Small utils
// ------------------------------------------------------------
function safeStr(x) {
  return String(x || "").trim();
}

function lc(x) {
  return safeStr(x).toLowerCase();
}

function textHasAny(text, arr) {
  const t = lc(text);
  return (arr || []).some((k) => t.includes(lc(k)));
}

function uniqByOrg(list) {
  const seen = new Set();
  const out = [];
  for (const it of Array.isArray(list) ? list : []) {
    const key = lc(it?.org || it?.title || "");
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

function isObj(x) {
  return x && typeof x === "object" && !Array.isArray(x);
}

function looksGenericOrg(org) {
  const o = lc(org);
  if (!o) return true;
  const bad = [
    "bank branch",
    "bank head office",
    "the bank",
    "telecom company",
    "telecommunications company",
    "international human rights body",
    "government agency",
    "government ministry",
    "police command (state)",
    "commissioner of police (state)",
    "ministry of foreign affairs",
    "public complaints commission", // only valid as fallback, not as default for everything
    "institution",
    "regulator",
    "agency",
  ];
  return bad.includes(o);
}

function normalizeInstitution(x, fallbackOrg = "Institution") {
  if (!isObj(x)) {
    return { org: fallbackOrg, title: fallbackOrg, address: "", email: "" };
  }
  return {
    id: safeStr(x.id || ""),
    org: safeStr(x.org || fallbackOrg),
    title: safeStr(x.title || x.org || fallbackOrg),
    email: safeStr(x.email || ""),
    address: safeStr(x.address || ""),
    category: safeStr(x.category || ""),
    country: safeStr(x.country || ""),
    state: safeStr(x.state || ""),
    city: safeStr(x.city || ""),
    needsVerification: !!x.needsVerification,
  };
}

// ------------------------------------------------------------
// Load local Nigeria datasets (ENRICHERS only)
// ------------------------------------------------------------
function loadJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    return null;
  }
}

const DATA_DIR = path.join(__dirname, "..", "data");

function getBanksList() {
  const p = path.join(DATA_DIR, "banks.json");
  const j = loadJSON(p);
  const arr = j?.banks || j?.data || j;
  if (!Array.isArray(arr)) return [];
  return arr
    .map((b) => ({
      id: safeStr(b.id || ""),
      name: safeStr(b.name || b.org || ""),
    }))
    .filter((b) => b.name);
}

function getPoliceStatesList() {
  const p = path.join(DATA_DIR, "police_states.json");
  const j = loadJSON(p);
  const arr = j?.police_states || j?.states || j?.data || j;
  if (!Array.isArray(arr)) return [];
  return arr
    .map((s) => ({
      id: safeStr(s.id || ""),
      name: safeStr(s.name || s.state || ""),
      capital: safeStr(s.capital || s.hq || ""),
      aliases: Array.isArray(s.aliases) ? s.aliases.map(safeStr).filter(Boolean) : [],
    }))
    .filter((s) => s.name);
}

// Cached in memory per process
const BANKS = getBanksList();
const POLICE_STATES = getPoliceStatesList();

// ------------------------------------------------------------
// Entity extraction (light logic) - used for validation & enrichment
// ------------------------------------------------------------
function extractPossibleBank(text) {
  const t = lc(text);

  // direct matches from dataset
  for (const b of BANKS) {
    const n = lc(b.name);
    if (!n) continue;

    // also match short "gtbank", "gtb"
    const shorthand = [
      n,
      n.replace(/plc/g, "").trim(),
      n.replace(/\(.*?\)/g, "").trim(),
    ].filter(Boolean);

    for (const s of shorthand) {
      if (s && s.length >= 4 && t.includes(s)) return b;
    }
  }

  // common keywords (if dataset doesn't catch)
  const common = [
    { id: "gtb", name: "Guaranty Trust Bank Plc (GTBank)", keys: ["gtbank", "gtb", "guaranty trust"] },
    { id: "access", name: "Access Bank Plc", keys: ["access bank"] },
    { id: "uba", name: "United Bank for Africa (UBA)", keys: ["uba", "united bank for africa"] },
    { id: "zenith", name: "Zenith Bank Plc", keys: ["zenith bank"] },
    { id: "firstbank", name: "First Bank of Nigeria Ltd", keys: ["firstbank", "first bank"] },
    { id: "ecobank", name: "Ecobank Nigeria", keys: ["ecobank"] },
  ];
  for (const c of common) {
    if (textHasAny(t, c.keys)) return { id: c.id, name: c.name };
  }

  return null;
}

function extractNigeriaState(text) {
  const t = lc(text);

  for (const s of POLICE_STATES) {
    const name = lc(s.name);
    if (name && t.includes(name)) return s;

    // aliases e.g. "fct", "abuja"
    for (const a of s.aliases || []) {
      const aa = lc(a);
      if (aa && t.includes(aa)) return s;
    }

    // capital mention e.g. "asaba" => Delta
    const cap = lc(s.capital);
    if (cap && cap.length >= 4 && t.includes(cap)) return s;
  }
  return null;
}

// ------------------------------------------------------------
// OpenAI call - STRICT JSON contract
// ------------------------------------------------------------
async function callAIRouter(description, userAddress) {
  const openai = getOpenAI();
  if (!openai) return null;

  const sys = `
You are PetitionDesk Routing AI.
You MUST output ONE valid JSON object ONLY (no markdown, no explanations).
You are routing a complaint/petition to the correct institution(s) globally.

CORE RULES:
1) Entity-first: identify any explicitly named institution(s), branch names, ministries, regulators, parliaments, courts, police commands, hospitals, telecoms, airlines, etc.
2) If user explicitly says "write to X" or "copy Y", obey it exactly as explicitTargets.
3) Never output generic placeholders like "Bank Branch" or "International Human Rights Body".
4) If you are not 100% sure of an email/address, leave it blank and set needsVerification=true.
5) Do NOT hallucinate verified emails/addresses.

OUTPUT SCHEMA (must match):
{
  "sector": "banking|police|telecom|housing|health|education|aviation|maritime|transport|immigration|human_rights|general",
  "summary": "short one-line summary",
  "location": { "country": "", "state": "", "city": "" },
  "entities": {
    "namedInstitutions": [ "..." ],
    "banks": [ "..." ],
    "governmentBodies": [ "..." ],
    "lawEnforcement": [ "..." ],
    "telecoms": [ "..." ],
    "hospitals": [ "..." ]
  },
  "explicitTargets": {
    "primary": { "org": "", "title": "", "address": "", "email": "", "country": "", "state": "", "city": "", "needsVerification": true/false },
    "through": { "org": "", "title": "", "address": "", "email": "", "country": "", "state": "", "city": "", "needsVerification": true/false } | null,
    "ccList": [ { "org": "", "title": "", "address": "", "email": "", "country": "", "state": "", "city": "", "needsVerification": true/false } ]
  },
  "routing": {
    "primary": { ...same as above... },
    "through": { ...same as above... } | null,
    "ccList": [ ...same as above... ]
  },
  "confidence": 0.0 to 1.0,
  "flags": { "needsVerification": true/false, "explicitUserTargets": true/false }
}
`;

  const user = `
Complaint: ${description}

User address/context (optional): ${userAddress || ""}

Return JSON now.
`;

  try {
    // Using Responses API style via openai sdk is model dependent.
    // Your openaiClient.js returns OpenAI instance; we will use chat.completions for compatibility.
    const resp = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      temperature: 0.1,
      messages: [
        { role: "system", content: sys.trim() },
        { role: "user", content: user.trim() },
      ],
    });

    const txt = resp?.choices?.[0]?.message?.content || "";
    const raw = txt.trim();

    // Strict parse: find first { and last }
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end < 0 || end <= start) return null;

    const jsonStr = raw.slice(start, end + 1);
    const parsed = JSON.parse(jsonStr);
    return parsed;
  } catch (e) {
    console.error("[aiRouting] OpenAI routing error:", e?.message || e);
    return null;
  }
}

// ------------------------------------------------------------
// Post-AI validation & enrichment (logic guardrails)
// ------------------------------------------------------------
function ensureNigeriaRegulatorsIfNeeded(route, bankDetected) {
  // Only apply Nigeria regulators if Nigeria is very likely
  const country = lc(route?.location?.country || route?.routing?.primary?.country || "");
  const isNigeria = country === "nigeria" || /nigeria/.test(lc(route?.summary || ""));

  if (!isNigeria) return route;

  // if banking and bank is detected, add CBN + NDIC (unless already present)
  const sector = lc(route?.sector || "");
  if (sector !== "banking") return route;

  const cc = Array.isArray(route?.routing?.ccList) ? route.routing.ccList : [];
  const add = (org, title) => {
    if (cc.some((x) => lc(x?.org) === lc(org))) return;
    cc.push({
      org,
      title: title || org,
      address: "Nigeria",
      email: "",
      country: "Nigeria",
      needsVerification: true,
    });
  };

  if (bankDetected) {
    add("Central Bank of Nigeria (CBN)", "The Governor, Central Bank of Nigeria");
    add("Nigeria Deposit Insurance Corporation (NDIC)", "The Managing Director/CEO, NDIC");
  }

  route.routing.ccList = cc;
  return route;
}

function canonizeBankIfGenericPrimary(route, bankDetected) {
  if (!bankDetected) return route;

  const primaryOrg = safeStr(route?.routing?.primary?.org || "");
  if (!primaryOrg || looksGenericOrg(primaryOrg)) {
    // Replace with the detected bank
    route.routing.primary = {
      org: bankDetected.name,
      title: bankDetected.name,
      address: "Nigeria",
      email: "",
      country: "Nigeria",
      needsVerification: true,
    };
  }

  // If primary already contains the bank name but messy, canonicalize
  const pOrgLc = lc(route.routing.primary.org || "");
  const bLc = lc(bankDetected.name);
  if (pOrgLc && bLc && (pOrgLc.includes("gtb") || pOrgLc.includes("gtbank") || pOrgLc.includes(bLc.split(" ")[0]))) {
    route.routing.primary.org = bankDetected.name;
    route.routing.primary.title = safeStr(route.routing.primary.title || bankDetected.name);
  }

  // If user mentioned "branch", set through as head office (Nigeria only)
  const desc = lc(route?.__desc || "");
  const wantsBranch = desc.includes("branch");

  if (wantsBranch) {
    if (!route.routing.through || looksGenericOrg(route.routing.through.org || "")) {
      route.routing.through = {
        org: `${bankDetected.name} Head Office`,
        title: `${bankDetected.name} Head Office`,
        address: "Nigeria",
        email: "",
        country: "Nigeria",
        needsVerification: true,
      };
    }
  }

  return route;
}

function fixPoliceStateIfNeeded(route, detectedState) {
  const sector = lc(route?.sector || "");
  if (sector !== "police") return route;

  if (!detectedState) return route;

  const stateName = detectedState.name;
  const capital = detectedState.capital || "";

  // Replace generic police orgs
  const p = route?.routing?.primary || {};
  const orgLc = lc(p.org || "");

  if (!p.org || looksGenericOrg(p.org) || orgLc.includes("commissioner of police (state)") || orgLc.includes("police command (state)")) {
    route.routing.primary = {
      org: `Commissioner of Police, ${stateName} State Command`,
      title: `The Commissioner of Police, ${stateName} State Command`,
      address: capital
        ? `${stateName} State Police Command Headquarters, ${capital}, ${stateName} State, Nigeria`
        : `${stateName} State Police Command, Nigeria`,
      email: "",
      country: "Nigeria",
      state: stateName,
      city: capital,
      needsVerification: true,
    };
  }

  // Through: IGP (only if missing or generic)
  const thr = route?.routing?.through;
  if (!thr || looksGenericOrg(thr.org || "")) {
    route.routing.through = {
      org: "Inspector-General of Police, Nigeria Police Force",
      title: "The Inspector-General of Police",
      address: "Force Headquarters, Louis Edet House, Abuja, Nigeria",
      email: "",
      country: "Nigeria",
      needsVerification: true,
    };
  }

  // CC default (PSC + NHRC) if not present
  const cc = Array.isArray(route?.routing?.ccList) ? route.routing.ccList : [];
  const add = (org, title) => {
    if (cc.some((x) => lc(x?.org) === lc(org))) return;
    cc.push({
      org,
      title: title || org,
      address: "Nigeria",
      email: "",
      country: "Nigeria",
      needsVerification: true,
    });
  };

  add("Police Service Commission", "The Chairman, Police Service Commission");
  add("National Human Rights Commission", "The Executive Secretary, NHRC");

  route.routing.ccList = cc;
  return route;
}

function finalValidate(route) {
  route = route || {};
  route.routing = route.routing || {};
  route.flags = route.flags || {};
  route.entities = route.entities || {};
  route.location = route.location || {};

  // Normalize primary/through/cc
  route.routing.primary = normalizeInstitution(route.routing.primary, "Institution");
  route.routing.through = route.routing.through ? normalizeInstitution(route.routing.through, "Institution") : null;
  route.routing.ccList = uniqByOrg((route.routing.ccList || []).map((x) => normalizeInstitution(x, "Institution")));

  // Never allow totally generic primary
  if (!route.routing.primary?.org || looksGenericOrg(route.routing.primary.org)) {
    // ultimate safe fallback: PCC (only as last resort)
    route.routing.primary = {
      org: "Public Complaints Commission",
      title: "The Honourable Chief Commissioner",
      address: "Nigeria",
      email: "",
      country: "Nigeria",
      needsVerification: true,
    };
    route.flags.needsVerification = true;
  }

  // if AI gave explicitTargets, prefer those (but still validate)
  if (route.explicitTargets && route.flags?.explicitUserTargets) {
    const ep = normalizeInstitution(route.explicitTargets.primary, route.routing.primary.org);
    if (ep?.org && !looksGenericOrg(ep.org)) route.routing.primary = ep;

    const et = route.explicitTargets.through ? normalizeInstitution(route.explicitTargets.through, "Institution") : null;
    if (et?.org && !looksGenericOrg(et.org)) route.routing.through = et;

    const ecc = Array.isArray(route.explicitTargets.ccList) ? route.explicitTargets.ccList : [];
    route.routing.ccList = uniqByOrg([...route.routing.ccList, ...ecc.map((x) => normalizeInstitution(x, "Institution"))]);
  }

  // Cap confidence
  const c = Number(route.confidence);
  route.confidence = Number.isFinite(c) ? Math.max(0, Math.min(1, c)) : 0.5;

  // Needs verification flag
  const nv =
    !!route.flags?.needsVerification ||
    !!route.routing.primary?.needsVerification ||
    !!route.routing.through?.needsVerification ||
    (route.routing.ccList || []).some((x) => !!x.needsVerification);

  route.flags.needsVerification = nv;

  return route;
}

// ------------------------------------------------------------
// Minimal fallback routing (ONLY when AI fails)
// ------------------------------------------------------------
function fallbackRoute(description, userAddress) {
  const desc = safeStr(description);
  const t = lc(desc);

  const bankDetected = extractPossibleBank(desc);
  const stateDetected = extractNigeriaState(desc);

  // Basic sector guess
  let sector = "general";
  if (bankDetected || textHasAny(t, ["bank", "transfer", "reversed", "debit", "atm", "pos", "chargeback"])) sector = "banking";
  else if (textHasAny(t, ["police", "arrest", "detained", "detention", "dpo", "sars"])) sector = "police";
  else if (textHasAny(t, ["mtn", "airtel", "glo", "9mobile", "network", "data", "airtime"])) sector = "telecom";
  else if (textHasAny(t, ["landlord", "tenant", "evicted", "rent", "house"])) sector = "housing";
  else if (textHasAny(t, ["hospital", "clinic", "refused", "treatment", "emergency"])) sector = "health";

  // Build fallback institutions (safe)
  let primary = { org: "Public Complaints Commission", title: "The Honourable Chief Commissioner", address: "Nigeria", email: "", needsVerification: true };
  let through = null;
  let ccList = [];

  if (sector === "banking" && bankDetected) {
    primary = { org: bankDetected.name, title: bankDetected.name, address: "Nigeria", email: "", needsVerification: true };
    through = { org: `${bankDetected.name} Head Office`, title: `${bankDetected.name} Head Office`, address: "Nigeria", email: "", needsVerification: true };
    ccList = [
      { org: "Central Bank of Nigeria (CBN)", title: "The Governor, Central Bank of Nigeria", address: "Nigeria", email: "", needsVerification: true },
      { org: "Nigeria Deposit Insurance Corporation (NDIC)", title: "The Managing Director/CEO, NDIC", address: "Nigeria", email: "", needsVerification: true },
    ];
  }

  if (sector === "police" && stateDetected) {
    primary = {
      org: `Commissioner of Police, ${stateDetected.name} State Command`,
      title: `The Commissioner of Police, ${stateDetected.name} State Command`,
      address: stateDetected.capital
        ? `${stateDetected.name} State Police Command Headquarters, ${stateDetected.capital}, ${stateDetected.name} State, Nigeria`
        : `${stateDetected.name} State Police Command, Nigeria`,
      email: "",
      needsVerification: true,
    };
    through = { org: "Inspector-General of Police, Nigeria Police Force", title: "The Inspector-General of Police", address: "Force Headquarters, Louis Edet House, Abuja, Nigeria", email: "", needsVerification: true };
    ccList = [
      { org: "Police Service Commission", title: "The Chairman, Police Service Commission", address: "Nigeria", email: "", needsVerification: true },
      { org: "National Human Rights Commission", title: "The Executive Secretary, NHRC", address: "Nigeria", email: "", needsVerification: true },
    ];
  }

  return finalValidate({
    sector,
    summary: "Fallback routing used (AI unavailable or failed).",
    location: { country: "Nigeria" },
    entities: {
      namedInstitutions: bankDetected ? [bankDetected.name] : [],
      banks: bankDetected ? [bankDetected.name] : [],
      lawEnforcement: sector === "police" ? ["Nigeria Police Force"] : [],
    },
    routing: { primary, through, ccList },
    confidence: 0.35,
    flags: { needsVerification: true, explicitUserTargets: false },
    __desc: desc,
  });
}

// ------------------------------------------------------------
// Main exported function: detectHybrid()
// ------------------------------------------------------------
async function detectHybrid(description = "", userAddress = "") {
  const desc = safeStr(description);
  const addr = safeStr(userAddress);

  // Always keep original description available for enrichers
  const bankDetected = extractPossibleBank(desc);
  const stateDetected = extractNigeriaState(desc);

  // If OpenAI is not ready, fallback
  if (!isOpenAIReady || typeof isOpenAIReady !== "function" || !isOpenAIReady()) {
    return fallbackRoute(desc, addr).routing
      ? {
          sector: fallbackRoute(desc, addr).sector,
          primary: fallbackRoute(desc, addr).routing.primary,
          through: fallbackRoute(desc, addr).routing.through,
          ccList: fallbackRoute(desc, addr).routing.ccList,
          confidence: fallbackRoute(desc, addr).confidence,
          flags: fallbackRoute(desc, addr).flags,
          entities: fallbackRoute(desc, addr).entities,
          location: fallbackRoute(desc, addr).location,
        }
      : {};
  }

  // 1) AI-first routing
  const ai = await callAIRouter(desc, addr);

  // If AI failed, fallback
  if (!ai || !isObj(ai)) {
    const fb = fallbackRoute(desc, addr);
    return {
      sector: fb.sector,
      primary: fb.routing.primary,
      through: fb.routing.through,
      ccList: fb.routing.ccList,
      confidence: fb.confidence,
      flags: fb.flags,
      entities: fb.entities,
      location: fb.location,
    };
  }

  // Normalize AI into our internal object
  let route = {
    sector: safeStr(ai.sector || "general"),
    summary: safeStr(ai.summary || ""),
    location: isObj(ai.location) ? ai.location : {},
    entities: isObj(ai.entities) ? ai.entities : {},
    explicitTargets: isObj(ai.explicitTargets) ? ai.explicitTargets : null,
    routing: isObj(ai.routing) ? ai.routing : {},
    confidence: Number(ai.confidence),
    flags: isObj(ai.flags) ? ai.flags : {},
    __desc: desc,
  };

  // 2) Validate baseline (no generics, normalize shapes)
  route = finalValidate(route);

  // 3) ENTITY-FIRST ENRICHMENT (only fix broken/generic output)
  // Banking: if bank was detected locally, fix generic primary/through & add Nigeria regulators
  route = canonizeBankIfGenericPrimary(route, bankDetected);
  route = ensureNigeriaRegulatorsIfNeeded(route, bankDetected);

  // Police: if state detected, fix generic police output
  route = fixPoliceStateIfNeeded(route, stateDetected);

  // 4) Final validate again after enrichments
  route = finalValidate(route);

  // 5) Return shape expected by server.cjs
  return {
    sector: route.sector || "general",
    primary: normalizeInstitution(route.routing.primary, "Institution"),
    through: route.routing.through ? normalizeInstitution(route.routing.through, "Institution") : null,
    ccList: uniqByOrg((route.routing.ccList || []).map((x) => normalizeInstitution(x, "Institution"))),
    confidence: route.confidence,
    flags: route.flags,
    entities: route.entities,
    location: route.location,
    summary: route.summary,
  };
}

module.exports = {
  detectHybrid,
};

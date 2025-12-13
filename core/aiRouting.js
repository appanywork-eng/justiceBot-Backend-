"use strict";

/**
 * PetitionDesk / JusticeBot - Entity-First Routing Engine (PDPS 2.6)
 *
 * Key Rules:
 * 1) USER EXPLICIT TARGETS ALWAYS WIN.
 * 2) ENTITY-FIRST: identify named org/bank/state/country BEFORE sector logic.
 * 3) NO PLACEHOLDER PRIMARIES (no "Bank Branch", "Bank HQ", "Commissioner of Police").
 * 4) PCC IS LAST RESORT ONLY.
 * 5) DO NOT INVENT emails/addresses. Use dataset values; otherwise leave blank or "Nigeria".
 */

const fs = require("fs");
const path = require("path");

// Optional OpenAI support (never required; never crash)
let openai = null;
let isOpenAIReady = () => false;
try {
  const client = require("./openaiClient");
  // support either getOpenAI / isOpenAIReady depending on your file
  if (typeof client.getOpenAI === "function") openai = client.getOpenAI();
  if (typeof client.isOpenAIReady === "function") isOpenAIReady = client.isOpenAIReady;
} catch (e) {
  // ignore
}

// --------------------------------------
// SAFE JSON LOADERS
// --------------------------------------
function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

function lower(s) {
  return String(s || "").toLowerCase();
}

function clean(s) {
  return String(s || "").trim();
}

function uniqByOrg(list) {
  const seen = new Set();
  const out = [];
  for (const x of Array.isArray(list) ? list : []) {
    if (!x || !x.org) continue;
    const k = lower(x.org);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

function normalizeInst(x) {
  if (!x || typeof x !== "object") return null;
  const org = clean(x.org || x.name || x.title);
  if (!org) return null;
  return {
    id: x.id,
    org,
    title: clean(x.title || x.org || x.name || "Sir/Madam"),
    email: clean(x.email || ""),
    address: clean(x.address || x.location || "Nigeria"),
    category: clean(x.category || x.sector || ""),
    state: x.state ? clean(x.state) : undefined,
    country: x.country ? clean(x.country) : undefined,
  };
}

function makeInst(org, opts = {}) {
  const o = clean(org);
  if (!o) return null;
  return normalizeInst({
    org: o,
    title: opts.title || o,
    email: opts.email || "",
    address: opts.address || "Nigeria",
    category: opts.category || "",
    state: opts.state,
    country: opts.country,
  });
}

// --------------------------------------
// PATHS / DATA SOURCES
// --------------------------------------
const DATA_ROOT = path.join(__dirname, "..", "data");          // /data/*.json
const CORE_DATA_ROOT = path.join(__dirname, "data");          // /core/data/*.json (if you use it)

function dataPath(name) {
  // prefer /data, fallback to /core/data
  const p1 = path.join(DATA_ROOT, name);
  if (fs.existsSync(p1)) return p1;
  return path.join(CORE_DATA_ROOT, name);
}

// main mega list (if present)
const institutionsJson = readJsonSafe(dataPath("institutions.json"), {});

// sector datasets
const banksJson = readJsonSafe(dataPath("banks.json"), { banks: [] });
const policeStatesJson = readJsonSafe(dataPath("police_states.json"), { police_states: [] });

// optional regulators (only used if entity not found)
const bankingRegsJson = readJsonSafe(dataPath("banking_regulators.json"), {});
const powerRegsJson = readJsonSafe(dataPath("power_regulators.json"), {});
const transportRegsJson = readJsonSafe(dataPath("transport_regulators.json"), {});
const healthRegsJson = readJsonSafe(dataPath("health_regulators.json"), {});
const educationRegsJson = readJsonSafe(dataPath("education_regulators.json"), {});
const aviationRegsJson = readJsonSafe(dataPath("aviation_regulators.json"), {});
const maritimeRegsJson = readJsonSafe(dataPath("maritime_regulators.json"), {});
const federalJson = readJsonSafe(dataPath("federal.json"), {});

// --------------------------------------
// BUILD SEARCH POOL FROM institutions.json
// --------------------------------------
function flattenInstitutions(obj) {
  // institutions.json may contain many keys each as array
  const pools = [];
  if (!obj || typeof obj !== "object") return pools;

  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (Array.isArray(v)) {
      for (const item of v) {
        const n = normalizeInst(item);
        if (n) pools.push(n);
      }
    } else if (v && typeof v === "object" && Array.isArray(v.institutions)) {
      for (const item of v.institutions) {
        const n = normalizeInst(item);
        if (n) pools.push(n);
      }
    }
  }
  return pools;
}

const INSTITUTION_POOL = flattenInstitutions(institutionsJson);

// Find best match by org name substring / keywords
function bestPoolMatch(text, pool) {
  const t = lower(text);
  if (!t || !Array.isArray(pool) || pool.length === 0) return null;

  let best = null;
  let bestScore = 0;

  for (const inst of pool) {
    const name = lower(inst.org);
    if (!name) continue;

    // scoring
    let score = 0;

    // strong exact include
    if (t.includes(name)) score += 12;

    // keyword match (split name)
    const parts = name.split(/[^a-z0-9]+/).filter(Boolean);
    let hit = 0;
    for (const p of parts) {
      if (p.length < 4) continue;
      if (t.includes(p)) hit += 1;
    }
    score += hit;

    // prefer longer official names
    score += Math.min(3, Math.floor(parts.join("").length / 20));

    if (score > bestScore) {
      bestScore = score;
      best = inst;
    }
  }

  // require some minimum confidence
  if (bestScore < 6) return null;
  return best;
}

// --------------------------------------
// GEO: STATE + CITY (basic Nigeria)
// --------------------------------------
function extractNigeriaState(text, userAddress) {
  const src = `${text || ""} ${userAddress || ""}`.toLowerCase();

  // If police_states.json has cities, we try to match that first
  // expected shape examples:
  // { state: "Delta", cities: ["Asaba", ...], command_address: "...", ... }
  for (const s of policeStatesJson.police_states || []) {
    const stateName = lower(s.state);
    if (!stateName) continue;

    // if state explicitly mentioned
    if (src.includes(stateName)) {
      return { state: s.state, meta: s };
    }

    // match by any city keyword
    const cities = Array.isArray(s.cities) ? s.cities : [];
    for (const c of cities) {
      const city = lower(c);
      if (city && src.includes(city)) {
        return { state: s.state, meta: s, city: c };
      }
    }
  }

  // fallback simple common state list if your file is incomplete
  // (does not invent anything; only used for naming state command)
  const commonStates = [
    "abia","adamawa","akwa ibom","anambra","bauchi","bayelsa","benue","borno","cross river",
    "delta","ebonyi","edo","ekiti","enugu","gombe","imo","jigawa","kaduna","kano","katsina",
    "kebbi","kogi","kwara","lagos","nasarawa","niger","ogun","ondo","osun","oyo","plateau",
    "rivers","sokoto","taraba","yobe","zamfara","fct","abuja"
  ];
  for (const st of commonStates) {
    if (src.includes(st)) {
      const stateNice = st === "fct" ? "FCT" : st.replace(/\b\w/g, (m) => m.toUpperCase());
      return { state: stateNice, meta: null };
    }
  }

  return null;
}

// --------------------------------------
// ENTITY EXTRACTION: BANKS (strong deterministic)
// --------------------------------------
function resolveBankEntity(text) {
  const t = lower(text);
  const banks = Array.isArray(banksJson.banks) ? banksJson.banks : [];
  if (!t || banks.length === 0) return null;

  // Known shorthand aliases
  const aliases = [
    { key: "gtbank", id: "gtb" },
    { key: "guaranty trust", id: "gtb" },
    { key: "guaranty trust bank", id: "gtb" },
    { key: "zenith", id: "zenith" },
    { key: "access", id: "access" },
    { key: "uba", id: "uba" },
    { key: "firstbank", id: "firstbank" },
    { key: "first bank", id: "firstbank" },
    { key: "fidelity", id: "fidelity" },
    { key: "ecobank", id: "ecobank" },
    { key: "stanbic", id: "stanbic" },
    { key: "polaris", id: "polaris" },
    { key: "keystone", id: "keystone" },
    { key: "wema", id: "wema" },
    { key: "heritage", id: "heritage" },
    { key: "providus", id: "providus" },
    { key: "suntrust", id: "suntrust" },
    { key: "jaiz", id: "jaiz" },
    { key: "taj", id: "taj" },
  ];

  for (const a of aliases) {
    if (t.includes(a.key)) {
      const bank = banks.find((b) => lower(b.id) === lower(a.id)) || null;
      if (bank) return bank;
    }
  }

  // generic match by official names in banks.json
  for (const b of banks) {
    const name = lower(b.name);
    if (name && t.includes(name)) return b;
  }

  return null;
}

// --------------------------------------
// USER EXPLICIT TARGETS: INTERNATIONAL / SPECIFIC BODIES
// --------------------------------------
function detectExplicitTargets(description) {
  const t = lower(description);
  if (!t) return null;

  // If the user explicitly says "write to" / "petition to" / "address to" and names bodies.
  const explicitVerbs = ["write to", "petition to", "address to", "submit to", "send to", "complain to"];
  const hasVerb = explicitVerbs.some((v) => t.includes(v));
  const hasForeign = ["united states", "u.s.", "us ", "uk", "united kingdom", "eu", "european union", "african union", "ecowas", "un", "united nations", "parliament", "congress", "committee"].some((k) => t.includes(k));

  if (!hasForeign) return null;
  if (!hasVerb && !t.includes("cc:") && !t.includes("copy")) {
    // still allow when user just lists targets plainly
    // e.g. "US House Foreign Affairs Committee, UK Parliament, EU..."
  }

  // Hard-coded known targets (names only; no invented emails)
  const targets = [];

  // US
  if (t.includes("house foreign affairs") || t.includes("house committee on foreign affairs")) {
    targets.push(makeInst("US House Committee on Foreign Affairs", { address: "United States" }));
  }
  if (t.includes("senate foreign relations")) {
    targets.push(makeInst("US Senate Committee on Foreign Relations", { address: "United States" }));
  }
  if (t.includes("u.s. congress") || t.includes("us congress") || t.includes("united states congress")) {
    targets.push(makeInst("United States Congress", { address: "United States" }));
  }

  // UK
  if (t.includes("uk parliament") || t.includes("british parliament") || t.includes("parliament petitions")) {
    targets.push(makeInst("UK Parliament", { address: "United Kingdom" }));
  }
  if (t.includes("uk foreign affairs committee")) {
    targets.push(makeInst("UK House of Commons Foreign Affairs Committee", { address: "United Kingdom" }));
  }

  // EU
  if (t.includes("eu parliament") || t.includes("european parliament")) {
    targets.push(makeInst("European Parliament", { address: "European Union" }));
  }
  if (t.includes("droi") || t.includes("subcommittee on human rights")) {
    targets.push(makeInst("European Parliament Subcommittee on Human Rights (DROI)", { address: "European Union" }));
  }
  if (t.includes("eeas") || t.includes("european external action service")) {
    targets.push(makeInst("European External Action Service (EEAS) - Human Rights", { address: "European Union" }));
  }

  // Africa / regional
  if (t.includes("african union") || t.includes("au ")) {
    targets.push(makeInst("African Union", { address: "Africa" }));
  }
  if (t.includes("african commission") || t.includes("achpr")) {
    targets.push(makeInst("African Commission on Human and Peoples’ Rights (ACHPR)", { address: "Africa" }));
  }
  if (t.includes("ecowas")) {
    targets.push(makeInst("ECOWAS Commission", { address: "West Africa" }));
  }

  // UN
  if (t.includes("united nations") || t.includes("un ")) {
    targets.push(makeInst("United Nations (UN)", { address: "International" }));
  }

  // Nigeria add-ons user may include
  if (t.includes("attorney general") || t.includes("agf")) {
    targets.push(makeInst("Attorney-General of the Federation (AGF)", { address: "Nigeria" }));
  }
  if (t.includes("ministry of foreign affairs")) {
    targets.push(makeInst("Federal Ministry of Foreign Affairs", { address: "Nigeria" }));
  }
  if (t.includes("nhrc") || t.includes("national human rights commission")) {
    targets.push(makeInst("National Human Rights Commission (NHRC)", { address: "Nigeria" }));
  }
  if (t.includes("pcc") || t.includes("public complaints commission")) {
    targets.push(makeInst("Public Complaints Commission", { address: "Nigeria" }));
  }

  const cleaned = uniqByOrg(targets).filter(Boolean);

  if (cleaned.length >= 2) {
    // Primary = first, CC = rest
    return {
      mode: "explicit_targets",
      primary: cleaned[0],
      through: null,
      ccList: cleaned.slice(1),
      sector: "international_explicit",
      confidence: 0.95,
      reason: "User explicitly named target bodies",
    };
  }

  // If only 1 target, still treat as explicit
  if (cleaned.length === 1) {
    return {
      mode: "explicit_targets",
      primary: cleaned[0],
      through: null,
      ccList: [],
      sector: "international_explicit",
      confidence: 0.9,
      reason: "User explicitly named a target body",
    };
  }

  return null;
}

// --------------------------------------
// REGULATORS HELPERS
// --------------------------------------
function findInPoolByOrgContains(orgContains) {
  const needle = lower(orgContains);
  if (!needle) return null;
  for (const inst of INSTITUTION_POOL) {
    if (lower(inst.org).includes(needle)) return inst;
  }
  return null;
}

function getCommonCCForBanking() {
  // Use pool if available, else build generic (no fake emails)
  const cc = [];

  const cbn = findInPoolByOrgContains("central bank of nigeria") || makeInst("Central Bank of Nigeria (CBN)");
  const ndic = findInPoolByOrgContains("ndic") || makeInst("Nigeria Deposit Insurance Corporation (NDIC)");
  const fccpc = findInPoolByOrgContains("fccpc") || makeInst("Federal Competition and Consumer Protection Commission (FCCPC)");
  const pcc = findInPoolByOrgContains("public complaints commission") || makeInst("Public Complaints Commission (PCC)");

  if (cbn) cc.push(cbn);
  if (ndic) cc.push(ndic);
  if (fccpc) cc.push(fccpc);
  if (pcc) cc.push(pcc);

  return uniqByOrg(cc);
}

function getCommonCCForPolice() {
  const cc = [];
  const psc = findInPoolByOrgContains("police service commission") || makeInst("Police Service Commission (PSC)");
  const nhrc = findInPoolByOrgContains("national human rights commission") || makeInst("National Human Rights Commission (NHRC)");
  const pcc = findInPoolByOrgContains("public complaints commission") || makeInst("Public Complaints Commission (PCC)");
  if (psc) cc.push(psc);
  if (nhrc) cc.push(nhrc);
  if (pcc) cc.push(pcc);
  return uniqByOrg(cc);
}

function pccFallback() {
  return makeInst("Public Complaints Commission", { address: "Nigeria", title: "The Honourable Chief Commissioner" });
}

// --------------------------------------
// OPTIONAL OPENAI ENTITY CLARIFIER (SAFE)
// --------------------------------------
async function openaiExtract(description) {
  if (!isOpenAIReady || typeof isOpenAIReady !== "function") return null;
  if (!isOpenAIReady()) return null;
  if (!openai || !openai.chat || !openai.chat.completions) return null;

  // Keep prompt strict + short; return JSON only
  const prompt = `
Extract routing signals from the complaint. Return ONLY strict JSON with:
{
  "explicit_targets": [ {"org": "...", "country": "..."} ],
  "bank_name": "...",
  "state": "...",
  "city": "...",
  "sector_hint": "banking|police|housing|health|education|telecom|aviation|maritime|transport|general"
}
Complaint: ${description}
`.trim();

  try {
    const r = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.1,
      messages: [{ role: "user", content: prompt }],
    });

    const txt = r?.choices?.[0]?.message?.content || "";
    const jsonStart = txt.indexOf("{");
    const jsonEnd = txt.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) return null;

    const obj = JSON.parse(txt.slice(jsonStart, jsonEnd + 1));
    return obj && typeof obj === "object" ? obj : null;
  } catch (e) {
    return null;
  }
}

// --------------------------------------
// SECTOR GUESS (only after entity checks)
// --------------------------------------
function guessSector(description) {
  const t = lower(description);
  if (!t) return "general";

  const bankWords = ["bank", "transfer", "debit", "atm", "pos", "chargeback", "reversal", "account", "gtbank", "zenith", "access", "uba"];
  if (bankWords.some((w) => t.includes(w))) return "banking";

  const policeWords = ["police", "dpo", "area command", "divisional", "sars", "extortion", "arrest", "detain", "bail", "assault"];
  if (policeWords.some((w) => t.includes(w))) return "police";

  const telecomWords = ["mtn", "airtel", "glo", "9mobile", "network", "data", "airtime", "sim", "call", "service down"];
  if (telecomWords.some((w) => t.includes(w))) return "telecom";

  const healthWords = ["hospital", "clinic", "medical", "doctor", "emergency", "treatment", "nhis"];
  if (healthWords.some((w) => t.includes(w))) return "health";

  const eduWords = ["school", "university", "polytechnic", "waec", "jamb", "student"];
  if (eduWords.some((w) => t.includes(w))) return "education";

  const aviationWords = ["flight", "airline", "airport", "aviation"];
  if (aviationWords.some((w) => t.includes(w))) return "aviation";

  const maritimeWords = ["ship", "port", "maritime", "cargo", "shipping"];
  if (maritimeWords.some((w) => t.includes(w))) return "maritime";

  const transportWords = ["road", "transport", "vehicle", "towing", "park", "traffic", "rail", "train"];
  if (transportWords.some((w) => t.includes(w))) return "transport";

  const housingWords = ["landlord", "rent", "tenancy", "eviction", "house"];
  if (housingWords.some((w) => t.includes(w))) return "housing";

  const intlWords = ["united nations", "un ", "congress", "parliament", "eu", "african union", "ecowas", "asylum"];
  if (intlWords.some((w) => t.includes(w))) return "international";

  return "general";
}

// --------------------------------------
// MAIN ROUTER
// --------------------------------------
async function detectHybrid(description = "", userAddress = "") {
  const text = clean(description);
  const addr = clean(userAddress);
  const combined = `${text} ${addr}`.trim();

  // 0) USER EXPLICIT TARGETS ALWAYS WIN (deterministic)
  const explicit = detectExplicitTargets(text);
  if (explicit) return explicit;

  // 0.5) OpenAI assisted extraction (optional)
  const aiSignals = await openaiExtract(text);

  // 1) ENTITY-FIRST: BANK
  const bankEntity =
    resolveBankEntity(text) ||
    (aiSignals?.bank_name ? resolveBankEntity(aiSignals.bank_name) : null);

  if (bankEntity) {
    // Build concrete bank route (never "which bank?")
    const bankName = clean(bankEntity.name || bankEntity.org || "Bank");
    const primary = makeInst(`${bankName}`, { address: "Nigeria", category: "banking" });

    // Through: bank head office (named)
    const through = makeInst(`${bankName} Head Office`, { address: "Nigeria", category: "banking" });

    // CC: regulators
    const ccList = getCommonCCForBanking();

    // If user explicitly asked to CC additional bodies, add from pool match
    // (we don't invent; only match what exists)
    const maybeExtra = bestPoolMatch(text, INSTITUTION_POOL);
    const extras = maybeExtra ? [maybeExtra] : [];

    return {
      mode: "entity_bank",
      primary,
      through,
      ccList: uniqByOrg([...ccList, ...extras]),
      sector: "banking",
      confidence: 0.92,
      reason: `Detected bank entity: ${bankName}`,
      entity: { type: "bank", id: bankEntity.id, name: bankName },
    };
  }

  // 2) ENTITY-FIRST: POLICE (state-bound)
  const policeHint = lower(text).includes("police") || lower(text).includes("dpo") || lower(text).includes("area command");
  if (policeHint) {
    const geo = extractNigeriaState(text, addr) || (aiSignals?.state ? { state: aiSignals.state } : null);
    const stateName = clean(geo?.state);

    // Primary = "<State> State Police Command" (never generic "Commissioner of Police")
    const primaryOrg = stateName ? `${stateName} State Police Command` : "Nigeria Police Force (State Command)";
    const primary = makeInst(primaryOrg, {
      address: (geo?.meta && (geo.meta.command_address || geo.meta.address)) ? (geo.meta.command_address || geo.meta.address) : "Nigeria",
      category: "police",
      state: stateName || undefined,
    });

    // Through = IGP
    const through = makeInst("Inspector-General of Police (Nigeria Police Force)", {
      address: "Force Headquarters, Louis Edet House, Abuja, Nigeria",
      category: "police",
    });

    const ccList = getCommonCCForPolice();

    return {
      mode: "entity_police",
      primary,
      through,
      ccList,
      sector: "police",
      confidence: stateName ? 0.93 : 0.82,
      reason: stateName ? `Police complaint with state detected: ${stateName}` : "Police complaint detected (state unclear)",
      entity: { type: "police", state: stateName || null, city: geo?.city || null },
    };
  }

  // 3) ENTITY-FIRST: BEST MATCH FROM INSTITUTION POOL
  // If user mentions a specific organisation already in institutions.json
  const poolHit = bestPoolMatch(text, INSTITUTION_POOL);
  if (poolHit) {
    return {
      mode: "entity_pool_match",
      primary: poolHit,
      through: null,
      ccList: [],
      sector: guessSector(text),
      confidence: 0.75,
      reason: `Matched named institution in database: ${poolHit.org}`,
      entity: { type: "institution", org: poolHit.org },
    };
  }

  // 4) SECTOR-BASED ROUTING (ONLY IF NO ENTITY FOUND)
  const sector =
    (aiSignals?.sector_hint && clean(aiSignals.sector_hint)) ||
    guessSector(text);

  // Helper to pick first from a dataset object if it has "institutions" or arrays
  function firstFromDataset(ds) {
    if (!ds) return null;
    if (Array.isArray(ds)) return normalizeInst(ds[0]);
    if (Array.isArray(ds.institutions)) return normalizeInst(ds.institutions[0]);
    // if ds has multiple keys
    for (const k of Object.keys(ds)) {
      if (Array.isArray(ds[k]) && ds[k].length) return normalizeInst(ds[k][0]);
      if (ds[k] && Array.isArray(ds[k].institutions) && ds[k].institutions.length) return normalizeInst(ds[k].institutions[0]);
    }
    return null;
  }

  function allFromDataset(ds, limit = 6) {
    const out = [];
    if (!ds) return out;

    const pushMany = (arr) => {
      for (const it of arr || []) {
        const n = normalizeInst(it);
        if (n) out.push(n);
      }
    };

    if (Array.isArray(ds)) pushMany(ds);
    else if (Array.isArray(ds.institutions)) pushMany(ds.institutions);
    else {
      for (const k of Object.keys(ds)) {
        const v = ds[k];
        if (Array.isArray(v)) pushMany(v);
        else if (v && Array.isArray(v.institutions)) pushMany(v.institutions);
      }
    }

    return uniqByOrg(out).slice(0, limit);
  }

  // Pick sector primary + cc (never placeholders)
  let primary = null;
  let through = null;
  let ccList = [];

  if (sector === "telecom") {
    // Try match NCC from pool
    primary = findInPoolByOrgContains("nigerian communications commission") || makeInst("Nigerian Communications Commission (NCC)");
    ccList = [
      findInPoolByOrgContains("fccpc") || makeInst("Federal Competition and Consumer Protection Commission (FCCPC)"),
      findInPoolByOrgContains("public complaints commission") || makeInst("Public Complaints Commission (PCC)"),
    ];
  } else if (sector === "health") {
    // Use dataset if present else fallback to pool
    primary = firstFromDataset(healthRegsJson) || findInPoolByOrgContains("federal ministry of health") || makeInst("Federal Ministry of Health");
    ccList = [
      findInPoolByOrgContains("nhrc") || makeInst("National Human Rights Commission (NHRC)"),
      findInPoolByOrgContains("pcc") || makeInst("Public Complaints Commission (PCC)"),
    ];
  } else if (sector === "education") {
    primary = firstFromDataset(educationRegsJson) || makeInst("Federal Ministry of Education");
    ccList = [findInPoolByOrgContains("pcc") || makeInst("Public Complaints Commission (PCC)")];
  } else if (sector === "aviation") {
    primary = firstFromDataset(aviationRegsJson) || makeInst("Nigerian Civil Aviation Authority (NCAA)");
    ccList = [findInPoolByOrgContains("fccpc") || makeInst("Federal Competition and Consumer Protection Commission (FCCPC)")];
  } else if (sector === "maritime") {
    primary = firstFromDataset(maritimeRegsJson) || makeInst("Nigerian Ports Authority (NPA)");
    ccList = [findInPoolByOrgContains("pcc") || makeInst("Public Complaints Commission (PCC)")];
  } else if (sector === "transport") {
    primary = firstFromDataset(transportRegsJson) || makeInst("Federal Ministry of Transportation");
    ccList = [findInPoolByOrgContains("pcc") || makeInst("Public Complaints Commission (PCC)")];
  } else if (sector === "banking") {
    // if sector guessed but no bank entity found, go to regulators, not "bank branch"
    primary = firstFromDataset(bankingRegsJson) || makeInst("Central Bank of Nigeria (CBN)");
    ccList = allFromDataset(bankingRegsJson, 6);
  } else if (sector === "international") {
    // If user said UN/asylum but did not name explicit bodies clearly, route to MFA + NHRC (Nigeria)
    primary = makeInst("Federal Ministry of Foreign Affairs", { address: "Nigeria", category: "international" });
    ccList = [
      makeInst("National Human Rights Commission (NHRC)", { address: "Nigeria" }),
      makeInst("Public Complaints Commission (PCC)", { address: "Nigeria" }),
    ];
  } else {
    // general government / federal
    primary = firstFromDataset(federalJson) || pccFallback();
  }

  // 5) FINAL SAFETY: PCC ONLY IF NOTHING
  if (!primary) primary = pccFallback();

  return {
    mode: "sector_fallback",
    primary,
    through,
    ccList: uniqByOrg(ccList.filter(Boolean)),
    sector: clean(sector || "general"),
    confidence: 0.55,
    reason: "No explicit/strong entity found; sector fallback used",
  };
}

// Export
module.exports = {
  detectHybrid,
};

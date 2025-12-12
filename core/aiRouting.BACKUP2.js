/**
 * core/aiRouting.js
 * Deterministic HARD routing: PRIMARY -> THROUGH -> CC
 * Single source of truth: core/data/institutions.json
 * Tolerates legacy schemas (arrays or "international" object)
 */

const fs = require("fs");
const path = require("path");

let OpenAI = null;
try {
  OpenAI = require("openai");
} catch (e) {
  OpenAI = null;
}

// ------------------------------------------------------------
// 1) Optional OpenAI client (app works without it)
// ------------------------------------------------------------
function getOpenAIClient() {
  if (!OpenAI) return null;
  if (!process.env.OPENAI_API_KEY) {
    console.warn("[aiRouting] OPENAI_API_KEY missing. Offline mode.");
    return null;
  }
  try {
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  } catch (e) {
    console.warn("[aiRouting] OpenAI init failed. Offline mode.");
    return null;
  }
}
const openai = getOpenAIClient();

// ------------------------------------------------------------
// 2) Load institutions.json (IMPORTANT: core/data)
// ------------------------------------------------------------
const institutionsPath = path.join(__dirname, "data", "institutions.json");
let institutions = {};
try {
  institutions = JSON.parse(fs.readFileSync(institutionsPath, "utf8"));
  console.log("[aiRouting] institutions.json loaded OK");
} catch (err) {
  console.error("[aiRouting] ERROR loading institutions.json:", err.message);
  institutions = {};
}

// ------------------------------------------------------------
// 3) Helpers
// ------------------------------------------------------------
function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function textIncludesAny(text, kws) {
  const t = norm(text);
  return (kws || []).some((k) => t.includes(norm(k)));
}

function splitEmails(emailField) {
  if (!emailField) return [];
  return String(emailField)
    .split(/[;,/]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

// normalize ANY shape into a common institution shape
function toInstShape(x) {
  if (!x) return null;
  return {
    id: x.id || x.key || x.slug || x.code || x.short || x.name || "",
    org: x.org || x.name || "",
    title: x.title || "",
    email: x.email || "",
    address: x.address || "",
    category: x.category || x.type || "",
    sector: x.sector || "",
    state: x.state || "",
    keywords: Array.isArray(x.keywords) ? x.keywords : [],
  };
}

// Return array by key if present
function getArray(key) {
  const arr = institutions[key];
  return Array.isArray(arr) ? arr : [];
}

// Return array even if the old schema used an object map (international: {k:{...}})
function getArrayFromObjectMap(key) {
  const obj = institutions[key];
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return [];
  return Object.values(obj);
}

// Collect all pools to search through (for watchdog lookup)
function allPoolsAsArrays() {
  const pools = [];

  // known arrays in your core file
  const keys = Object.keys(institutions || {});
  for (const k of keys) {
    if (Array.isArray(institutions[k])) pools.push(institutions[k]);
  }

  // tolerate legacy object-map
  if (institutions.international && !Array.isArray(institutions.international)) {
    pools.push(Object.values(institutions.international));
  }

  return pools;
}

// Push unique by normalized org OR id
function pushUnique(list, inst) {
  if (!inst || !inst.org) return;
  const id = inst.id ? norm(inst.id) : "";
  const orgKey = norm(inst.org);
  if (!orgKey && !id) return;

  const exists = list.some((x) => {
    const xid = x?.id ? norm(x.id) : "";
    const xorg = x?.org ? norm(x.org) : "";
    return (id && xid && id === xid) || (orgKey && xorg && orgKey === xorg);
  });

  if (!exists) list.push(inst);
}

function dedupeAndRemove(list, removeOrgs = []) {
  const out = [];
  const removeKeys = (removeOrgs || []).map((x) => norm(x)).filter(Boolean);

  for (const item of list || []) {
    if (!item || !item.org) continue;
    const k = norm(item.org);
    if (!k) continue;
    if (removeKeys.includes(k)) continue;
    pushUnique(out, item);
  }
  return out;
}

// Find watchdog by id/org across all pools
function findAnyByIdOrOrg(idsOrNames) {
  const targets = (idsOrNames || []).map((x) => norm(x)).filter(Boolean);
  if (!targets.length) return null;

  const pools = allPoolsAsArrays();
  for (const pool of pools) {
    for (const raw of pool || []) {
      const inst = toInstShape(raw);
      if (!inst || !inst.org) continue;
      const id = norm(inst.id || "");
      const org = norm(inst.org || "");
      if (targets.includes(id) || targets.includes(org)) return inst;
    }
  }
  return null;
}

// Match best institution from array based on description + userAddress + keywords + org hits
function bestMatchFromArray(arr, description, userAddress) {
  const d = norm(description);
  const a = norm(userAddress);
  let best = null;
  let bestScore = 0;

  for (const raw of arr || []) {
    const inst = toInstShape(raw);
    if (!inst || !inst.org) continue;

    let score = 0;
    const orgN = norm(inst.org);

    // keyword hits
    for (const kw of inst.keywords || []) {
      const k = norm(kw);
      if (!k) continue;
      if (d.includes(k)) score += 3;
      if (a.includes(k)) score += 2;
    }

    // org name hit
    if (orgN && d.includes(orgN)) score += 5;

    // state hint
    if (inst.state && (d.includes(norm(inst.state)) || a.includes(norm(inst.state)))) score += 2;

    if (score > bestScore) {
      bestScore = score;
      best = inst;
    }
  }

  return bestScore > 0 ? best : null;
}

// ------------------------------------------------------------
// 4) Sector detection (broad)
// ------------------------------------------------------------
function detectSector(description) {
  const text = norm(description);

  const map = {
    police: [
      "police", "npf", "sars", "swat", "dpo", "checkpoint",
      "unlawful arrest", "illegal arrest", "detention", "cell", "bail",
      "extortion", "brutality", "kidnap", "kidnapping",
      "force headquarters", "commissioner of police", "inspector general", "igp",
    ],
    power: [
      "electricity", "light", "power", "disco", "estimated billing", "overbilling",
      "meter", "token", "transformer", "nerc", "aedc", "ikedc", "ekedc", "ibedc", "jedc", "phed", "kedco",
    ],
    banking: [
      "bank", "atm", "pos", "transfer", "reversal", "unauthorized debit",
      "fraud", "scam", "chargeback", "mobile banking", "internet banking",
      "loan", "card", "debit", "credit",
    ],
    telecom: [
      "mtn", "glo", "airtel", "9mobile", "network", "data", "airtime",
      "sim", "nin", "ussd", "call drop", "broadband", "isp", "router", "ncc",
    ],
    housing: [
      "landlord", "tenant", "rent", "eviction", "quit notice", "demolition",
      "task force", "development control", "urban development",
      "housing authority", "estate", "property", "land", "fcta", "fcda",
    ],
    health: [
      "hospital", "clinic", "doctor", "nurse", "medical negligence", "malpractice",
      "nhis", "hmo", "surgery", "pharmacy", "drug",
    ],
    education: [
      "school", "university", "polytechnic", "college", "teacher", "lecturer",
      "student", "jamb", "waec", "neco", "admission", "fees", "tuition",
    ],
    labour: [
      "salary", "wages", "promotion", "arrears", "pension", "allowance",
      "gratity", "dismissal", "termination", "suspension", "overtime",
      "labour", "union",
    ],
  };

  for (const [sector, kws] of Object.entries(map)) {
    if (textIncludesAny(text, kws)) return sector;
  }
  return "general";
}

// ------------------------------------------------------------
// 5) HARD RULE routing (PRIMARY -> THROUGH -> CC)
// ------------------------------------------------------------
function buildHardRoute(sector, description, userAddress = "") {
  const d = norm(description);
  const addr = norm(userAddress);

  // Watchdogs (try find from json first; fallback inline)
  const PCC =
    findAnyByIdOrOrg(["pcc", "public complaints commission"]) ||
    toInstShape({
      id: "pcc",
      org: "Public Complaints Commission",
      title: "The Honourable Chief Commissioner",
      email: "",
      address: "Abuja, Nigeria.",
      category: "watchdog",
      sector: "watchdog",
    });

  const NHRC =
    findAnyByIdOrOrg(["nhrc", "national human rights commission"]) ||
    toInstShape({
      id: "nhrc",
      org: "National Human Rights Commission",
      title: "The Executive Secretary",
      email: "",
      address: "Abuja, Nigeria.",
      category: "watchdog",
      sector: "watchdog",
    });

  const EFCC = findAnyByIdOrOrg(["efcc"]);
  const ICPC = findAnyByIdOrOrg(["icpc"]);
  const SERVICOM = findAnyByIdOrOrg(["servicom"]);
  const FCCPC = findAnyByIdOrOrg(["fccpc"]);
  const PSC = findAnyByIdOrOrg(["psc", "police service commission"]);
  const IGP = findAnyByIdOrOrg(["igp", "inspector-general of police"]);
  const NERC = findAnyByIdOrOrg(["nerc"]);
  const NCC = findAnyByIdOrOrg(["ncc", "nigerian communications commission"]);
  const CBN = findAnyByIdOrOrg(["cbn", "central bank of nigeria"]);
  const NDIC = findAnyByIdOrOrg(["ndic"]);
  const FMPower = findAnyByIdOrOrg(["federal ministry of power", "ministry of power"]);

  const out = { primary: null, through: null, ccList: [] };

  // ---------------- POLICE (STRICT) ----------------
  if (sector === "police") {
    // Primary: state CP where incident happened (if you have police_states array)
    const policeStates = getArray("police_states");
    const statePrimary = bestMatchFromArray(policeStates, description, userAddress);

    out.primary =
      statePrimary ||
      toInstShape({
        id: "cp_state",
        org: "Commissioner of Police, State Police Command",
        title: "The Commissioner of Police",
        email: "",
        address: "State Police Command Headquarters, Nigeria.",
        category: "police",
        sector: "police",
      });

    // Through: MUST be IGP
    out.through =
      (IGP ? toInstShape(IGP) : null) ||
      toInstShape({
        id: "igp",
        org: "Inspector-General of Police, Nigeria Police Force",
        title: "The Inspector-General of Police",
        email: "",
        address: "Force Headquarters, Abuja, Nigeria.",
        category: "police",
        sector: "police",
      });

    // CC MUST include: PSC + PCC + NHRC
    if (PSC) pushUnique(out.ccList, toInstShape(PSC));
    pushUnique(out.ccList, PCC);
    pushUnique(out.ccList, NHRC);

    // situational extras
    if (textIncludesAny(d, ["bribe", "corruption", "extortion"])) {
      if (EFCC) pushUnique(out.ccList, toInstShape(EFCC));
      if (ICPC) pushUnique(out.ccList, toInstShape(ICPC));
    }

    out.ccList = dedupeAndRemove(out.ccList, [out.primary?.org, out.through?.org]);
    return out;
  }

  // ---------------- POWER / DISCO (STRICT) ----------------
  if (sector === "power") {
    const discos = getArray("discos") || getArray("power_companies");
    const discoPrimary = bestMatchFromArray(discos, description, userAddress);

    out.primary =
      discoPrimary ||
      toInstShape({
        id: "disco_generic",
        org: "Electricity Distribution Company (DISCO)",
        title: "The Managing Director",
        email: "",
        address: "Nigeria.",
        category: "power",
        sector: "power",
      });

    out.through =
      (NERC ? toInstShape(NERC) : null) ||
      toInstShape({
        id: "nerc",
        org: "Nigerian Electricity Regulatory Commission (NERC)",
        title: "The Chairman/CEO",
        email: "",
        address: "Abuja, Nigeria.",
        category: "regulator",
        sector: "power",
      });

    // CC: FMPower + PCC + FCCPC (+ SERVICOM sometimes)
    if (FMPower) pushUnique(out.ccList, toInstShape(FMPower));
    pushUnique(out.ccList, PCC);
    if (FCCPC) pushUnique(out.ccList, toInstShape(FCCPC));
    if (SERVICOM && textIncludesAny(d, ["ministry", "federal", "agency"])) pushUnique(out.ccList, toInstShape(SERVICOM));

    out.ccList = dedupeAndRemove(out.ccList, [out.primary?.org, out.through?.org]);
    return out;
  }

  // ---------------- BANKING (STRICT) ----------------
  if (sector === "banking") {
    const bankBranches = getArray("bank_branches") || getArray("banks");
    const bankHQs = getArray("bank_hq");

    const branchPrimary = bestMatchFromArray(bankBranches, description, userAddress);

    out.primary =
      branchPrimary ||
      toInstShape({
        id: "bank_branch_generic",
        org: "Bank Branch (Customer Service / Branch Management)",
        title: "The Branch Manager",
        email: "",
        address: "Nigeria.",
        category: "banking",
        sector: "banking",
      });

    // Through: try match same bank HQ if possible
    let hq = null;
    if (branchPrimary && Array.isArray(bankHQs) && bankHQs.length) {
      const branchOrg = norm(branchPrimary.org);
      hq = bankHQs.map(toInstShape).find((x) => x?.org && branchOrg && norm(x.org).includes(branchOrg));
    }
    if (!hq) hq = bestMatchFromArray(bankHQs, description, userAddress);

    out.through =
      hq ||
      toInstShape({
        id: "bank_hq_generic",
        org: "Bank Headquarters (Customer Service / Complaints Unit)",
        title: "The Managing Director/CEO",
        email: "",
        address: "Nigeria.",
        category: "banking",
        sector: "banking",
      });

    // CC always: CBN + NDIC + PCC + FCCPC
    if (CBN) pushUnique(out.ccList, toInstShape(CBN));
    if (NDIC) pushUnique(out.ccList, toInstShape(NDIC));
    pushUnique(out.ccList, PCC);
    if (FCCPC) pushUnique(out.ccList, toInstShape(FCCPC));

    // situational: fraud/scam -> EFCC
    if (textIncludesAny(d, ["fraud", "scam"])) {
      if (EFCC) pushUnique(out.ccList, toInstShape(EFCC));
    }

    out.ccList = dedupeAndRemove(out.ccList, [out.primary?.org, out.through?.org]);
    return out;
  }

  // ---------------- TELECOM (STRICT-ish) ----------------
  if (sector === "telecom") {
    const telcos = getArray("telcos") || getArray("telecom_companies");
    const telcoPrimary = bestMatchFromArray(telcos, description, userAddress);

    out.primary =
      telcoPrimary ||
      toInstShape({
        id: "telco_generic",
        org: "Telecom Operator (Customer Care)",
        title: "Customer Care/Regional Manager",
        email: "",
        address: "Nigeria.",
        category: "telecom",
        sector: "telecom",
      });

    out.through =
      (NCC ? toInstShape(NCC) : null) ||
      toInstShape({
        id: "ncc",
        org: "Nigerian Communications Commission (NCC)",
        title: "The Executive Vice Chairman/CEO",
        email: "",
        address: "Abuja, Nigeria.",
        category: "regulator",
        sector: "telecom",
      });

    // CC: PCC + FCCPC always for consumer injustice; NHRC if harassment/threat
    pushUnique(out.ccList, PCC);
    if (FCCPC) pushUnique(out.ccList, toInstShape(FCCPC));
    if (textIncludesAny(d, ["threat", "harassment", "intimidation"])) pushUnique(out.ccList, NHRC);

    out.ccList = dedupeAndRemove(out.ccList, [out.primary?.org, out.through?.org]);
    return out;
  }

  // ---------------- HOUSING / EVICTION / DEMOLITION (STRICT-ish) ----------------
  if (sector === "housing") {
    const housingAuthorities = getArray("housing_authorities");
    const devControl = getArray("development_control");
    const taskForces = getArray("task_forces");

    const primary =
      bestMatchFromArray(housingAuthorities, description, userAddress) ||
      bestMatchFromArray(devControl, description, userAddress) ||
      bestMatchFromArray(taskForces, description, userAddress);

    out.primary =
      primary ||
      toInstShape({
        id: "housing_generic",
        org: "State/FCT Ministry of Housing / Urban Development",
        title: "The Honourable Commissioner / Director",
        email: "",
        address: "Nigeria.",
        category: "housing",
        sector: "housing",
      });

    // Through: FCTA if Abuja/FCT keywords, else state gov
    const fcta =
      findAnyByIdOrOrg(["fcta", "federal capital territory administration"]) ||
      null;

    if (addr.includes("abuja") || d.includes("abuja") || d.includes("fct") || d.includes("fcda") || d.includes("fcta")) {
      out.through =
        (fcta ? toInstShape(fcta) : null) ||
        toInstShape({
          id: "fcta",
          org: "Federal Capital Territory Administration (FCTA)",
          title: "The Honourable Minister of FCT",
          email: "",
          address: "Abuja, Nigeria.",
          category: "government",
          sector: "housing",
        });
    } else {
      out.through = toInstShape({
        id: "state_gov",
        org: "State Government (Office of the Governor / SSG)",
        title: "",
        email: "",
        address: "Relevant State, Nigeria.",
        category: "government",
        sector: "housing",
      });
    }

    // CC: PCC ALWAYS; NHRC if eviction/demolition; add PSC/IGP if police present; FCCPC if developer/estate etc
    pushUnique(out.ccList, PCC);

    if (textIncludesAny(d, ["demolition", "eviction", "task force"])) {
      pushUnique(out.ccList, NHRC);
    }
    if (textIncludesAny(d, ["police", "npf", "sars", "swat"])) {
      if (PSC) pushUnique(out.ccList, toInstShape(PSC));
      if (IGP) pushUnique(out.ccList, toInstShape(IGP));
    }
    if (FCCPC && textIncludesAny(d, ["developer", "estate", "property", "agent", "land"])) {
      pushUnique(out.ccList, toInstShape(FCCPC));
    }

    out.ccList = dedupeAndRemove(out.ccList, [out.primary?.org, out.through?.org]);
    return out;
  }

  // ---------------- HEALTH (fallback-ish) ----------------
  if (sector === "health") {
    // Primary: hospital/clinic if listed
    const health = getArray("health_agencies") || getArray("health");
    const primary = bestMatchFromArray(health, description, userAddress);

    out.primary =
      primary ||
      toInstShape({
        id: "health_generic",
        org: "Hospital/Clinic Management",
        title: "The Medical Director",
        email: "",
        address: "Nigeria.",
        category: "health",
        sector: "health",
      });

    // Through: ministry of health if present
    const fmh = findAnyByIdOrOrg(["federal ministry of health", "ministry of health"]);
    out.through =
      (fmh ? toInstShape(fmh) : null) ||
      toInstShape({
        id: "fmh",
        org: "Federal Ministry of Health",
        title: "The Honourable Minister",
        email: "",
        address: "Abuja, Nigeria.",
        category: "health",
        sector: "health",
      });

    // CC: PCC + NHRC (malpractice/abuse)
    pushUnique(out.ccList, PCC);
    if (textIncludesAny(d, ["malpractice", "negligence", "abuse", "death"])) pushUnique(out.ccList, NHRC);

    out.ccList = dedupeAndRemove(out.ccList, [out.primary?.org, out.through?.org]);
    return out;
  }

  // ---------------- EDUCATION (fallback-ish) ----------------
  if (sector === "education") {
    const edu = getArray("education_bodies") || getArray("education");
    const primary = bestMatchFromArray(edu, description, userAddress);

    out.primary =
      primary ||
      toInstShape({
        id: "edu_generic",
        org: "School/Institution Management",
        title: "The Head/Registrar",
        email: "",
        address: "Nigeria.",
        category: "education",
        sector: "education",
      });

    const fme = findAnyByIdOrOrg(["federal ministry of education", "ministry of education"]);
    out.through =
      (fme ? toInstShape(fme) : null) ||
      toInstShape({
        id: "fme",
        org: "Federal Ministry of Education",
        title: "The Honourable Minister",
        email: "",
        address: "Abuja, Nigeria.",
        category: "education",
        sector: "education",
      });

    pushUnique(out.ccList, PCC);
    out.ccList = dedupeAndRemove(out.ccList, [out.primary?.org, out.through?.org]);
    return out;
  }

  // ---------------- LABOUR (fallback-ish) ----------------
  if (sector === "labour") {
    out.primary = toInstShape({
      id: "employer",
      org: "Employer / HR Department",
      title: "The Head of HR",
      email: "",
      address: "Nigeria.",
      category: "labour",
      sector: "labour",
    });

    const fml = findAnyByIdOrOrg(["federal ministry of labour", "ministry of labour"]);
    out.through =
      (fml ? toInstShape(fml) : null) ||
      toInstShape({
        id: "fml",
        org: "Federal Ministry of Labour & Employment",
        title: "The Honourable Minister",
        email: "",
        address: "Abuja, Nigeria.",
        category: "labour",
        sector: "labour",
      });

    pushUnique(out.ccList, PCC);
    if (textIncludesAny(d, ["threat", "assault", "harassment"])) pushUnique(out.ccList, NHRC);

    out.ccList = dedupeAndRemove(out.ccList, [out.primary?.org, out.through?.org]);
    return out;
  }

  // ---------------- GENERAL (fallback) ----------------
  // Primary: PCC (admin injustice); Through: none; CC: NHRC if violence/human-rights cues
  out.primary = PCC;
  out.through = null;

  if (textIncludesAny(d, ["torture", "rape", "sexual", "kidnap", "killing", "death", "assault"])) {
    pushUnique(out.ccList, NHRC);
  }

  out.ccList = dedupeAndRemove(out.ccList, [out.primary?.org]);
  return out;
}

// ------------------------------------------------------------
// 6) Optional OpenAI assist (ONLY for sector pick; HARD rules still dominate)
// ------------------------------------------------------------
async function openaiAssistPickSector(description) {
  if (!openai) return null;

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      messages: [
        { role: "system", content: "Classify the complaint into exactly one word: police, power, banking, telecom, housing, health, education, labour, general." },
        { role: "user", content: description || "" },
      ],
    });

    const txt = norm(resp?.choices?.[0]?.message?.content || "");
    const allowed = ["police", "power", "banking", "telecom", "housing", "health", "education", "labour", "general"];
    if (allowed.includes(txt)) return txt;
    return null;
  } catch (e) {
    return null;
  }
}

// ------------------------------------------------------------
// 7) Main exported function
// ------------------------------------------------------------
async function detectHybrid(description, userAddress = "") {
  const offlineSector = detectSector(description);
  const aiSector = await openaiAssistPickSector(description);

  // AI can suggest sector, but we still always run hard rules
  const sector = aiSector || offlineSector || "general";

  const route = buildHardRoute(sector, description, userAddress);

  // final sanity: ensure structure always safe
  const primary = route.primary && route.primary.org ? route.primary : null;
  const through = route.through && route.through.org ? route.through : null;
  let ccList = Array.isArray(route.ccList) ? route.ccList : [];

  // remove duplicates again hard
  const remove = [];
  if (primary?.org) remove.push(primary.org);
  if (through?.org) remove.push(through.org);
  ccList = dedupeAndRemove(ccList, remove);

  return { primary, through, ccList, sector };
}

module.exports = { detectHybrid };

// core/aiRouting.js - PetitionDesk Hybrid Routing (STRICT RULES - All Sectors)
// --------------------------------------------------------------------------
const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

// --------------------------------------------------------------------------
// OPENAI CLIENT (optional)
// --------------------------------------------------------------------------
function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  } catch {
    return null;
  }
}
const openai = getOpenAIClient();

// --------------------------------------------------------------------------
// LOAD institutions.json (robust path search)
// --------------------------------------------------------------------------
function loadInstitutions() {
  const candidates = [
    path.join(__dirname, "..", "data", "institutions.json"), // recommended
    path.join(__dirname, "data", "institutions.json"),       // fallback
    path.join(process.cwd(), "data", "institutions.json"),   // fallback
  ];

  for (const p of candidates) {
    try {
      const txt = fs.readFileSync(p, "utf8");
      const j = JSON.parse(txt);
      console.log("[aiRouting] institutions.json loaded from:", p);
      return j;
    } catch (e) {}
  }

  console.error("❌ [aiRouting] Could not load institutions.json from any known path.");
  return {};
}

const institutions = loadInstitutions();

// Helpers
function getArray(name) {
  const arr = institutions[name];
  return Array.isArray(arr) ? arr : [];
}

function normalise(s) {
  return String(s || "").trim().toLowerCase();
}

// Find any institution by id across ALL arrays
function findById(id) {
  if (!id) return null;
  const arrays = Object.values(institutions).filter(Array.isArray);
  for (const arr of arrays) {
    const found = arr.find((x) => x && x.id === id);
    if (found) return found;
  }
  return null;
}

// Filter institutions by category field
function filterByCategory(category) {
  if (!category) return [];
  const arrays = Object.values(institutions).filter(Array.isArray);
  const out = [];
  for (const arr of arrays) {
    for (const item of arr) {
      if (item && item.category === category) out.push(item);
    }
  }
  return out;
}

// Push unique by id (or org fallback)
function pushUnique(list, inst) {
  if (!inst) return;
  const id = inst.id || "";
  const orgKey = normalise(inst.org);
  const exists = list.some((x) => (id && x.id === id) || (!id && normalise(x.org) === orgKey));
  if (!exists) list.push(inst);
}

// Remove duplicates and also remove "through" from ccList
function finalizeRouting(primary, through, ccList) {
  const cc = [];
  (ccList || []).forEach((x) => pushUnique(cc, x));

  // Remove primary from CC
  if (primary?.id) {
    for (let i = cc.length - 1; i >= 0; i--) if (cc[i].id === primary.id) cc.splice(i, 1);
  } else if (primary?.org) {
    const k = normalise(primary.org);
    for (let i = cc.length - 1; i >= 0; i--) if (normalise(cc[i].org) === k) cc.splice(i, 1);
  }

  // Remove through from CC
  if (through?.id) {
    for (let i = cc.length - 1; i >= 0; i--) if (cc[i].id === through.id) cc.splice(i, 1);
  } else if (through?.org) {
    const k = normalise(through.org);
    for (let i = cc.length - 1; i >= 0; i--) if (normalise(cc[i].org) === k) cc.splice(i, 1);
  }

  return { primary: primary || null, through: through || null, ccList: cc };
}

// Build safe placeholder if missing in dataset (NO fake emails)
function placeholder(id, org) {
  return { id, org, title: "", email: "", address: "" };
}

// --------------------------------------------------------------------------
// INTERNATIONAL DETECTOR (HARD RULE)
// --------------------------------------------------------------------------
function detectInternational(description = "") {
  const text = description.toLowerCase();
  const triggers = [
    "embassy", "high commission", "foreign", "international",
    "united states", "usa", "u.s.", "uk", "british", "canada",
    "european union", "eu", "germany", "france",
    "china", "india", "uae", "dubai",
    "un", "united nations", "human rights council",
    "deportation", "visa", "immigration", "asylum",
    "facebook", "meta", "google", "x.com", "twitter", "tiktok",
    "binance", "crypto exchange"
  ];
  return triggers.some((k) => text.includes(k));
}

// --------------------------------------------------------------------------
// SECTOR DETECTION (broad + strict keywords)
// --------------------------------------------------------------------------
function detectSector(description = "") {
  const text = description.toLowerCase();

  const map = {
    police: ["police", "npf", "igp", "cp", "sars", "swat", "station", "detention", "cell", "illegal arrest", "brutality", "extortion", "checkpoint", "bail"],
    power: ["electricity", "light", "power", "disco", "meter", "token", "estimated billing", "overbilling", "blackout", "transformer", "aedc", "ekedc", "ibedc", "jedc", "phedc", "kedco", "bedc"],
    telecom: ["mtn", "glo", "airtel", "9mobile", "etisalat", "network", "data", "airtime", "sim", "nin linkage", "call drop", "internet", "broadband", "ussd"],
    banking: ["bank", "atm", "pos", "transfer", "failed transaction", "reversal", "chargeback", "debit", "unauthorized debit", "fraud", "loan", "interest", "mobile banking", "internet banking"],
    housing: ["landlord", "tenant", "rent", "eviction", "demolition", "task force", "quit notice", "tenancy", "estate", "allocation", "land", "property", "agent"],
    health: ["hospital", "clinic", "doctor", "nurse", "medical", "malpractice", "misdiagnosis", "nhis", "hmo", "treatment", "surgery", "pharmacy", "drug reaction"],
    education: ["school", "university", "polytechnic", "college", "student", "lecturer", "teacher", "admission", "expulsion", "rustication", "fees", "tuition", "jamb", "waec", "neco"],
    labour: ["salary", "wage", "promotion", "dismissal", "termination", "suspension", "pension", "gratuity", "overtime", "allowance", "arrears"],
  };

  for (const sector of Object.keys(map)) {
    if (map[sector].some((k) => text.includes(k))) return sector;
  }
  return "general";
}

// --------------------------------------------------------------------------
// STATE POLICE COMMAND DETECTION (PRIMARY must be state CP)
// --------------------------------------------------------------------------
function getStatePoliceCommand(userAddress = "", description = "") {
  const text = (userAddress + " " + description).toLowerCase();
  const states = getArray("police_states");

  // If you stored state police commands as "police_states"
  for (const item of states) {
    if (!item?.state) continue;
    const s = String(item.state).toLowerCase();
    if (text.includes(s)) return item;
  }

  // fallback: simple common states if dataset is incomplete
  const common = [
    { id: "police_state_lagos", state: "Lagos", org: "Commissioner of Police, Lagos State Command", title: "The Commissioner of Police", email: "", address: "Lagos State Police Command Headquarters, Lagos, Nigeria." },
    { id: "police_state_fct", state: "Abuja", org: "Commissioner of Police, FCT Command", title: "The Commissioner of Police", email: "", address: "FCT Police Command Headquarters, Abuja, Nigeria." },
    { id: "police_state_rivers", state: "Rivers", org: "Commissioner of Police, Rivers State Command", title: "The Commissioner of Police", email: "", address: "Rivers State Police Command Headquarters, Port Harcourt, Nigeria." },
    { id: "police_state_akwaibom", state: "Akwa Ibom", org: "Commissioner of Police, Akwa Ibom State Command", title: "The Commissioner of Police", email: "", address: "Akwa Ibom State Police Command Headquarters, Uyo, Nigeria." },
  ];

  for (const item of common) {
    if (text.includes(item.state.toLowerCase())) return item;
  }

  return null;
}

// --------------------------------------------------------------------------
// STRICT SECTOR ROUTING RULES (YOUR REQUIRED PATTERNS)
// --------------------------------------------------------------------------
function getInstitutionsForSector(sector, userAddress = "", description = "") {
  const cc = [];

  // ALWAYS-AVAILABLE CORE WATCHDOGS
  const PCC = findById("pcc") || findById("public_complaints_commission") || placeholder("pcc", "Public Complaints Commission");
  const NHRC = findById("nhrc") || placeholder("nhrc", "National Human Rights Commission");

  // --- Police strict rule
  if (sector === "police") {
    const stateCP = getStatePoliceCommand(userAddress, description) || placeholder("police_state_unknown", "Commissioner of Police, State Command");
    const IGP = findById("igp") || placeholder("igp", "Inspector-General of Police, Nigeria Police Force");
    const PSC = findById("psc") || placeholder("psc", "Police Service Commission");

    // PRIMARY = State CP
    const primary = stateCP;

    // THROUGH = IGP
    const through = IGP;

    // CC = PSC + PCC + NHRC (ALWAYS)
    pushUnique(cc, PSC);
    pushUnique(cc, PCC);
    pushUnique(cc, NHRC);

    return finalizeRouting(primary, through, cc);
  }

  // --- Electricity / Power strict rule
  if (sector === "power") {
    // PRIMARY = DISCO involved
    // If you have multiple discos in institutions.json, you can improve this later by detecting state -> disco mapping.
    const DISCO =
      findById("aedc") ||
      findById("ekedc") ||
      findById("ibedc") ||
      findById("jedc") ||
      findById("phedc") ||
      findById("kedco") ||
      findById("bedc") ||
      findById("disco") ||
      placeholder("disco_generic", "Electricity Distribution Company (DISCO)");

    // THROUGH = NERC
    const NERC = findById("nerc") || placeholder("nerc", "Nigerian Electricity Regulatory Commission (NERC)");

    // CC = Federal Ministry of Power + PCC + FCCPC (+ SERVICOM sometimes)
    const MIN_POWER = findById("ministry_power") || placeholder("ministry_power", "Federal Ministry of Power");
    const FCCPC = findById("fccpc") || placeholder("fccpc", "Federal Competition and Consumer Protection Commission (FCCPC)");
    const SERVICOM = findById("servicom");

    const primary = DISCO;
    const through = NERC;

    pushUnique(cc, MIN_POWER);
    pushUnique(cc, PCC);
    pushUnique(cc, FCCPC);

    // SERVICOM = situational (public service failure/MDAs)
    const t = description.toLowerCase();
    const servicomTriggers = ["mda", "federal secretariat", "ministry", "agency", "public service", "civil service", "government office", "servicom"];
    if (SERVICOM && servicomTriggers.some(k => t.includes(k))) pushUnique(cc, SERVICOM);

    return finalizeRouting(primary, through, cc);
  }

  // --- Banking strict rule
  if (sector === "banking") {
    // PRIMARY = Bank branch involved (best-effort: generic Bank Branch if unknown)
    const BANK_BRANCH = placeholder("bank_branch", "The Branch Manager, [Bank Name] – [Branch Address]");
    // THROUGH = Bank HQ
    const BANK_HQ = placeholder("bank_hq", "The Managing Director/CEO, [Bank Name] (Head Office)");

    // CC = CBN + NDIC + PCC + FCCPC
    const CBN = findById("cbn_consumer") || findById("cbn") || placeholder("cbn", "Central Bank of Nigeria (CBN) – Consumer Protection Department");
    const NDIC = findById("ndic") || placeholder("ndic", "Nigeria Deposit Insurance Corporation (NDIC)");
    const FCCPC = findById("fccpc") || placeholder("fccpc", "Federal Competition and Consumer Protection Commission (FCCPC)");

    const primary = BANK_BRANCH;
    const through = BANK_HQ;

    pushUnique(cc, CBN);
    pushUnique(cc, NDIC);
    pushUnique(cc, PCC);
    pushUnique(cc, FCCPC);

    return finalizeRouting(primary, through, cc);
  }

  // --- Housing / Eviction / Demolition strict rule (your INTERNAL ERROR case)
  if (sector === "housing") {
    // PRIMARY = the immediate actor (task force / landlord / developer / agency)
    const primary = placeholder("housing_primary", "The Relevant Authority / Task Force / Landlord / Property Manager");

    // THROUGH = supervising authority (FCTA / State Ministry / Housing Authority)
    const FCTA = findById("fcta") || findById("fct_admin") || null;
    const MIN_HOUSING = findById("ministry_housing") || null;

    const through =
      FCTA ||
      MIN_HOUSING ||
      placeholder("housing_through", "The Supervising Authority (FCTA / State Ministry of Housing)");

    // CC = PCC + FCCPC (+ SERVICOM situational)
    const FCCPC = findById("fccpc") || placeholder("fccpc", "Federal Competition and Consumer Protection Commission (FCCPC)");
    const SERVICOM = findById("servicom");

    pushUnique(cc, PCC);
    pushUnique(cc, FCCPC);

    const t = description.toLowerCase();
    const servicomTriggers = ["ministry", "agency", "authority", "public office", "government", "allocation", "fcta", "federal"];
    if (SERVICOM && servicomTriggers.some(k => t.includes(k))) pushUnique(cc, SERVICOM);

    // If human rights language exists, CC NHRC too
    const rightsTriggers = ["assault", "brutality", "threat", "torture", "unlawful", "illegal", "kill", "gun", "violence"];
    if (rightsTriggers.some(k => t.includes(k))) pushUnique(cc, NHRC);

    return finalizeRouting(primary, through, cc);
  }

  // --- Telecom rule (base strict)
  if (sector === "telecom") {
    const TELCO = placeholder("telco_primary", "Customer Care Department, [Network Provider]");
    const NCC = findById("ncc") || placeholder("ncc", "Nigerian Communications Commission (NCC)");
    const FCCPC = findById("fccpc") || placeholder("fccpc", "Federal Competition and Consumer Protection Commission (FCCPC)");

    const primary = TELCO;
    const through = NCC;

    pushUnique(cc, PCC);
    pushUnique(cc, FCCPC);

    return finalizeRouting(primary, through, cc);
  }

  // --- Health rule (base)
  if (sector === "health") {
    const HOSP = placeholder("health_primary", "Medical Director / Chief Medical Director, [Hospital/Clinic]");
    const FMOH = findById("ministry_health") || placeholder("ministry_health", "Federal Ministry of Health");
    const MDCN = findById("mdcn") || null;

    const primary = HOSP;
    const through = FMOH;

    pushUnique(cc, PCC);
    if (MDCN) pushUnique(cc, MDCN);

    return finalizeRouting(primary, through, cc);
  }

  // Default: general administrative injustice -> PCC primary watchdog
  const primary = PCC;
  const through = null;
  return finalizeRouting(primary, through, []);
}

// --------------------------------------------------------------------------
// OPTIONAL AI DETECT (fallback) - returns best-guess institution objects
// NOTE: We still enforce STRICT routing patterns after AI selection.
// --------------------------------------------------------------------------
async function aiDetect(description = "") {
  if (!openai) return { primary: null, through: null, ccList: [] };

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            'Return ONLY JSON: {"sector":"", "summary":"", "keywords":[]} with sector among: police,power,telecom,banking,housing,health,education,labour,general. No markdown.',
        },
        { role: "user", content: description },
      ],
    });

    const txt = resp.choices?.[0]?.message?.content || "{}";
    const data = JSON.parse(txt);
    return data;
  } catch {
    return { sector: "general" };
  }
}

// --------------------------------------------------------------------------
// MAIN HYBRID DETECT (STRICT RULES ALWAYS WIN)
// --------------------------------------------------------------------------
async function detectHybrid(description = "", userAddress = "") {
  // 1) INTERNATIONAL override
  if (detectInternational(description)) {
    const pcc = findById("pcc") || placeholder("pcc", "Public Complaints Commission");
    const nhrc = findById("nhrc") || placeholder("nhrc", "National Human Rights Commission");
    const mfa = findById("ministry_foreign_affairs") || placeholder("ministry_foreign_affairs", "Federal Ministry of Foreign Affairs");
    const agf = findById("attorney_general_federation") || placeholder("attorney_general_federation", "Attorney-General of the Federation / Federal Ministry of Justice");

    const intl = [
      ...filterByCategory("international_policy"),
      ...filterByCategory("foreign_government"),
      ...filterByCategory("regional"),
      ...filterByCategory("ngo"),
    ];

    const primary = intl[0] || placeholder("intl_primary", "Relevant International Body / Embassy / Regulator");
    const through = mfa || agf;

    const cc = [];
    intl.slice(1).forEach((x) => pushUnique(cc, x));
    pushUnique(cc, agf);
    pushUnique(cc, pcc);
    pushUnique(cc, nhrc);

    const routed = finalizeRouting(primary, through, cc);
    return { ...routed, sector: "international" };
  }

  // 2) Sector detect (keyword-based)
  let sector = detectSector(description);

  // 3) AI assist ONLY if sector looks too general
  if (sector === "general") {
    const ai = await aiDetect(description);
    if (ai?.sector) sector = ai.sector;
  }

  // 4) STRICT sector routing patterns (ALWAYS)
  const routed = getInstitutionsForSector(sector, userAddress, description);

  return { ...routed, sector };
}

module.exports = {
  detectHybrid,
  detectSector,
};

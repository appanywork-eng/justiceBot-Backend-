// core/aiRouting.js - PetitionDesk Hybrid Routing (STRICT + AI EXTRACTOR)
// STRICT rules ALWAYS win. AI is used ONLY to extract missing context (state/city/disco etc).

"use strict";

const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

// ----------------------------
// OPENAI CLIENT (optional)
// ----------------------------
function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  } catch (e) {
    return null;
  }
}
const openai = getOpenAIClient();

// ----------------------------
// LOAD institutions.json
// ----------------------------
function loadInstitutions() {
  const candidates = [
    path.join(__dirname, "..", "data", "institutions.json"),
    path.join(__dirname, "data", "institutions.json"),
    path.join(process.cwd(), "data", "institutions.json"),
  ];

  for (const p of candidates) {
    try {
      const txt = fs.readFileSync(p, "utf8");
      const j = JSON.parse(txt);
      console.log(`[aiRouting] institutions.json loaded from: ${p}`);
      return j;
    } catch (e) {}
  }

  console.error("❌ [aiRouting] Could not load institutions.json from candidates.");
  return {};
}

const institutions = loadInstitutions();

// ----------------------------
// HELPERS
// ----------------------------
function normalise(s) {
  return String(s || "").trim().toLowerCase();
}

function getArray(name) {
  const arr = institutions[name];
  return Array.isArray(arr) ? arr : [];
}

// Find any institution by id across ALL arrays in institutions.json
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

// Safe placeholder (NO fake emails)
function placeholder(id, org) {
  return { id, org, title: "", email: "", address: "" };
}

// Push unique by id OR orgKey (fallback)
function pushUnique(list, inst) {
  if (!inst) return;
  const id = inst.id || "";
  const orgKey = normalise(inst.org);
  const exists = list.some((x) => {
    if (!x) return false;
    if (id && x.id && x.id === id) return true;
    return orgKey && normalise(x.org) === orgKey;
  });
  if (!exists) list.push(inst);
}

// Remove duplicates AND remove "through" from CC list robustly
function finalizeRouting(primary, through, ccList) {
  const cc = [];
  (ccList || []).forEach((x) => pushUnique(cc, x));

  const primaryKey = primary?.id || normalise(primary?.org);
  const throughKey = through?.id || normalise(through?.org);

  // Remove primary from CC
  for (let i = cc.length - 1; i >= 0; i--) {
    const item = cc[i];
    if (!item) continue;
    const k = item.id || normalise(item.org);
    if (primaryKey && k === primaryKey) cc.splice(i, 1);
  }

  // Remove through from CC
  for (let i = cc.length - 1; i >= 0; i--) {
    const item = cc[i];
    if (!item) continue;
    const k = item.id || normalise(item.org);
    if (throughKey && k === throughKey) cc.splice(i, 1);
  }

  // Extra: remove any accidental duplicates by org/title text
  const seen = new Set();
  for (let i = cc.length - 1; i >= 0; i--) {
    const item = cc[i];
    const k = normalise(item?.id || "") + "|" + normalise(item?.org || "") + "|" + normalise(item?.title || "");
    if (seen.has(k)) cc.splice(i, 1);
    else seen.add(k);
  }

  return { primary: primary || null, through: through || null, ccList: cc };
}

// ----------------------------
// INTERNATIONAL DETECTOR (hard rule)
// ----------------------------
function detectInternational(description = "") {
  const text = description.toLowerCase();
  const triggers = [
    "embassy",
    "high commission",
    "foreign",
    "international",
    "united states",
    "usa",
    "u.s.",
    "uk",
    "british",
    "canada",
    "european union",
    "eu",
    "germany",
    "france",
    "china",
    "india",
    "uae",
    "dubai",
    "un",
    "united nations",
    "human rights council",
    "deportation",
    "visa",
    "immigration",
    "asylum",
    "facebook",
    "meta",
    "google",
    "x.com",
    "twitter",
    "tiktok",
    "binance",
    "crypto exchange",
  ];
  return triggers.some((k) => text.includes(k));
}

// ----------------------------
// SECTOR DETECTION (keyword-based baseline)
// You can expand freely to 14+ sectors.
// ----------------------------
function detectSector(description = "") {
  const text = description.toLowerCase();

  const map = {
    police: ["police", "npf", "igp", "cp", "sars", "swat", "arrest", "detention", "extortion", "checkpoint"],
    power: ["electricity", "light", "power", "disco", "meter", "estimated billing", "ekedc", "aedc", "ibedc", "jedc", "phed", "kedco", "bedc"],
    telecom: ["mtn", "glo", "airtel", "9mobile", "etisalat", "network", "sim", "data", "call", "recharge"],
    banking: ["bank", "atm", "pos", "transfer", "debit", "credit", "failed transaction", "chargeback", "card"],
    housing: ["landlord", "tenant", "rent", "eviction", "demolition", "house", "estate", "agent"],
    health: ["hospital", "clinic", "doctor", "nurse", "medical", "pharmacy"],
    education: ["school", "university", "polytechnic", "student", "waec", "jamb"],
    labour: ["salary", "wage", "promotion", "dismissal", "termination", "workplace"],
    maritime: ["nimasa", "ship", "vessel", "port", "npa", "shipping", "seaport", "cargo"],
    aviation: ["ncaa", "faan", "airport", "flight", "airline", "aviation"],
    immigration: ["immigration", "passport", "nigerian immigration", "nis"],
    customs: ["customs", "clearing", "duty", "container", "seizure"],
    consumer: ["fccpc", "consumer", "refund", "defective", "warranty", "fraud"],
    telecom_reg: ["ncc", "communications commission"],
  };

  for (const sector of Object.keys(map)) {
    if (map[sector].some((k) => text.includes(k))) return sector;
  }

  return "general";
}

// ----------------------------
// STATE EXTRACTION (deterministic first, AI second)
// ----------------------------
const NIGERIAN_STATES = [
  "abia","adamawa","akwa ibom","anambra","bauchi","bayelsa","benue","borno","cross river","delta","ebonyi","edo","ekiti","enugu","gombe",
  "imo","jigawa","kaduna","kano","katsina","kebbi","kogi","kwara","lagos","nasarawa","niger","ogun","ondo","osun","oyo","plateau","rivers",
  "sokoto","taraba","yobe","zamfara","fct","abuja"
];

function getStateFromText(userAddress = "", description = "") {
  const text = (userAddress + " " + description).toLowerCase();

  // If you stored police states in institutions.json as "police_states" use it.
  const statesData = getArray("police_states");
  for (const item of statesData) {
    if (!item?.state) continue;
    const s = String(item.state).toLowerCase();
    if (s && text.includes(s)) return item.state;
  }

  // fallback: raw state name matching
  for (const s of NIGERIAN_STATES) {
    if (text.includes(s)) {
      if (s === "abuja") return "FCT";
      if (s === "fct") return "FCT";
      // Title case-ish
      return s.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    }
  }

  return null;
}

// Build a CP object for a given state (even if dataset lacks it)
function buildStateCP(state) {
  const st = state || "State";
  const id = `police_state_${normalise(st).replace(/\s+/g, "_")}`;
  return {
    id,
    org: `Commissioner of Police, ${st} State Command`,
    title: `Commissioner of Police, ${st} State Command`,
    email: "",
    address: "Nigeria",
    category: "police",
    state: st,
  };
}

// ----------------------------
// DISCO DETECTION (deterministic first, AI second)
// ----------------------------
function pickDiscoFromText(description = "", userAddress = "") {
  const text = (description + " " + userAddress).toLowerCase();

  // Very common disco hints
  const discoHints = [
    { id: "ekedc", keys: ["ekedc", "eko disco", "eko electricity", "eko distribution", "eko electric"] },
    { id: "ikedc", keys: ["ikedc", "ikeja disco", "ikeja electric", "ikeja electricity"] },
    { id: "aedc", keys: ["aedc", "abuja disco", "abuja electricity"] },
    { id: "ibedc", keys: ["ibedc", "ibadan disco"] },
    { id: "jedc", keys: ["jedc", "jos disco"] },
    { id: "phedc", keys: ["phed", "phedc", "port harcourt disco"] },
    { id: "kedco", keys: ["kedco", "kano disco"] },
    { id: "bedc", keys: ["bedc", "benin disco"] },
  ];

  for (const h of discoHints) {
    if (h.keys.some((k) => text.includes(k))) {
      const inst = findById(h.id);
      if (inst) return inst;
      return placeholder(h.id, h.id.toUpperCase());
    }
  }

  return null;
}

// ----------------------------
// AI CONTEXT EXTRACTOR (IMPORTANT)
// AI DOES NOT ROUTE. It only extracts missing specifics.
// ----------------------------
async function extractContextAI(description = "", userAddress = "") {
  if (!openai) return {};
  try {
    const prompt = `
You are extracting structured facts from a complaint text for routing.
Return ONLY valid JSON.
Fields:
- sector: one of ["police","power","telecom","banking","housing","health","education","labour","maritime","aviation","immigration","customs","general","international"]
- country: string or null
- state: Nigerian state name like "Delta" or "Lagos" or "FCT" (or null)
- city: string or null
- disco: short disco hint like "EKEDC" or "AEDC" or "IKEDC" or null

Rules:
- Do NOT guess if not present. Use null.
- If location appears (e.g. "Warri, Delta"), set city="Warri", state="Delta".
- For power: if it mentions Eko/EKEDC set disco="EKEDC". If Abuja/AEDC set disco="AEDC". If Ikeja/IKEDC set disco="IKEDC".

Return ONLY JSON, no markdown.
`;

    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      messages: [
        { role: "system", content: prompt.trim() },
        { role: "user", content: `ADDRESS:\n${userAddress}\n\nCOMPLAINT:\n${description}` },
      ],
    });

    const txt = resp?.choices?.[0]?.message?.content || "{}";
    const data = JSON.parse(txt);
    return data && typeof data === "object" ? data : {};
  } catch (e) {
    return {};
  }
}

// ----------------------------
// STRICT SECTOR ROUTING RULES (hard rules always win)
// Now accepts ctx so we can build "Delta State Command" etc.
// ----------------------------
async function getInstitutionsForSector(sector, userAddress = "", description = "", ctx = {}) {
  const cc = [];
let primary = null;
let through = null;

  // Always-available watchdogs
  const PCC = findById("pcc") || placeholder("pcc", "Public Complaints Commission");
  const NHRC = findById("nhrc") || placeholder("nhrc", "National Human Rights Commission");
  const FCCPC = findById("fccpc") || placeholder("fccpc", "Federal Competition and Consumer Protection Commission");

  // ----------------------------
  // POLICE (STRICT)
  // PRIMARY = CP of STATE, THROUGH = IGP, CC = PSC + PCC + NHRC
  // ----------------------------
  if (sector === "police") {
    const IGP = findById("igp") || placeholder("igp", "Inspector-General of Police, Nigeria Police Force");
    const PSC = findById("psc") || placeholder("psc", "Police Service Commission");

    // Determine state (deterministic first)
    let state = ctx?.state || getStateFromText(userAddress, description);

    // If still missing and OpenAI available, extract
    if (!state) {
      const ai = await extractContextAI(description, userAddress);
      if (ai?.state) state = ai.state;
    }
primary = state ? buildStateCP(state) : placeholder("state_cp", "Commissioner of Police, State Command");
through = IGP;

    // CC (DO NOT ADD IGP HERE)
    pushUnique(cc, PSC);
    pushUnique(cc, PCC);
    pushUnique(cc, NHRC);

    return finalizeRouting(primary, through, cc);
  }
// ----------------------------------------------------
// TRANSPORT (STRICT)
// PRIMARY = operator involved
// THROUGH = correct regulator
// CC = PCC + FCCPC (+ SERVICOM if public transport)
// ----------------------------------------------------
if (sector === "transport") {
  const text = (userAddress + " " + description).toLowerCase();

  // Load datasets
  const FRSC = findById("frsc") || placeholder("frsc", "Federal Road Safety Corps");
  const NRC = findById("nrc") || placeholder("nrc", "Nigerian Railway Corporation");
  const NCAA = findById("ncaa") || placeholder("ncaa", "Nigerian Civil Aviation Authority");
  const NIMASA = findById("nimasa") || placeholder("nimasa", "Nigerian Maritime Administration and Safety Agency");

  const airlines = getArray("airlines");
  const airports = getArray("airports");
  const shippingLines = getArray("shipping_lines");
  const ports = getArray("ports");
  const towingCompanies = getArray("towing_companies");
  const stateTransport = getArray("state_transport_agencies");

  let primary = null;
  let through = null;

  // --- Aviation
  if (text.includes("flight") || text.includes("airline") || text.includes("airport")) {
    primary =
      airlines.find(x => text.includes(x.name.toLowerCase())) ||
      airports.find(x => text.includes(x.name.toLowerCase())) ||
      placeholder("aviation_operator", "Aviation Operator");

    through = NCAA;
  }

  // --- Maritime
  else if (text.includes("ship") || text.includes("port") || text.includes("container")) {
    primary =
      shippingLines.find(x => text.includes(x.name.toLowerCase())) ||
      ports.find(x => text.includes(x.name.toLowerCase())) ||
      placeholder("maritime_operator", "Maritime Operator");

    through = NIMASA;
  }

  // --- Road / Towing / Bus / LASTMA-style
  else {
    primary =
      towingCompanies.find(x => text.includes(x.name.toLowerCase())) ||
      placeholder("road_operator", "Road Transport Operator");

    through = FRSC;

    // Try state transport authority
    const stateAgency = stateTransport.find(x =>
      text.includes(x.state?.toLowerCase())
    );
    if (stateAgency) pushUnique(cc, stateAgency);
  }

  // CC watchdogs
  pushUnique(cc, PCC);
  pushUnique(cc, FCCPC);

  // SERVICOM if public transport or MDA involved
  if (
    text.includes("government") ||
    text.includes("ministry") ||
    text.includes("agency") ||
    text.includes("public")
  ) {
    const SERVICOM = findById("servicom");
    if (SERVICOM) pushUnique(cc, SERVICOM);
  }

  return finalizeRouting(primary, through, cc);
  // ----------------------------
  // POWER / ELECTRICITY (STRICT)
  // PRIMARY = DISCO involved, THROUGH = NERC, CC = MIN POWER + PCC + FCCPC (+ SERVICOM optional)
  // ----------------------------
  if (sector === "power") {
    const NERC = findById("nerc") || placeholder("nerc", "Nigerian Electricity Regulatory Commission (NERC)");
    const MIN_POWER = findById("ministry_power") || findById("ministry_of_power") || placeholder("ministry_power", "Federal Ministry of Power");
    const SERVICOM = findById("servicom");

    // Determine disco (deterministic first)
    let discoInst = pickDiscoFromText(description, userAddress);

    // If still missing and OpenAI available, extract disco hint
    if (!discoInst) {
      const ai = await extractContextAI(description, userAddress);
      const hint = normalise(ai?.disco || "");
      if (hint.includes("ekedc") || hint.includes("eko")) discoInst = findById("ekedc") || placeholder("ekedc", "Eko Electricity Distribution Company (EKEDC)");
      else if (hint.includes("aedc") || hint.includes("abuja")) discoInst = findById("aedc") || placeholder("aedc", "Abuja Electricity Distribution Company (AEDC)");
      else if (hint.includes("ikedc") || hint.includes("ikeja")) discoInst = findById("ikedc") || placeholder("ikedc", "Ikeja Electric / IKEDC");
    }

    // Final fallback
    const DISCO = discoInst || findById("disco") || placeholder("disco_generic", "Electricity Distribution Company (DISCO)");

    const primary = DISCO;
    const through = NERC;

    pushUnique(cc, MIN_POWER);
    pushUnique(cc, PCC);
    pushUnique(cc, FCCPC);

    // SERVICOM = situational (public service failure/MDAs)
    const t = description.toLowerCase();
    const servicomTriggers = ["mda", "federal secretariat", "ministry", "agency", "authority", "commission"];
    if (SERVICOM && servicomTriggers.some((k) => t.includes(k))) pushUnique(cc, SERVICOM);

    return finalizeRouting(primary, through, cc);
  }

  // ----------------------------
  // TELECOM (base strict)
  // PRIMARY = TELCO, THROUGH = NCC
  // ----------------------------
  if (sector === "telecom") {
    const TELCO = placeholder("telco_primary", "Customer Care / Telecom Provider");
    const NCC = findById("ncc") || placeholder("ncc", "Nigerian Communications Commission (NCC)");

    const primary = TELCO;
    const through = NCC;

    pushUnique(cc, PCC);
    pushUnique(cc, FCCPC);

    return finalizeRouting(primary, through, cc);
  }

  // ----------------------------
  // HEALTH (base)
  // ----------------------------
  if (sector === "health") {
    const HOSP = placeholder("health_primary", "Medical Facility / Hospital");
    const FMOH = findById("ministry_health") || findById("ministry_of_health") || placeholder("ministry_health", "Federal Ministry of Health");
    const MDCN = findById("mdcn") || null;

    const primary = HOSP;
    const through = FMOH;

    pushUnique(cc, PCC);
    if (MDCN) pushUnique(cc, MDCN);

    return finalizeRouting(primary, through, cc);
  }

  // ----------------------------
  // BANKING (strict baseline)
  // ----------------------------
  if (sector === "banking") {
    const BANK_BRANCH = placeholder("bank_branch", "The Bank Branch / Bank involved");
    const BANK_HQ = placeholder("bank_hq", "The Managing Director / Bank Headquarters");
    const CBN = findById("cbn_consumer") || findById("cbn") || placeholder("cbn", "Central Bank of Nigeria (CBN)");
    const NDIC = findById("ndic") || placeholder("ndic", "Nigeria Deposit Insurance Corporation (NDIC)");

    const primary = BANK_BRANCH;
    const through = BANK_HQ;

    pushUnique(cc, CBN);
    pushUnique(cc, NDIC);
    pushUnique(cc, PCC);
    pushUnique(cc, FCCPC);

    return finalizeRouting(primary, through, cc);
  }

  // ----------------------------
  // HOUSING (baseline)
  // ----------------------------
  if (sector === "housing") {
    const primary = placeholder("housing_primary", "The Responsible Party (Landlord/Agent/Taskforce)");
    const FCTA = findById("fcta") || findById("fct_admin") || null;
    const MIN_HOUSING = findById("ministry_housing") || null;
    const through = FCTA || MIN_HOUSING || placeholder("housing_through", "The Supervising Authority");

    pushUnique(cc, PCC);
    pushUnique(cc, FCCPC);

    return finalizeRouting(primary, through, cc);
  }

  // ----------------------------
  // DEFAULT: GENERAL ADMIN INJUSTICE -> PCC primary
  // ----------------------------
primary = PCC;
through = null;
  // CC: FCCPC sometimes, NHRC if rights language exists
  const t = description.toLowerCase();
  const rightsTriggers = ["assault", "brutality", "threat", "torture", "unlawful", "illegal detention", "extortion", "human rights"];
  if (rightsTriggers.some((k) => t.includes(k))) pushUnique(cc, NHRC);

  pushUnique(cc, FCCPC);

  return finalizeRouting(primary, through, cc);
}

// ----------------------------
// MAIN HYBRID DETECT (STRICT ALWAYS WINS)
// ----------------------------
async function detectHybrid(description = "", userAddress = "") {
  // 1) INTERNATIONAL override
  if (detectInternational(description)) {
    const pcc = findById("pcc") || placeholder("pcc", "Public Complaints Commission");
    const nhrc = findById("nhrc") || placeholder("nhrc", "National Human Rights Commission");
    const mfa = findById("ministry_foreign_affairs") || placeholder("ministry_foreign_affairs", "Federal Ministry of Foreign Affairs");
    const agf = findById("attorney_general_federation") || placeholder("attorney_general_federation", "Attorney-General of the Federation");

    const intl = [
      ...filterByCategory("international_policy"),
      ...filterByCategory("foreign_government"),
      ...filterByCategory("regional"),
      ...filterByCategory("ngo"),
    ];

    const primary = intl[0] || placeholder("intl_primary", "Relevant International Body / Mission");
    const through = mfa || agf;

    const cc = [];
    intl.slice(1).forEach((x) => pushUnique(cc, x));
    pushUnique(cc, agf);
    pushUnique(cc, pcc);
    pushUnique(cc, nhrc);

    const routed = finalizeRouting(primary, through, cc);
    return { ...routed, sector: "international" };
  }

  // 2) Sector detect (keyword baseline)
  let sector = detectSector(description);

  // 3) AI context extraction (ONLY to fill missing details)
  // We do NOT let AI override strict routing behavior.
  let ctx = {};
  if (openai) {
    const ai = await extractContextAI(description, userAddress);
    if (ai && typeof ai === "object") {
      ctx = ai;
      // If AI confidently provides a non-general sector, allow it to refine only when our baseline is general.
      if (sector === "general" && ai.sector && ai.sector !== "general") sector = ai.sector;
    }
  }

  // 4) STRICT routing patterns (ALWAYS)
  const routed = await getInstitutionsForSector(sector, userAddress, description, ctx);
  return { ...routed, sector };
}

module.exports = {
  detectHybrid,
  detectSector,
};

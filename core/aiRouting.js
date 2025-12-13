"use strict";

/**
 * core/aiRouting.js - PetitionDesk Hybrid Routing (STRICT)
 * STRICT rules ALWAYS win. AI is used ONLY to extract missing context (state/disco/city).
 */

const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

// ---------------------------
// OPENAI CLIENT (optional)
// ---------------------------
function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  } catch (e) {
    return null;
  }
}
const openai = getOpenAIClient();

// ---------------------------
// LOAD institutions.json
// ---------------------------
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

  console.error("✘ [aiRouting] Could not load institutions.json");
  return {};
}

const institutions = loadInstitutions();

// ---------------------------
// HELPERS
// ---------------------------
function normalise(s) {
  return String(s || "").trim().toLowerCase();
}

function getArray(name) {
  const arr = institutions[name];
  return Array.isArray(arr) ? arr : [];
}

// Find by id across all arrays inside institutions.json
function findById(id) {
  if (!id) return null;
  const arrays = Object.values(institutions).filter(Array.isArray);
  for (const arr of arrays) {
    const found = arr.find((x) => x && x.id === id);
    if (found) return found;
  }
  return null;
}

// Filter by category field
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

// Remove duplicates and remove "through" and "primary" from CC list
function finalizeRouting(primary, through, ccList) {
  const cc = [];
  (ccList || []).forEach((x) => pushUnique(cc, x));

  const primaryKey = primary?.id || normalise(primary?.org);
  const throughKey = through?.id || normalise(through?.org);

  // remove primary
  for (let i = cc.length - 1; i >= 0; i--) {
    const item = cc[i];
    if (!item) continue;
    const k = item.id || normalise(item.org);
    if (primaryKey && k === primaryKey) cc.splice(i, 1);
  }

  // remove through
  for (let i = cc.length - 1; i >= 0; i--) {
    const item = cc[i];
    if (!item) continue;
    const k = item.id || normalise(item.org);
    if (throughKey && k === throughKey) cc.splice(i, 1);
  }

  // extra: remove accidental duplicates
  const seen = new Set();
  for (let i = cc.length - 1; i >= 0; i--) {
    const item = cc[i];
    const k =
      normalise(item?.id || "") +
      "|" +
      normalise(item?.org || "") +
      "|" +
      normalise(item?.title || "");
    if (seen.has(k)) cc.splice(i, 1);
    else seen.add(k);
  }

  return { primary: primary || null, through: through || null, ccList: cc };
}

// ---------------------------
// INTERNATIONAL DETECTOR
// ---------------------------
function detectInternational(description = "") {
  const text = String(description || "").toLowerCase();
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

// ---------------------------
// SECTOR DETECTION (baseline)
// ---------------------------
function detectSector(description = "") {
  const text = String(description || "").toLowerCase();

  const map = {
    police: ["police", "npf", "igp", "cp", "sars", "swat", "arrest", "detention"],
    power: ["electricity", "light", "power", "disco", "meter", "bill", "nepa"],
    telecom: ["mtn", "glo", "airtel", "mobile", "network", "sim", "data", "sms"],
    banking: ["bank", "atm", "pos", "transfer", "debit", "credit", "fraud"],
    housing: ["landlord", "tenant", "rent", "eviction", "house", "estate", "agent"],
    health: ["hospital", "clinic", "doctor", "nurse", "medical", "mdcn"],
    education: ["school", "university", "polytechnic", "student", "waec", "jamb"],
    labour: ["salary", "wage", "promotion", "dismissal", "termination", "allowance"],
    maritime: ["nimasa", "ship", "vessel", "port", "npa", "shipping"],
    aviation: ["ncaa", "faan", "airport", "flight", "airline", "aviation"],
    immigration: ["immigration", "passport", "nigerian immigration", "visa", "permit"],
    customs: ["customs", "clearing", "duty", "container", "seizure"],
    consumer: ["fccpc", "consumer", "refund", "defective", "warranty", "scam"],
    transport: ["frsc", "vehicle", "towing", "bus", "taxi", "transport", "road"],
    telecom_reg: ["ncc", "communications commission"],
  };

  for (const sector of Object.keys(map)) {
    if (map[sector].some((k) => text.includes(k))) return sector;
  }
  return "general";
}

// ---------------------------
// STATE EXTRACTION (deterministic)
// ---------------------------
const NIGERIAN_STATES = [
  "abia","adamawa","akwa ibom","anambra","bauchi","bayelsa","benue","borno",
  "cross river","delta","ebonyi","edo","ekiti","enugu","gombe","imo","jigawa",
  "kaduna","kano","katsina","kebbi","kogi","kwara","lagos","nasarawa","niger",
  "ogun","ondo","osun","oyo","plateau","rivers","sokoto","taraba","yobe","zamfara",
  "fct","abuja"
];

function getStateFromText(userAddress = "", description = "") {
  const text = (userAddress + " " + description).toLowerCase();

  // If police states dataset exists
  const statesData = getArray("police_states");
  for (const item of statesData) {
    if (!item?.state) continue;
    const s = String(item.state).toLowerCase();
    if (s && text.includes(s)) return item.state;
  }

  for (const s of NIGERIAN_STATES) {
    if (text.includes(s)) {
      if (s === "abuja" || s === "fct") return "FCT";
      return s
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    }
  }

  return null;
}

// ---------------------------
// DISCO DETECTION
// ---------------------------
function pickDiscoFromText(description = "", userAddress = "") {
  const text = (description + " " + userAddress).toLowerCase();

  const discoHints = [
    { id: "ekedc", keys: ["ekedc", "eko disco", "eko electricity"] },
    { id: "ikedc", keys: ["ikedc", "ikeja disco", "ikeja electric"] },
    { id: "aedc", keys: ["aedc", "abuja disco", "abuja electric"] },
    { id: "ibedc", keys: ["ibedc", "ibadan disco"] },
    { id: "jedc", keys: ["jedc", "jos disco"] },
    { id: "phedc", keys: ["phedc", "port harcourt", "ph"] },
    { id: "kedco", keys: ["kedco", "kano disco"] },
    { id: "bedc", keys: ["bedc", "benin disco"] },
  ];

  for (const h of discoHints) {
    if (h.keys.some((k) => text.includes(k))) {
      const inst = findById(h.id);
      return inst || placeholder(h.id, h.id.toUpperCase());
    }
  }
  return null;
}

// ---------------------------
// AI CONTEXT EXTRACTOR
// ---------------------------
async function extractContextAI(description = "", userAddress = "") {
  if (!openai) return {};
  try {
    const prompt = `
You are extracting structured facts from a complaint text.
Return ONLY valid JSON.
Fields:
- sector: one of ["police","power","telecom","banking","housing","health","education","labour","maritime","aviation","immigration","customs","consumer","transport","general"]
- state: Nigerian state name like "Delta" or "Lagos" or "FCT"
- city: string or null
- disco: short disco hint like "EKEDC" or "AEDC" or "IKEDC"

Rules:
- Do NOT guess if not present. Use null.
- If location appears (e.g. "Warri, Delta"), set city="Warri", state="Delta".
- For power: if it mentions Eko/EKEDC set disco="EKEDC". If Abuja/AEDC set "AEDC". If Ikeja/IKEDC set "IKEDC".
Return ONLY JSON, no markdown.
`.trim();

    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      messages: [
        { role: "system", content: prompt },
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

// ---------------------------
// BUILD CP (Police) for a state
// ---------------------------
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

// ---------------------------
// STRICT ROUTING RULES
// ---------------------------
async function getInstitutionsForSector(sector, userAddress = "", description = "", ctx = {}) {
  const cc = [];
  let primary = null;
  let through = null;

  // Always-available watchdogs
  const PCC = findById("pcc") || placeholder("pcc", "Public Complaints Commission");
  const NHRC = findById("nhrc") || placeholder("nhrc", "National Human Rights Commission");
  const FCCPC = findById("fccpc") || placeholder("fccpc", "Federal Competition & Consumer Protection Commission");

  // ---------------------------
  // POLICE (STRICT)
  // ---------------------------
  if (sector === "police") {
    const IGP = findById("igp") || placeholder("igp", "Inspector-General of Police");
    const PSC = findById("psc") || placeholder("psc", "Police Service Commission");

    let state = ctx?.state || getStateFromText(userAddress, description);

    // If still missing and OpenAI available
    if (!state) {
      const ai = await extractContextAI(description, userAddress);
      if (ai?.state) state = ai.state;
    }

    primary = state ? buildStateCP(state) : placeholder("state_cp", "Commissioner of Police (State Command)");
    through = IGP;

    pushUnique(cc, PSC);
    pushUnique(cc, PCC);
    pushUnique(cc, NHRC);

    return finalizeRouting(primary, through, cc);
  }

  // ---------------------------
  // TRANSPORT (STRICT)
  // ---------------------------
  if (sector === "transport") {
    const text = (userAddress + " " + description).toLowerCase();

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

    if (text.includes("flight") || text.includes("airline") || text.includes("airport")) {
      primary =
        airlines.find((x) => text.includes(String(x.name || "").toLowerCase())) ||
        airports.find((x) => text.includes(String(x.name || "").toLowerCase())) ||
        placeholder("aviation_operator", "Aviation Operator");
      through = NCAA;
    } else if (text.includes("ship") || text.includes("port") || text.includes("vessel")) {
      primary =
        shippingLines.find((x) => text.includes(String(x.name || "").toLowerCase())) ||
        ports.find((x) => text.includes(String(x.name || "").toLowerCase())) ||
        placeholder("maritime_operator", "Maritime Operator");
      through = NIMASA;
    } else if (text.includes("train") || text.includes("rail")) {
      primary = placeholder("rail_operator", "Rail Operator");
      through = NRC;
    } else {
      primary =
        towingCompanies.find((x) => text.includes(String(x.name || "").toLowerCase())) ||
        placeholder("road_operator", "Road Transport Operator");
      through = FRSC;

      const stateAgency = stateTransport.find((x) => text.includes(String(x.state || "").toLowerCase()));
      if (stateAgency) pushUnique(cc, stateAgency);
    }

    pushUnique(cc, PCC);
    pushUnique(cc, FCCPC);

    // SERVICOM if public service / MDA
    const t = description.toLowerCase();
    const servicomTriggers = ["mda", "federal secretariat", "ministry", "agency", "public"];
    if (servicomTriggers.some((k) => t.includes(k))) {
      const SERVICOM = findById("servicom");
      if (SERVICOM) pushUnique(cc, SERVICOM);
    }

    return finalizeRouting(primary, through, cc);
  }

  // ---------------------------
  // POWER / ELECTRICITY (STRICT)
  // ---------------------------
  if (sector === "power") {
    const NERC = findById("nerc") || placeholder("nerc", "Nigerian Electricity Regulatory Commission");
    const MIN_POWER =
      findById("ministry_power") ||
      findById("ministry_of_power") ||
      placeholder("ministry_power", "Federal Ministry of Power");
    const SERVICOM = findById("servicom");

    let discoInst = pickDiscoFromText(description, userAddress);

    if (!discoInst) {
      const ai = await extractContextAI(description, userAddress);
      const hint = normalise(ai?.disco || "");
      if (hint.includes("ekedc") || hint.includes("eko")) discoInst = findById("ekedc") || placeholder("ekedc", "EKEDC");
      else if (hint.includes("aedc") || hint.includes("abuja")) discoInst = findById("aedc") || placeholder("aedc", "AEDC");
      else if (hint.includes("ikedc") || hint.includes("ikeja")) discoInst = findById("ikedc") || placeholder("ikedc", "IKEDC");
    }

    const DISCO = discoInst || findById("disco") || placeholder("disco", "DISCO");

    primary = DISCO;
    through = NERC;

    pushUnique(cc, MIN_POWER);
    pushUnique(cc, PCC);
    pushUnique(cc, FCCPC);

    // SERVICOM situational
    const servicomTriggers = ["mda", "federal secretariat", "ministry", "agency", "public"];
    if (SERVICOM && servicomTriggers.some((k) => description.toLowerCase().includes(k))) {
      pushUnique(cc, SERVICOM);
    }

    return finalizeRouting(primary, through, cc);
  }

  // ---------------------------
  // TELECOM (base strict)
  // ---------------------------
  if (sector === "telecom") {
    const TELCO = placeholder("telco_primary", "Customer Care Unit (Telco)");
    const NCC = findById("ncc") || placeholder("ncc", "Nigerian Communications Commission");

    primary = TELCO;
    through = NCC;

    pushUnique(cc, PCC);
    pushUnique(cc, FCCPC);

    return finalizeRouting(primary, through, cc);
  }

  // ---------------------------
  // HEALTH (base)
  // ---------------------------
  if (sector === "health") {
    const HOSP = placeholder("health_primary", "Medical Facility / Hospital Management");
    const FMOH = findById("ministry_health") || findById("fmoh") || placeholder("ministry_health", "Federal Ministry of Health");
    const MDCN = findById("mdcn") || null;

    primary = HOSP;
    through = FMOH;

    pushUnique(cc, PCC);
    if (MDCN) pushUnique(cc, MDCN);

    return finalizeRouting(primary, through, cc);
  }

  // ---------------------------
  // BANKING (strict baseline)
  // ---------------------------
  if (sector === "banking") {
    const BANK_BRANCH = placeholder("bank_branch", "Bank Branch (Customer Service)");
    const BANK_HQ = placeholder("bank_hq", "Bank Head Office / Complaints Unit");
    const CBN = findById("cbn_consumer") || findById("cbn") || placeholder("cbn", "Central Bank of Nigeria");
    const NDIC = findById("ndic") || placeholder("ndic", "Nigeria Deposit Insurance Corporation");

    primary = BANK_BRANCH;
    through = BANK_HQ;

    pushUnique(cc, CBN);
    pushUnique(cc, NDIC);
    pushUnique(cc, PCC);
    pushUnique(cc, FCCPC);

    return finalizeRouting(primary, through, cc);
  }

  // ---------------------------
  // HOUSING (baseline)
  // ---------------------------
  if (sector === "housing") {
    primary = placeholder("housing_primary", "The Responsible Housing Party (Landlord/Agent/Developer)");
    const FCTA = findById("fcta") || findById("fct_admin") || null;
    const MIN_HOUSING = findById("ministry_housing") || null;

    through = FCTA || MIN_HOUSING || placeholder("housing_through", "Relevant Housing Authority");

    pushUnique(cc, PCC);
    pushUnique(cc, FCCPC);

    return finalizeRouting(primary, through, cc);
  }

  // ---------------------------
  // DEFAULT: GENERAL ADMIN INJUSTICE -> PCC primary
  // ---------------------------
  primary = PCC;
  through = null;

  // FCCPC sometimes, NHRC if rights language exists
  const t = description.toLowerCase();
  const rightsTriggers = ["assault", "brutality", "threat", "torture", "rights", "abuse", "detain"];
  if (rightsTriggers.some((k) => t.includes(k))) pushUnique(cc, NHRC);

  pushUnique(cc, FCCPC);

  return finalizeRouting(primary, through, cc);
}

// ---------------------------
// MAIN HYBRID DETECT (STRICT ALWAYS WINS)
// ---------------------------
async function detectHybrid(description = "", userAddress = "") {
  // 1) INTERNATIONAL override
  if (detectInternational(description)) {
    const pcc = findById("pcc") || placeholder("pcc", "Public Complaints Commission");
    const nhrc = findById("nhrc") || placeholder("nhrc", "National Human Rights Commission");
    const mfa = findById("ministry_foreign_affairs") || placeholder("ministry_foreign_affairs", "Ministry of Foreign Affairs");
    const agf = findById("attorney_general_federation") || placeholder("attorney_general_federation", "Attorney-General of the Federation");

    const intl = [
      ...filterByCategory("international_policy"),
      ...filterByCategory("foreign_government"),
      ...filterByCategory("regional"),
      ...filterByCategory("ngo"),
    ];

    const primary = intl[0] || placeholder("intl_primary", "International Body / Platform");
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

  // 3) AI context extraction (ONLY to fill missing detail)
  let ctx = {};
  if (openai) {
    const ai = await extractContextAI(description, userAddress);
    if (ai && typeof ai === "object") {
      ctx = ai;
      // If AI provides a confident non-general sector, allow upgrade only
      if (sector === "general" && ai.sector && ai.sector !== "general") {
        sector = ai.sector;
      }
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

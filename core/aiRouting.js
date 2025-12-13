"use strict";

/**
 * core/aiRouting.js – PetitionDesk Hybrid Routing (STRICT)
 * STRICT rules ALWAYS win.
 * AI is used ONLY to extract missing context.
 */

const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

// --------------------------------
// OPENAI CLIENT (optional)
// --------------------------------
function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  } catch {
    return null;
  }
}
const openai = getOpenAIClient();

// --------------------------------
// LOAD institutions.json
// --------------------------------
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
      console.log("[aiRouting] institutions.json loaded:", p);
      return j;
    } catch {}
  }

  console.error("✗ [aiRouting] Could not load institutions.json");
  return {};
}
const institutions = loadInstitutions();

// --------------------------------
// HELPERS
// --------------------------------
function normalise(s) {
  return String(s || "").trim().toLowerCase();
}

function getArray(name) {
  const arr = institutions[name];
  return Array.isArray(arr) ? arr : [];
}

function findById(id) {
  if (!id) return null;
  const arrays = Object.values(institutions).filter(Array.isArray);
  for (const arr of arrays) {
    const found = arr.find((x) => x && x.id === id);
    if (found) return found;
  }
  return null;
}

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

function placeholder(id, org) {
  return { id, org, title: org, email: "", address: "Nigeria" };
}

function pushUnique(list, inst) {
  if (!inst) return;
  const key = normalise(inst.id || inst.org);
  if (!list.some((x) => normalise(x?.id || x?.org) === key)) {
    list.push(inst);
  }
}

function finalizeRouting(primary, through, ccList) {
  const cc = [];
  (ccList || []).forEach((x) => pushUnique(cc, x));

  const primaryKey = normalise(primary?.id || primary?.org);
  const throughKey = normalise(through?.id || through?.org);

  // remove primary & through from cc
  for (let i = cc.length - 1; i >= 0; i--) {
    const k = normalise(cc[i]?.id || cc[i]?.org);
    if (k === primaryKey || k === throughKey) cc.splice(i, 1);
  }

  // de-duplicate hard
  const seen = new Set();
  for (let i = cc.length - 1; i >= 0; i--) {
    const k =
      normalise(cc[i]?.id) +
      "|" +
      normalise(cc[i]?.org) +
      "|" +
      normalise(cc[i]?.title) +
      "|" +
      normalise(cc[i]?.address);
    if (seen.has(k)) cc.splice(i, 1);
    else seen.add(k);
  }

  return {
    primary: primary || null,
    through: through || null,
    ccList: cc,
  };
}

// --------------------------------
// INTERNATIONAL DETECTOR
// --------------------------------
function detectInternational(description = "") {
  const text = description.toLowerCase();
  const triggers = [
    "embassy",
    "high commission",
    "international",
    "foreign",
    "un",
    "united nations",
    "asylum",
    "visa",
    "deportation",
    "immigration",
    "human rights council",
    "usa",
    "uk",
    "canada",
    "eu",
    "china",
    "france",
    "germany",
  ];
  return triggers.some((k) => text.includes(k));
}

// --------------------------------
// SECTOR DETECTION (STRICT)
// --------------------------------
function detectSector(description = "") {
  const text = description.toLowerCase();
  const map = {
    police: ["police", "npf", "igp", "sars", "detained", "assaulted"],
    power: ["electricity", "power", "disco", "meter"],
    telecom: ["mtn", "glo", "airtel", "telecom", "network"],
    banking: ["bank", "atm", "debit", "transfer"],
    transport: ["frsc", "vehicle", "flight", "ship", "port", "train"],
    health: ["hospital", "clinic", "doctor", "medical"],
    housing: ["landlord", "tenant", "rent", "eviction"],
    education: ["school", "university", "polytechnic"],
    labour: ["salary", "promotion", "dismissal"],
  };

  for (const sector of Object.keys(map)) {
    if (map[sector].some((k) => text.includes(k))) return sector;
  }
  return "general";
}

// --------------------------------
// AI CONTEXT (ONLY FILL GAPS)
// --------------------------------
async function extractContextAI(description = "", userAddress = "") {
  if (!openai) return {};
  try {
    const prompt = `
Extract structured facts from this complaint.
Return ONLY valid JSON.
Fields:
- sector (string or null)
- state (string or null)
- city (string or null)
- disco (string or null)
Rules:
- Do NOT guess.
- Use null if unknown.
`;

    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: `ADDRESS:\n${userAddress}\n\nTEXT:\n${description}` },
      ],
    });

    const txt = resp?.choices?.[0]?.message?.content || "{}";
    const data = JSON.parse(txt);
    return typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

// --------------------------------
// STRICT ROUTING PER SECTOR
// --------------------------------
async function getInstitutionsForSector(sector, userAddress, description, ctx) {
  const cc = [];
  let primary = null;
  let through = null;

  const PCC = findById("pcc") || placeholder("pcc", "Public Complaints Commission");
  const NHRC = findById("nhrc") || placeholder("nhrc", "National Human Rights Commission");
  const FCCPC = findById("fccpc") || placeholder("fccpc", "FCCPC");

  if (sector === "police") {
    const IGP = findById("igp") || placeholder("igp", "Inspector-General of Police");
    const PSC = findById("psc") || placeholder("psc", "Police Service Commission");
    primary = placeholder("state_cp", "Commissioner of Police (State)");
    through = IGP;
    pushUnique(cc, PSC);
    pushUnique(cc, PCC);
    pushUnique(cc, NHRC);
    return finalizeRouting(primary, through, cc);
  }

  if (sector === "power") {
    const NERC = findById("nerc") || placeholder("nerc", "NERC");
    primary = placeholder("disco", "Electricity Distribution Company");
    through = NERC;
    pushUnique(cc, PCC);
    pushUnique(cc, FCCPC);
    return finalizeRouting(primary, through, cc);
  }

  if (sector === "banking") {
    const CBN = findById("cbn_consumer") || placeholder("cbn", "Central Bank of Nigeria");
    primary = placeholder("bank_branch", "Bank Branch");
    through = placeholder("bank_hq", "Bank Head Office");
    pushUnique(cc, CBN);
    pushUnique(cc, PCC);
    pushUnique(cc, FCCPC);
    return finalizeRouting(primary, through, cc);
  }

  // DEFAULT GENERAL
  primary = PCC;
  through = null;
  if (description.toLowerCase().includes("assault")) pushUnique(cc, NHRC);
  pushUnique(cc, FCCPC);
  return finalizeRouting(primary, through, cc);
}

// --------------------------------
// MAIN HYBRID DETECTOR (FINAL)
// --------------------------------
async function detectHybrid(description = "", userAddress = "") {

  // 1) STRICT sector first
  let sector = detectSector(description);

  // 2) AI only to fill missing
  let ctx = {};
  if (openai) {
    const ai = await extractContextAI(description, userAddress);
    if (sector === "general" && ai?.sector) sector = ai.sector;
    ctx = ai || {};
  }

  // 3) INTERNATIONAL only if STILL general
  if (sector === "general" && detectInternational(description)) {
    const mfa =
      findById("ministry_foreign_affairs") ||
      placeholder("ministry_foreign_affairs", "Ministry of Foreign Affairs");
    const agf =
      findById("attorney_general_federation") ||
      placeholder("attorney_general_federation", "Attorney-General of the Federation");

    const intl = [
      ...filterByCategory("international_policy"),
      ...filterByCategory("foreign_government"),
      ...filterByCategory("regional"),
      ...filterByCategory("ngo"),
    ];

    const primary =
      intl[0] ||
      placeholder("intl_primary", "International Human Rights Body");

    const cc = [];
    intl.slice(1).forEach((x) => pushUnique(cc, x));
    pushUnique(cc, agf);
    pushUnique(cc, findById("pcc"));
    pushUnique(cc, findById("nhrc"));

    const routed = finalizeRouting(primary, mfa, cc);
    return { ...routed, sector: "international" };
  }

  // 4) STRICT routing always wins
  const routed = await getInstitutionsForSector(
    sector,
    userAddress,
    description,
    ctx
  );

  return { ...routed, sector };
}

// --------------------------------
module.exports = {
  detectHybrid,
  detectSector,
};

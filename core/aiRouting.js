// aiRouting.js - PetitionDesk AI routing + sector detection (Option B)
// -------------------------------------------------------------------
const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

// -------------------------------------------------------------------
// 1. OPENAI CLIENT WRAPPER
// -------------------------------------------------------------------
function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    console.warn("⚠ OPENAI_API_KEY missing. Fallback mode only.");
    return null;
  }
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || "",
  });
}

// -------------------------------------------------------------------
// 2. Load institutions database
// -------------------------------------------------------------------
const institutionsPath = path.join(__dirname, "data", "institutions.json");

let institutions = {};
try {
  institutions = JSON.parse(fs.readFileSync(institutionsPath, "utf8"));
  console.log("[aiRouting] institutions.json loaded");
} catch (err) {
  console.error("❌ ERROR loading institutions.json:", err);
  institutions = {};
}

// Small helper to safely get any array from institutions
function getArray(name) {
  const arr = institutions[name];
  return Array.isArray(arr) ? arr : [];
}

// -------------------------------------------------------------------
// 3. Helpers – find by id, filter by category, state-match for police
// -------------------------------------------------------------------

// Find any institution by id across all known arrays
function findById(id) {
  if (!id || !institutions) return null;

  const arrays = Object.values(institutions).filter(Array.isArray);
  for (const arr of arrays) {
    const found = arr.find((x) => x.id === id);
    if (found) return found;
  }
  return null;
}

// Filter an array by "category" field
function filterByCategory(category) {
  if (!category) return [];
  const arrays = Object.values(institutions).filter(Array.isArray);
  const result = [];
  for (const arr of arrays) {
    for (const item of arr) {
      if (item && item.category === category) {
        result.push(item);
      }
    }
  }
  return result;
}

// Try to extract a state police command from user address text
function getStatePoliceCommandFromAddress(userAddress) {
  if (!userAddress) return null;
  const lower = String(userAddress).toLowerCase();
  const states = getArray("police_states");

  for (const item of states) {
    if (!item || !item.state) continue;
    const stateLower = String(item.state).toLowerCase();
    if (lower.includes(stateLower)) {
      // full object already has id, org, address, etc.
      return item;
    }
  }
  return null;
}

// Helper to push institutions without duplicates (by id)
function pushUnique(target, inst) {
  if (!inst || !inst.id) return;
  if (target.some((x) => x.id === inst.id)) return;
  target.push(inst);
}

// -------------------------------------------------------------------
// 4. Sector classifier – MANY sectors, not only police
// -------------------------------------------------------------------
function detectSector(description) {
  const text = (description || "").toLowerCase();

  const sectorKeywords = {
    // Police / security
    police: [
      "police",
      "officer",
      "igp",
      "cp",
      "npf",
      "sars",
      "station",
      "policeman",
      "policewoman",
      "detention",
      "cell",
      "bail",
      "illegal arrest",
      "checkpoint",
      "brutality",
      "extortion",
      "roadblock",
      "armed robbery report",
      "kidnap report",
    ],

    // Power / electricity
    power: [
      "light",
      "electricity",
      "disco",
      "estimated billing",
      "bill",
      "meter",
      "token",
      "prepaid",
      "aedc",
      "ibedc",
      "phedc",
      "ekedc",
      "jedc",
      "jos disco",
      "kaduna disco",
      "blackout",
      "power cut",
      "transformer",
      "overbilling",
    ],

    // Telecom / internet
    telecom: [
      "network",
      "data",
      "airtime",
      "mtn",
      "glo",
      "airtel",
      "9mobile",
      "etisalat",
      "sim",
      "nin linkage",
      "line barred",
      "line blocked",
      "call drop",
      "internet",
      "broadband",
      "isp",
      "router",
    ],

    // Banking / fintech
    banking: [
      "bank",
      "atm",
      "pos",
      "transfer",
      "transaction failed",
      "failed transaction",
      "reversal",
      "chargeback",
      "debit",
      "unauthorized debit",
      "fraud",
      "internet banking",
      "mobile banking",
      "loan",
      "interest",
      "e-naira",
      "usdt",
      "card issue",
      "card retained",
      "card swallowed",
    ],

    // Health / medical
    health: [
      "hospital",
      "clinic",
      "doctor",
      "nurse",
      "medical",
      "malpractice",
      "misdiagnosis",
      "nhis",
      "hmo",
      "treatment",
      "surgery",
      "pharmacy",
      "drug reaction",
      "birth complication",
      "maternal death",
    ],

    // Transport / road / traffic
    transport: [
      "frsc",
      "driver",
      "vehicle",
      "car",
      "bus",
      "keke",
      "uber",
      "bolt",
      "taxi",
      "accident",
      "road safety",
      "licence",
      "license",
      "plate number",
      "traffic",
      "road worthiness",
      "v.i.o",
      "vio",
    ],

    // Education
    education: [
      "school",
      "university",
      "polytechnic",
      "college",
      "lecturer",
      "teacher",
      "student",
      "pupil",
      "jamb",
      "waec",
      "neco",
      "nysc",
      "admission",
      "expulsion",
      "rustication",
      "fees",
      "tuition",
    ],

    // Employment / labour
    labour: [
      "salary",
      "wages",
      "promotion",
      "dismissal",
      "suspension",
      "termination",
      "pension",
      "gratuity",
      "nhf",
      "nsitf",
      "casualisation",
      "labour",
      "strike",
      "overtime",
    ],

    // Housing / tenancy
    housing: [
      "landlord",
      "tenant",
      "rent",
      "tenancy",
      "eviction",
      "quit notice",
      "service charge",
      "estate",
      "housing",
      "office allocation",
    ],

    // Immigration / passport
    immigration: [
      "passport",
      "visa",
      "immigration",
      "nis",
      "border",
      "arrival",
      "departure",
      "entry",
      "exit",
      "deportation",
    ],

    // Customs / trade
    customs: [
      "customs",
      "duty",
      "import",
      "export",
      "seizure",
      "container",
      "port",
      "apapa",
      "tincan",
      "border post",
    ],

    // Drugs / trafficking / human rights heavy
    human_rights: [
      "torture",
      "inhuman",
      "degrading treatment",
      "extra-judicial",
      "extrajudicial",
      "rape",
      "sexual assault",
      "trafficking",
      "naptip",
      "ndlea",
      "fundamental right",
      "right to life",
      "enforced disappearance",
    ],

    // Corruption / financial crime
    corruption: [
      "corruption",
      "bribe",
      "bribery",
      "embezzlement",
      "public funds",
      "contract fraud",
      "419",
      "advance fee",
      "money laundering",
      "efcc",
      "icpc",
    ],
  };

  for (const sector in sectorKeywords) {
    const kws = sectorKeywords[sector];
    for (const kw of kws) {
      if (text.includes(kw)) return sector;
    }
  }

  // Default
  return "general";
}

// -------------------------------------------------------------------
// 5. Institution selector – build smart routing list per sector
// -------------------------------------------------------------------
function getInstitutionsForSector(sector, userAddress = "", description = "") {
  const routes = [];
  const desc = (description || "").toLowerCase();

  // Common helpers
  const pcc = findById("pcc") || findById("public_complaints_commission");
  const nhrc = findById("nhrc") || findById("national_human_rights_commission");
  const efcc = findById("efcc");
  const icpc = findById("icpc");
  const ndlea = findById("ndlea");
  const naptip = findById("naptip");
  const dss = findById("dss") || findById("dss_hq");
  const nscdc = findById("nscdc");

  // International human rights / NGOs
  const intlHR = [
    ...filterByCategory("human_rights"),
    ...filterByCategory("ngo"),
    ...filterByCategory("international_policy"),
    ...filterByCategory("regional"),
    ...filterByCategory("foreign_government"),
  ];

  // Sector-specific primaries
  switch (sector) {
    case "police": {
      const igp = findById("igp");
      const psc = findById("psc");
      const npfHq =
        findById("npf_hq") || findById("nigeria_police_force_hq") || igp;

      const stateCmd = getStatePoliceCommandFromAddress(userAddress);

      // Primary: Police HQ
      if (npfHq) pushUnique(routes, npfHq);

      // Through: IGP, State CP, PSC, DSS, NSCDC
      if (igp) pushUnique(routes, igp);
      if (stateCmd) pushUnique(routes, stateCmd);
      if (psc) pushUnique(routes, psc);
      if (dss) pushUnique(routes, dss);
      if (nscdc) pushUnique(routes, nscdc);

      // Watchdogs
      if (pcc) pushUnique(routes, pcc);
      if (nhrc) pushUnique(routes, nhrc);
      if (efcc && desc.includes("bribe")) pushUnique(routes, efcc);
      if (icpc && desc.includes("bribe")) pushUnique(routes, icpc);
      break;
    }

    case "power": {
      const nerc = findById("nerc");
      const disco = findById("disco") || findById("aedc"); // generic or AEDC
      if (nerc) pushUnique(routes, nerc);
      if (disco) pushUnique(routes, disco);
      if (pcc) pushUnique(routes, pcc);
      if (nhrc) pushUnique(routes, nhrc);
      break;
    }

case "telecom": {
      const ncc = findById("ncc");
      const fccpc = findById("fccpc");

      if (ncc) pushUnique(routes, ncc);
      if (fccpc) pushUnique(routes, fccpc);
      if (pcc) pushUnique(routes, pcc);
      if (nhrc) pushUnique(routes, nhrc);

      break;
    }

    case "banking": {
      const cbn = findById("cbn");
      const fccpc = findById("fccpc");

      if (cbn) pushUnique(routes, cbn);
      if (fccpc) pushUnique(routes, fccpc);

      // Fraud → EFCC + ICPC
      if (desc.includes("fraud") || desc.includes("scam") || desc.includes("unauthorized debit")) {
        if (efcc) pushUnique(routes, efcc);
        if (icpc) pushUnique(routes, icpc);
      }

      if (pcc) pushUnique(routes, pcc);
      if (nhrc) pushUnique(routes, nhrc);

      break;
    }

    case "health": {
      const fmh = findById("fmh") || findById("federal_ministry_of_health");
      const hmb = findById("hmb") || findById("health_management_board");
      const nhis = findById("nhis");

      if (fmh) pushUnique(routes, fmh);
      if (hmb) pushUnique(routes, hmb);
      if (nhis) pushUnique(routes, nhis);

      if (desc.includes("malpractice") || desc.includes("misdiagnosis")) {
        if (nhrc) pushUnique(routes, nhrc);
      }

      if (pcc) pushUnique(routes, pcc);
      break;
    }

    case "transport": {
      const frsc = findById("frsc");
      const vio = findById("vio");
      const motorists = filterByCategory("transport");

      if (frsc) pushUnique(routes, frsc);
      if (vio) pushUnique(routes, vio);

      for (const m of motorists) pushUnique(routes, m);

      if (pcc) pushUnique(routes, pcc);
      if (nhrc) pushUnique(routes, nhrc);

      break;
    }

    case "education": {
      const fme = findById("fme") || findById("federal_ministry_of_education");
      const jamb = findById("jamb");
      const waec = findById("waec");
      const neco = findById("neco");

      if (fme) pushUnique(routes, fme);
      if (jamb) pushUnique(routes, jamb);
      if (waec) pushUnique(routes, waec);
      if (neco) pushUnique(routes, neco);

      if (pcc) pushUnique(routes, pcc);
      if (nhrc) pushUnique(routes, nhrc);

      break;
    }

    case "labour": {
      const mol = findById("labour_ministry") || findById("federal_ministry_of_labour");
      const nsitf = findById("nsitf");
      const pencom = findById("pencom");

      if (mol) pushUnique(routes, mol);
      if (nsitf) pushUnique(routes, nsitf);
      if (pencom) pushUnique(routes, pencom);

      if (pcc) pushUnique(routes, pcc);
      if (nhrc) pushUnique(routes, nhrc);

      break;
    }

    case "housing": {
      const fha = findById("fha") || findById("federal_housing_authority");
      const rentTrib = filterByCategory("tenancy_court");

      if (fha) pushUnique(routes, fha);
      for (const t of rentTrib) pushUnique(routes, t);

      if (pcc) pushUnique(routes, pcc);
      if (nhrc) pushUnique(routes, nhrc);

      break;
    }

    case "immigration": {
      const nis = findById("nis") || findById("nigeria_immigration_service");
      const foreignAffairs = findById("ministry_of_foreign_affairs");

      if (nis) pushUnique(routes, nis);
      if (foreignAffairs) pushUnique(routes, foreignAffairs);

      if (pcc) pushUnique(routes, pcc);
      if (nhrc) pushUnique(routes, nhrc);

      break;
    }

    case "customs": {
      const customs = findById("customs") || findById("ncs");
      const portAuthorities = filterByCategory("port");

      if (customs) pushUnique(routes, customs);
      for (const port of portAuthorities) pushUnique(routes, port);

      if (efcc && desc.includes("fraud")) pushUnique(routes, efcc);

      if (pcc) pushUnique(routes, pcc);
      if (nhrc) pushUnique(routes, nhrc);

      break;
    }

    case "human_rights": {
      if (nhrc) pushUnique(routes, nhrc);

      if (naptip && desc.includes("traffick")) pushUnique(routes, naptip);
      if (ndlea && desc.includes("drug")) pushUnique(routes, ndlea);

      if (dss) pushUnique(routes, dss);

      for (const intl of intlHR) pushUnique(routes, intl);

      if (pcc) pushUnique(routes, pcc);

      break;
    }

    case "corruption": {
      if (efcc) pushUnique(routes, efcc);
      if (icpc) pushUnique(routes, icpc);
      if (pcc) pushUnique(routes, pcc);
      if (nhrc) pushUnique(routes, nhrc);

      break;
    }

    default: {
      // General complaints
      if (pcc) pushUnique(routes, pcc);
      if (nhrc) pushUnique(routes, nhrc);
      if (fccpc) pushUnique(routes, findById("fccpc"));
      break;
    }
  }

  return routes;
}

// -------------------------------------------------------------------
// 6. Generate Petition (OpenAI)
// -------------------------------------------------------------------
async function generatePetition(fullName, email, phone, address, description) {
  try {
    const client = getOpenAIClient();
    const sector = detectSector(description);
    const institutions = getInstitutionsForSector(sector, address, description);

    if (!client) {
      return {
        petition:
          `Fallback Petition (No API Key)\n\nSector: ${sector}\nInstitutions:\n` +
          institutions.map((i) => `- ${i.org}`).join("\n") +
          `\n\nDescription:\n${description}`,
        routes: institutions,
      };
    }

    const prompt = `
Write a complete formal Nigerian petition addressed to ALL institutions below.

Complainant:
Name: ${fullName}
Email: ${email}
Phone: ${phone}
Address: ${address}

Issue Description:
"${description}"

Detected Sector: ${sector}

Institutions to Address:
${institutions.map((i) => `- ${i.org}`).join("\n")}

The petition MUST include:
1. Correct multi-agency addressing (To: / Through:)
2. Clear introduction
3. Detailed facts
4. Rights violated (Nigeria-specific)
5. Reliefs/Demands
6. Closing + complainant details
`.trim();

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
      max_tokens: 1200,
    });

    const petition =
      completion.choices?.[0]?.message?.content || "Error generating petition";

    return { petition, routes: institutions };
  } catch (err) {
    console.error("❌ AI Error:", err);
    return { petition: "System error generating petition.", routes: [] };
  }
}

// -------------------------------------------------------------------
// EXPORT API
// -------------------------------------------------------------------
module.exports = {
  detectSector,
  getInstitutionsForSector,
  generatePetition,
  findById,
  filterByCategory,
};

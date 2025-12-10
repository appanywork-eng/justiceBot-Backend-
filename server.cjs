/**
 * PetitionDesk / JusticeBot Backend (PDPS-2.1 – A13)
 * Express + OpenAI + Hybrid routing (Electricity + International + AI)
 * + PCC/NHRC watchdogs
 * + Sector-wide escalation (police, health, aviation, judiciary, banking, telecoms, education)
 * + Flutterwave /pay endpoint
 * + SAN-grade petition builder (police-specific template)
 */

const express = require("express");
const cors = require("cors");
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

// --------------------------------------------------------------
// LOAD institutions.json (for electricity + international bodies)
// --------------------------------------------------------------
let INSTITUTIONS_JSON = {};
try {
  const filePath = path.join(__dirname, "data", "institutions.json");
  INSTITUTIONS_JSON = JSON.parse(fs.readFileSync(filePath, "utf8"));
  console.log("A10 institutions loaded successfully");
} catch (err) {
  console.error("Failed to load institutions.json:", err);
  INSTITUTIONS_JSON = {};
}

// --------------------------------------------------------------
// OPENAI INIT (optional – app must still work without it)
// --------------------------------------------------------------
let openai = null;
if (process.env.OPENAI_API_KEY) {
  try {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.log("OpenAI client initialised");
  } catch (err) {
    console.error("Error initialising OpenAI client:", err);
    openai = null;
  }
} else {
  console.log("OPENAI_API_KEY not set; fallback mode active.");
}

// --------------------------------------------------------------
// EXPRESS INIT
// --------------------------------------------------------------
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// --------------------------------------------------------------
// BASIC ROUTES
// --------------------------------------------------------------
app.get("/", (req, res) =>
  res.send(
    "JusticeBot PDPS-2.1 Backend (Supervisory Escalation Engine + Payments + SAN-grade petitions) is running 💡"
  )
);

app.get("/health", (req, res) =>
  res.json({ status: "ok", time: new Date().toISOString() })
);

app.get("/test", (req, res) =>
  res.json({
    status: "ok",
    message: "Test endpoint working",
    openai_status: openai ? "ready" : "not_initialized",
  })
);

// --------------------------------------------------------------
// HELPERS
// --------------------------------------------------------------
function textIncludesAny(t, arr) {
  t = (t || "").toLowerCase();
  return arr.some((x) => t.includes(x.toLowerCase()));
}

function normaliseOrgName(o) {
  return (o || "").trim().toLowerCase();
}

// --------------------------------------------------------------
// ELECTRICITY DETECTION (AEDC / NERC etc.)
// --------------------------------------------------------------
function detectElectricity(description) {
  const d = (description || "").toLowerCase();
  const k = [
    "electricity",
    "light",
    "power",
    "disco",
    "distribution company",
    "meter",
    "prepaid",
    "billing",
    "over billing",
    "overbilling",
    "token",
    "transformer",
  ];
  if (!textIncludesAny(d, k)) return null;

  const list = INSTITUTIONS_JSON.electricity || [];
  let primary = null;

  // Try to detect AEDC by Abuja area
  if (d.includes("abuja") || d.includes("gwarinpa") || d.includes("kubwa")) {
    primary = list.find((i) => i.key === "aedc") || null;
  }

  if (!primary) {
    primary =
      list.find((i) => i.key === "generic_dis") ||
      list[0] || {
        org: "Electricity Distribution Company",
        email: "",
        address: "",
        title: "",
      };
  }

  const through =
    list.find((i) => i.key === "nerc") || {
      org: "Nigerian Electricity Regulatory Commission (NERC)",
      email: "",
      address: "",
      title: "",
    };

  const ccList = list
    .filter((i) => !["aedc", "generic_dis", "nerc"].includes(i.key))
    .map((i) => ({
      org: i.org,
      email: i.email || "",
      address: i.address || "",
      title: i.title || "",
    }));

  return { primary, through, ccList };
}

// --------------------------------------------------------------
// INTERNATIONAL GENOCIDE / MASS ATROCITY ROUTING
// --------------------------------------------------------------
function detectInternational(description) {
  const d = (description || "").toLowerCase();
  const triggers = [
    "genocide",
    "ethnic cleansing",
    "mass killing",
    "massacre",
    "war crime",
    "crimes against humanity",
    "religious persecution",
    "political prisoner",
    "extra judicial killing",
    "extrajudicial killing",
    "systematic torture",
    "nnamdi kanu",
    "biafra",
    "faith-based violence",
    "minority community",
  ];
  if (!textIncludesAny(d, triggers)) return null;

  const intl = INSTITUTIONS_JSON.international || {};

  const ccList = Object.values(intl).map((i) => ({
    org: i.name,
    email: i.email || "",
    address: i.address || "",
    title: "",
  }));

  // Pick a strong global primary: US House Foreign Affairs Committee
  const primarySource = intl.us_congress_house || {};
  const primary = {
    org: primarySource.name || "US House Foreign Affairs Committee",
    email: primarySource.email || "",
    address:
      primarySource.address ||
      "House Committee on Foreign Affairs, Washington, D.C., USA",
    title: "",
  };

  const through = {
    org: "Federal Ministry of Justice",
    email: "info@justice.gov.ng",
    address: "Federal Secretariat, Abuja, Nigeria.",
    title: "Attorney General of the Federation",
  };

  return { primary, through, ccList };
}

// --------------------------------------------------------------
// AI DETECTION (GENERIC – WORLDWIDE)
// --------------------------------------------------------------
async function aiDetect(description) {
  if (!openai) return { primary: null, through: null, ccList: [] };

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `
You are a global institutions routing engine. RETURN ONLY JSON:

{
  "primary": { "org": "", "title": "", "email": "", "address": "" },
  "supervising": [ { "org": "", "title": "", "email": "", "address": "" } ],
  "cc": [ { "org": "", "title": "", "email": "", "address": "" } ]
}

Rules:
- Use ONLY verified-style domains for emails (.gov, .gov.ng, .org, .int, or clearly official company domains).
- If unsure of an email, leave it as an empty string.
- DO NOT invent fake domains or placeholders.
- No markdown, no comments, no extra text – JSON only.
`,
        },
        {
          role: "user",
          content:
            "Complaint:\n" +
            description +
            "\nReturn ONLY the JSON object described. No backticks.",
        },
      ],
    });

    const txt = resp.choices?.[0]?.message?.content || "{}";
    const data = JSON.parse(txt);

    function clean(o) {
      if (!o || !o.org) return null;
      return {
        org: o.org.trim(),
        title: (o.title || "").trim(),
        email: (o.email || "").trim(),
        address: (o.address || "").trim(),
      };
    }

    const primary = clean(data.primary);
    const through =
      Array.isArray(data.supervising) && data.supervising.length
        ? clean(data.supervising[0])
        : null;

    const ccList = [];

    if (Array.isArray(data.supervising)) {
      data.supervising.slice(1).forEach((x) => {
        const c = clean(x);
        if (c) ccList.push(c);
      });
    }

    if (Array.isArray(data.cc)) {
      data.cc.forEach((x) => {
        const c = clean(x);
        if (
          c &&
          !ccList.some(
            (e) => normaliseOrgName(e.org) === normaliseOrgName(c.org)
          )
        ) {
          ccList.push(c);
        }
      });
    }

    return { primary, through, ccList };
  } catch (err) {
    console.error("AI routing error:", err);
    return { primary: null, through: null, ccList: [] };
  }
}

// --------------------------------------------------------------
// GLOBAL WATCHDOGS – PCC + NHRC
// --------------------------------------------------------------
function applyWatchdogs(description, inst) {
  const out = inst || {};
  if (!Array.isArray(out.ccList)) out.ccList = [];

  function add(obj) {
    if (!obj || !obj.org) return;
    const key = normaliseOrgName(obj.org);
    if (!key) return;
    const exists = out.ccList.some(
      (c) => normaliseOrgName(c.org) === key
    );
    if (!exists) out.ccList.push(obj);
  }

  // PCC ALWAYS (administrative injustice watchdog)
  add({
    org: "Public Complaints Commission",
    email: "complaints@pcc.gov.ng,info@pcc.gov.ng",
    address: "25 Aguiyi Ironsi Street, Maitama, Abuja, Nigeria.",
    title: "The Honourable Chief Commissioner",
  });

  // NHRC if human rights related
  const d = (description || "").toLowerCase();
  const rights = [
    "human right",
    "brutality",
    "torture",
    "unlawful detention",
    "illegal detention",
    "extrajudicial",
    "extra judicial",
    "killing",
    "genocide",
    "discrimination",
    "rape",
    "sexual assault",
    "domestic violence",
    "violence",
    "oppression",
    "degrading treatment",
    "threat to life",
  ];
  if (rights.some((x) => d.includes(x))) {
    add({
      org: "National Human Rights Commission",
      email: "info@nhrc.gov.ng",
      address: "19 Aguiyi Ironsi Street, Maitama, Abuja, Nigeria.",
      title: "The Executive Secretary",
    });
  }

  return out;
}

// --------------------------------------------------------------
// A10 SUPERVISORY ESCALATION BY SECTOR (NIGERIA FOCUS)
// --------------------------------------------------------------
function applySectorSupervisors(description, inst) {
  const out = inst || {};
  if (!Array.isArray(out.ccList)) out.ccList = [];

  const d = (description || "").toLowerCase();
  const primaryName = normaliseOrgName(out.primary?.org || "");

  function addCc(obj) {
    if (!obj || !obj.org) return;
    const key = normaliseOrgName(obj.org);
    if (!key) return;
    const exists = out.ccList.some(
      (c) => normaliseOrgName(c.org) === key
    );
    if (!exists) out.ccList.push(obj);
  }

  // ---- POLICE & SECURITY ----
  const policeKeywords = [
    "police",
    "sars",
    "swat",
    "dpo",
    "cell",
    "custody",
    "station",
    "anti-kidnapping",
    "anti kidnapping",
    "anti-cultism",
    "detention",
    "igp",
    "checkpoint",
  ];

  const isPolice =
    textIncludesAny(d, policeKeywords) || primaryName.includes("police");

  if (isPolice) {
    addCc({
      org: "Inspector-General of Police, Nigeria Police Force",
      email: "",
      address: "Louis Edet House, Shehu Shagari Way, CBD, Abuja, Nigeria.",
      title: "Inspector-General of Police",
    });

    addCc({
      org: "Police Service Commission",
      email: "",
      address: "PSC Headquarters, Abuja, Nigeria.",
      title: "",
    });
  }

  // ---- HEALTH SECTOR ----
  const healthKeywords = [
    "hospital",
    "clinic",
    "doctor",
    "nurse",
    "midwife",
    "surgery",
    "operation",
    "medical negligence",
    "wrong diagnosis",
    "pharmacy",
    "drug",
    "medication",
    "injection",
    "laboratory",
    "lab result",
  ];

  const isHealth =
    textIncludesAny(d, healthKeywords) ||
    primaryName.includes("hospital") ||
    primaryName.includes("clinic") ||
    primaryName.includes("medical");

  if (isHealth) {
    addCc({
      org: "Federal Ministry of Health",
      email: "",
      address: "Federal Secretariat, Abuja, Nigeria.",
      title: "Honourable Minister of Health",
    });

    addCc({
      org: "Medical and Dental Council of Nigeria",
      email: "",
      address: "Abuja, Nigeria.",
      title: "",
    });

    const drugWords = [
      "drug",
      "medication",
      "fake medicine",
      "fake drug",
      "expired drug",
      "pharmacy",
      "injection",
      "syrup",
    ];
    if (textIncludesAny(d, drugWords)) {
      addCc({
        org: "National Agency for Food and Drug Administration and Control (NAFDAC)",
        email: "",
        address: "NAFDAC Headquarters, Abuja, Nigeria.",
        title: "",
      });
    }

    const outbreakWords = [
      "cholera",
      "outbreak",
      "epidemic",
      "pandemic",
      "infectious disease",
      "ebola",
    ];
    if (textIncludesAny(d, outbreakWords)) {
      addCc({
        org: "Nigeria Centre for Disease Control and Prevention (NCDC)",
        email: "",
        address: "Abuja, Nigeria.",
        title: "",
      });
    }
  }

  // ---- AVIATION ----
  const aviationKeywords = [
    "flight",
    "airline",
    "airport",
    "boarding pass",
    "aircraft",
    "plane",
    "runway",
    "lost luggage",
    "baggage",
    "tarmac",
  ];

  const isAviation =
    textIncludesAny(d, aviationKeywords) ||
    primaryName.includes("airline") ||
    primaryName.includes("airport") ||
    primaryName.includes("aviation");

  if (isAviation) {
    addCc({
      org: "Nigerian Civil Aviation Authority (NCAA)",
      email: "",
      address: "Murtala Muhammed Airport, Lagos, Nigeria.",
      title: "",
    });

    addCc({
      org: "Federal Airports Authority of Nigeria (FAAN)",
      email: "",
      address: "FAAN Headquarters, Lagos, Nigeria.",
      title: "",
    });

    addCc({
      org: "Federal Ministry of Aviation",
      email: "",
      address: "Federal Secretariat, Abuja, Nigeria.",
      title: "Honourable Minister of Aviation",
    });
  }

  // ---- JUDICIARY ----
  const judiciaryKeywords = [
    "court",
    "judge",
    "magistrate",
    "justice",
    "bail",
    "registry",
    "judicial",
    "appeal",
  ];

  const isJudiciary =
    textIncludesAny(d, judiciaryKeywords) ||
    primaryName.includes("court") ||
    primaryName.includes("judicial") ||
    primaryName.includes("registry");

  if (isJudiciary) {
    addCc({
      org: "National Judicial Council (NJC)",
      email: "",
      address: "Abuja, Nigeria.",
      title: "",
    });

    addCc({
      org: "Nigerian Bar Association",
      email: "",
      address:
        "NBA House, 4 Ladi Kwali Street, Wuse Zone 4, Abuja, Nigeria.",
      title: "",
    });
  }

  // ---- BANKING & FINANCIAL ----
  const bankingKeywords = [
    "bank",
    "account",
    "atm",
    "pos",
    "debit",
    "credit",
    "transfer",
    "loan",
    "mortgage",
    "card",
    "dom account",
    "current account",
    "savings account",
    "chargeback",
  ];

  const isBanking =
    textIncludesAny(d, bankingKeywords) ||
    primaryName.includes("bank") ||
    primaryName.includes("microfinance");

  if (isBanking) {
    addCc({
      org: "Central Bank of Nigeria – Consumer Protection Department",
      email: "",
      address: "Central Bank of Nigeria, Abuja, Nigeria.",
      title: "",
    });

    addCc({
      org: "Nigeria Deposit Insurance Corporation (NDIC)",
      email: "",
      address: "NDIC Headquarters, Abuja, Nigeria.",
      title: "",
    });

    addCc({
      org: "Federal Competition and Consumer Protection Commission (FCCPC)",
      email: "",
      address: "FCCPC Headquarters, Abuja, Nigeria.",
      title: "",
    });
  }

  // ---- TELECOMMUNICATIONS ----
  const telcoKeywords = [
    "mtn",
    "glo",
    "airtel",
    "9mobile",
    "etisalat",
    "data bundle",
    "call rate",
    "network",
    "no service",
    "dropped call",
    "sms",
    "ussd",
    "recharge card",
  ];

  const isTelecom =
    textIncludesAny(d, telcoKeywords) ||
    primaryName.includes("telecom") ||
    primaryName.includes("mtn") ||
    primaryName.includes("airtel") ||
    primaryName.includes("glo") ||
    primaryName.includes("9mobile");

  if (isTelecom) {
    addCc({
      org: "Nigerian Communications Commission (NCC)",
      email: "",
      address: "NCC Headquarters, Abuja, Nigeria.",
      title: "",
    });

    addCc({
      org: "Federal Ministry of Communications, Innovation and Digital Economy",
      email: "",
      address: "Abuja, Nigeria.",
      title: "",
    });
  }

  // ---- EDUCATION ----
  const educationKeywords = [
    "school",
    "student",
    "pupil",
    "university",
    "polytechnic",
    "college",
    "lecturer",
    "teacher",
    "principal",
    "vc",
    "dean",
    "expulsion",
    "suspension",
    "fee",
    "tuition",
  ];

  const isEducation =
    textIncludesAny(d, educationKeywords) ||
    primaryName.includes("university") ||
    primaryName.includes("polytechnic") ||
    primaryName.includes("college") ||
    primaryName.includes("school");

  if (isEducation) {
    addCc({
      org: "Federal Ministry of Education",
      email: "",
      address: "Federal Secretariat, Abuja, Nigeria.",
      title: "Honourable Minister of Education",
    });

    addCc({
      org: "National Universities Commission (NUC)",
      email: "",
      address: "Abuja, Nigeria.",
      title: "",
    });

    addCc({
      org: "National Commission for Colleges of Education (NCCE)",
      email: "",
      address: "Abuja, Nigeria.",
      title: "",
    });

    addCc({
      org: "Universal Basic Education Commission (UBEC)",
      email: "",
      address: "Abuja, Nigeria.",
      title: "",
    });
  }

  // ---- ELECTRICITY SUPERVISOR EXTRA (if not already in JSON) ----
  const isElectricity =
    textIncludesAny(d, ["electricity", "disco", "meter", "prepaid", "token"]) ||
    primaryName.includes("electricity") ||
    primaryName.includes("distribution company") ||
    primaryName.includes("disco");

  if (isElectricity) {
    addCc({
      org: "Federal Ministry of Power",
      email: "",
      address: "Federal Secretariat, Abuja, Nigeria.",
      title: "Honourable Minister of Power",
    });
  }

  return out;
}

// --------------------------------------------------------------
// SECTOR DETECTION (for petition style selection)
// --------------------------------------------------------------
function detectSector(description, inst) {
  const d = (description || "").toLowerCase();
  const primaryName = normaliseOrgName(inst?.primary?.org || "");

  const policeKeywords = [
    "police",
    "sars",
    "swat",
    "dpo",
    "checkpoint",
    "cell",
    "custody",
    "station",
    "anti-kidnapping",
    "anti kidnapping",
    "anti-cultism",
    "detention",
    "igp",
  ];
  if (textIncludesAny(d, policeKeywords) || primaryName.includes("police")) {
    return "police";
  }

  const elecKeywords = [
    "electricity",
    "disco",
    "meter",
    "prepaid",
    "token",
    "transformer",
    "overbilling",
    "over billing",
    "light",
    "power",
  ];
  if (textIncludesAny(d, elecKeywords) || primaryName.includes("electricity")) {
    return "electricity";
  }

  const bankingKeywords = [
    "bank",
    "account",
    "atm",
    "pos",
    "debit",
    "credit",
    "transfer",
    "loan",
    "mortgage",
    "card",
    "dom account",
  ];
  if (textIncludesAny(d, bankingKeywords) || primaryName.includes("bank")) {
    return "banking";
  }

  const healthKeywords = [
    "hospital",
    "clinic",
    "doctor",
    "nurse",
    "midwife",
    "surgery",
    "operation",
    "medical negligence",
    "wrong diagnosis",
    "pharmacy",
    "drug",
    "medication",
  ];
  if (
    textIncludesAny(d, healthKeywords) ||
    primaryName.includes("hospital") ||
    primaryName.includes("clinic")
  ) {
    return "health";
  }

  const telcoKeywords = [
    "mtn",
    "glo",
    "airtel",
    "9mobile",
    "etisalat",
    "network",
    "data bundle",
    "recharge card",
    "call rate",
  ];
  if (
    textIncludesAny(d, telcoKeywords) ||
    primaryName.includes("telecom") ||
    primaryName.includes("ncc")
  ) {
    return "telecom";
  }

  const educationKeywords = [
    "school",
    "student",
    "pupil",
    "university",
    "polytechnic",
    "college",
    "lecturer",
    "teacher",
    "principal",
    "vc",
    "dean",
  ];
  if (
    textIncludesAny(d, educationKeywords) ||
    primaryName.includes("university") ||
    primaryName.includes("polytechnic") ||
    primaryName.includes("college")
  ) {
    return "education";
  }

  // fallback
  return "general";
}

// --------------------------------------------------------------
// POLICE ADDRESSING REFINER (CP + IGP "Through")
// --------------------------------------------------------------
function refinePoliceInstitutions(description, inst) {
  const out = inst || { primary: null, through: null, ccList: [] };
  if (!Array.isArray(out.ccList)) out.ccList = [];

  const d = (description || "").toLowerCase();

  const STATE_MATCHES = [
    {
      state: "Federal Capital Territory (FCT)",
      command: "FCT Police Command",
      keywords: ["abuja", "gwarinpa", "kubwa", "nyanya", "lugbe", "fct"],
    },
    {
      state: "Kogi State",
      command: "Kogi State Police Command",
      keywords: ["kogi", "okene", "lokoja", "ayegunle"],
    },
    {
      state: "Edo State",
      command: "Edo State Police Command",
      keywords: ["edo", "benin", "ekpoma", "auch", "auchii"],
    },
    {
      state: "Lagos State",
      command: "Lagos State Police Command",
      keywords: ["lagos", "lekki", "oshodi", "ikorodu", "ajah", "ikeja"],
    },
    {
      state: "Rivers State",
      command: "Rivers State Police Command",
      keywords: ["rivers", "port harcourt", "ph city"],
    },
  ];

  let detected = null;
  for (const entry of STATE_MATCHES) {
    if (textIncludesAny(d, entry.keywords)) {
      detected = entry;
      break;
    }
  }

  let emailBackup =
    out.primary && out.primary.email ? out.primary.email : "";

  if (detected) {
    out.primary = {
      org: `Commissioner of Police, ${detected.command}`,
      title: "The Commissioner of Police",
      address: `${detected.command} Headquarters, ${detected.state}, Nigeria.`,
      email: emailBackup,
    };
  } else if (
    !out.primary ||
    !normaliseOrgName(out.primary.org || "").includes("police")
  ) {
    out.primary = {
      org: "Commissioner of Police, State Police Command",
      title: "The Commissioner of Police",
      address: "State Police Command Headquarters, Nigeria.",
      email: emailBackup,
    };
  }

  const throughEmail =
    out.through && out.through.email ? out.through.email : "";

  out.through = {
    org: "Inspector-General of Police, Nigeria Police Force",
    title: "The Inspector-General of Police",
    address: "Force Headquarters, Louis Edet House, Abuja, Nigeria.",
    email: throughEmail,
  };

  return out;
}

// --------------------------------------------------------------
// HYBRID DETECTION PIPELINE (A10)
// --------------------------------------------------------------
async function detectHybrid(description) {
  // 1. Electricity rule – always first for billing/meter issues
  const elec = detectElectricity(description);
  if (elec) {
    console.log("Routing via ELECTRICITY rules");
    return elec;
  }

  // 2. International genocide / mass atrocity escalation
  const intl = detectInternational(description);
  if (intl) {
    console.log("Routing via INTERNATIONAL GENOCIDE rules");
    return intl;
  }

  // 3. Generic AI-based detection for all other cases
  const ai = await aiDetect(description);
  console.log("Routing via AI generic detection");
  return ai;
}

// --------------------------------------------------------------
// PETITION BUILDERS (PDPS-2.1)
// --------------------------------------------------------------
async function buildPetition(complainant, inst, sector) {
  const { fullName, email, phone, address, description } = complainant;
  if (!openai) return fallbackPetition(complainant, inst);

  const today = new Date().toLocaleDateString("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const header = [
    fullName,
    address,
    email ? `Email: ${email}` : "",
    phone ? `Phone: ${phone}` : "",
    today,
  ]
    .filter(Boolean)
    .join("\n");

  const ccText =
    inst.ccList
      ?.map((c) => `${c.org}\n${c.address || ""}`.trim())
      .join("\n\n") || "None";

  const primaryBlock = `
${inst.primary?.title || ""}
${inst.primary?.org || ""}
${inst.primary?.address || ""}`.trim();

  const throughBlock =
    inst.through && inst.through.org
      ? `Through:
${inst.through.title || ""}
${inst.through.org}
${inst.through.address || ""}`.trim()
      : "";

  let systemPrompt;
  let userPrompt;

  // --- POLICE SPECIAL TEMPLATE (SAN-grade) ---
  if (sector === "police") {
    systemPrompt = `
You are a top-tier Nigerian human rights and criminal justice lawyer (SAN level).
Write an EXTREMELY STRONG but respectful police-related petition.

STRICT FORMAT:
- Nigerian official letter style.
- No placeholders (no [Your Name], [Address], etc.).
- Use ONLY real details from the prompt.
- Tone: firm, legal, authoritative, respectful, fearless.
- Use numbered paragraphs for the facts (2, 3, 4...).
- Include a short "Legal Basis" section referencing:
  * Section 34(1) of the 1999 Constitution (right to dignity).
  * Section 35 (right to personal liberty).
  * Section 36 (fair hearing) – where relevant.
  * Relevant provisions of the Administration of Criminal Justice Act (ACJA) 2015 on arrest/detention.
  * Police Act 2020 & Anti-Torture Act 2017 where relevant.
- Include a clear "Reliefs Sought" section with numbered prayers.
- Closing must be strong but courteous, affirming trust in the institution.

ADDRESSING RULES:
- Use the provided primary and "Through" blocks EXACTLY as given.
- If "Through" is present, show it under the primary block.
- "CC" section should list key watchdogs provided (PCC, NHRC, others).

OUTPUT:
- Fully ready-to-print letter.
- No explanations, no markdown, no commentary – ONLY the petition letter text.
`;

    userPrompt = `
${header}

${primaryBlock}

${throughBlock ? "\n\n" + throughBlock : ""}

CC:
${ccText}

SUBJECT:
Write a strong, all-caps subject line that clearly captures UNLAWFUL ARREST, ILLEGAL DETENTION, EXTORTION, THREAT TO LIFE or other police misconduct based strictly on the facts below.

FACTS OF THE CASE (use this to build clear, numbered facts):
${description}

INSTRUCTIONS:
- Do NOT invent new facts.
- Do NOT invent institutions that are not in the addressing / CC.
- Make the story clear: date, place (checkpoint / station), officers (if named), actions taken, threats, breaches.
- Then add a short "Legal Basis" section citing the relevant laws.
- Then add a numbered "Reliefs Sought" section (investigation, discipline, apology, compensation, etc. as appropriate).
- End with "Yours faithfully," and the complainant's name.`;
  } else {
    // --- GENERAL / OTHER SECTORS (still strong, SAN-like) ---
    systemPrompt = `
You are an expert Nigerian petition drafting lawyer (SAN standard).
Write a VERY STRONG, highly formal petition.

Rules:
- Nigerian official letter style.
- No placeholders (no [Your Name], [Address], etc.).
- Use only the real-world details provided.
- Tone: firm, legal, respectful, authoritative.
- Structure:
  * Header with complainant details and date.
  * Proper addressing of primary institution (and "Through" block if any).
  * CC list.
  * Clear subject line.
  * Facts of the case in numbered or well-structured paragraphs.
  * Short legal / rights basis (e.g., Public Complaints Commission Act, Consumer protection laws, sector regulators, Constitution) where appropriate.
  * Numbered "Reliefs Sought" section.
  * Strong closing paragraph.
  * "Yours faithfully" and complainant details.

- Do NOT invent new institutions beyond those in the addressing / CC.
- Do NOT add fake statutes; only use well-known Nigerian frameworks (Constitution, PCC Act, sector regulators, consumer protection, etc.).
`;

    userPrompt = `
${header}

${primaryBlock}

${throughBlock ? "\n\n" + throughBlock : ""}

CC:
${ccText}

SUBJECT:
Generate a strong, precise subject line based strictly on the description.

Description of complaint (use this to build the facts):
${description}

Write the full petition letter now following all rules. Do NOT invent new facts or new institutions.`;
  }

  try {
    const r = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.22,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    return (
      r.choices?.[0]?.message?.content ||
      fallbackPetition(complainant, inst)
    );
  } catch (err) {
    console.error("AI petition error:", err);
    return fallbackPetition(complainant, inst);
  }
}

// --------------------------------------------------------------
// FALLBACK PETITION (NO OPENAI OR ERROR)
// --------------------------------------------------------------
function fallbackPetition(c, inst) {
  const today = new Date().toLocaleDateString("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return `
${c.fullName}
${c.address || ""}
Email: ${c.email || ""}
Phone: ${c.phone || ""}
${today}

${inst.primary?.org || "The Appropriate Authority"}
${inst.primary?.address || ""}

Through:
${inst.through?.org || ""}

CC:
${(inst.ccList || []).map((x) => x.org).join("\n")}

Dear Sir/Madam,

RE: FORMAL COMPLAINT / PETITION

${c.description}

I respectfully request an immediate investigation and appropriate remedies.

Yours faithfully,
${c.fullName}
${c.phone || ""}
${c.email || ""}
`.trim();
}

// --------------------------------------------------------------
// POST: GENERATE PETITION
// --------------------------------------------------------------
app.post("/generate-petition", async (req, res) => {
  console.log("Incoming request:", req.body);

  const description = req.body.description || "";
  if (!description.trim()) {
    return res.status(200).json({
      petitionText: "Please enter your complaint description.",
      primaryInstitution: null,
      throughInstitution: null,
      ccList: [],
    });
  }

  const complainant = {
    fullName: req.body.fullName || "",
    email: req.body.email || "",
    phone: req.body.phone || "",
    address: req.body.address || "",
    description,
  };

  // 1. Core routing (electricity / international / AI)
  let inst = await detectHybrid(description);

  // Ensure base shape
  if (!inst || typeof inst !== "object") {
    inst = { primary: null, through: null, ccList: [] };
  }
  if (!Array.isArray(inst.ccList)) inst.ccList = [];

  // 2. Apply watchdogs (PCC + NHRC)
  inst = applyWatchdogs(description, inst);

  // 3. Apply A10 sector-wide supervisors (police, health, aviation, etc.)
  inst = applySectorSupervisors(description, inst);

  // 4. Detect sector & refine institutions for police cases (CP + IGP)
  const sector = detectSector(description, inst);
  if (sector === "police") {
    inst = refinePoliceInstitutions(description, inst);
  }

  // Clean CC list
  inst.ccList = inst.ccList.filter(
    (c) => c && typeof c.org === "string" && c.org.trim()
  );

  // 5. Build petition text (sector-aware)
  const petitionText = await buildPetition(complainant, inst, sector);

  // 6. Respond
  return res.status(200).json({
    petitionText,
    primaryInstitution: inst.primary,
    throughInstitution: inst.through,
    ccList: inst.ccList,
  });
});

// --------------------------------------------------------------
// POST: PAY (Flutterwave V3)
// --------------------------------------------------------------
app.post("/pay", async (req, res) => {
  try {
    const secret = process.env.FLW_SECRET_KEY;
    if (!secret) {
      return res
        .status(500)
        .json({ error: "Payment gateway not configured." });
    }

    const {
      amount = 1500, // default amount in NGN
      currency,
      fullName,
      email,
      description,
    } = req.body || {};

    const baseCurrency =
      currency || process.env.BASE_PAYMENT_CURRENCY || "NGN";

    const txRef = `PDK-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

    const payload = {
      tx_ref: txRef,
      amount,
      currency: baseCurrency,
      redirect_url:
        process.env.FLW_REDIRECT_URL ||
        "https://petitiondesk.com/payment-complete",
      customer: {
        email: email || "no-email@petitiondesk.com",
        name: fullName || "PetitionDesk User",
      },
      customizations: {
        title: "PetitionDesk – Petition Draft",
        description:
          (description && description.slice(0, 200)) ||
          "Payment for petition drafting service.",
      },
    };

    const fwRes = await fetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await fwRes.json().catch(() => ({}));

    if (!fwRes.ok || !data?.data?.link) {
      console.error("Flutterwave init error:", data);
      return res
        .status(500)
        .json({ error: "Unable to initialise payment." });
    }

    return res.json({
      paymentLink: data.data.link,
      txRef,
    });
  } catch (err) {
    console.error("Payment route error:", err);
    return res.status(500).json({ error: "Payment error." });
  }
});

// --------------------------------------------------------------
// START SERVER
// --------------------------------------------------------------
app.listen(PORT, "0.0.0.0", () =>
  console.log(`JusticeBot PDPS-2.1 Backend running on ${PORT}`)
);

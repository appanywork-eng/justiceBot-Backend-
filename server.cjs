/**
 * PetitionDesk / JusticeBot Backend (A13 – Strong Petitions + Paywall + Supervisory Escalation)
 * Express + OpenAI + Hybrid routing (Electricity + International + AI)
 * + PCC/NHRC watchdogs
 * + Sector-wide escalation (police, health, aviation, judiciary, banking, telecoms, education)
 * + Flutterwave /pay endpoint
 * + Preview vs Paid full petition (hasPaid flag)
 */

const express = require("express");
const cors = require("cors");
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

// Node 18+ has global fetch. If not, uncomment below and install node-fetch.
// const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));

// --------------------------------------------------------------
// LOAD institutions.json (for electricity + international bodies)
// --------------------------------------------------------------
let INSTITUTIONS_JSON = {};
try {
  const filePath = path.join(__dirname, "data", "institutions.json");
  INSTITUTIONS_JSON = JSON.parse(fs.readFileSync(filePath, "utf8"));
  console.log("A13 institutions loaded successfully");
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
    "JusticeBot A13 Backend (Strong Petitions + Paywall + Supervisory Escalation) is running 💡"
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
// A10–A13 SUPERVISORY ESCALATION BY SECTOR (NIGERIA FOCUS)
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

    // NAFDAC if drugs / injections / fake medicine
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

    // NCDC if outbreak / epidemic
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
// HYBRID DETECTION PIPELINE (A10–A13)
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
// PETITION BUILDERS (STRONG – GROK-STYLE QUALITY)
// --------------------------------------------------------------
async function buildPetition(complainant, inst) {
  const { fullName, email, phone, address, description } = complainant;
  if (!openai) return fallbackPetition(complainant, inst);

  const today = new Date().toLocaleDateString("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const headerLines = [
    fullName,
    address,
    email ? `Email: ${email}` : "",
    phone ? `Phone: ${phone}` : "",
    today,
  ].filter(Boolean);

  const header = headerLines.join("\n");

  const primaryLines = [];
  if (inst.primary?.title) primaryLines.push(inst.primary.title);
  if (inst.primary?.org) primaryLines.push(inst.primary.org);
  if (inst.primary?.address) primaryLines.push(inst.primary.address);
  const primaryBlock = primaryLines.join("\n");

  let throughBlock = "";
  if (inst.through && inst.through.org) {
    const tb = [];
    tb.push("Through:");
    if (inst.through.title) tb.push(inst.through.title);
    tb.push(inst.through.org);
    if (inst.through.address) tb.push(inst.through.address);
    throughBlock = tb.join("\n");
  }

  const ccText =
    inst.ccList && inst.ccList.length
      ? inst.ccList
          .map((c) => `${c.org}${c.address ? "\n" + c.address : ""}`)
          .join("\n\n")
      : "None";

  const systemPrompt = `
You are an expert Nigerian petition-drafting lawyer.
Your job is to write very strong, formal petitions that look like something a senior legal practitioner wrote for a serious complaint.

STRICT RULES:
- Use ONLY the details given (complainant + institutions + description).
- NO placeholders like [Your Name], [Your Address], [Account Number]. If something is missing, just keep the wording general.
- Tone must be firm, respectful, and legally grounded.
- Petition should look ready for printing on A4, addressed to Nigerian authorities or international bodies.

STRUCTURE (VERY IMPORTANT):
1. Complainant block (name, address, contact, date) – already provided in header.
2. Address block of the PRIMARY institution, then a clear "Through:" block if any supervising body is given.
3. "CC:" section listing other institutions.
4. Salutation: "Sir," or "Your Excellency," depending on the addressee; if in doubt use "Sir,".
5. Subject line in ALL CAPS and very specific (e.g. "PETITION AGAINST PERSISTENT AND GROSS OVER-BILLING BY THE FCT WATER BOARD – ACCOUNT NO: …").
6. Intro paragraph: who the complainant is, location, and summary of the grievance.
7. FACTS section (numbered paragraphs 1, 2, 3… with clear, chronological facts: dates, amounts, actions taken).
8. A paragraph on legal / rights basis (e.g. Nigerian Constitution, PCC Act, sector regulations) ONLY when clearly relevant. Do not overdo it.
9. RELIEFS SOUGHT / PRAYERS section: numbered (a, b, c, d) with clear, practical requests.
10. Closing paragraph: strong but respectful, asking for swift intervention.
11. "Yours faithfully," then complainant’s name and contact.

FORMATTING:
- Use clear headings like "FACTS OF THE CASE", "RELIEFS SOUGHT", etc.
- Use numbered items and indentation similar to a real Nigerian official letter.
- Do NOT wrap the output in backticks or markdown. Plain text only.
`;

  const userPrompt = `
COMPLAINANT HEADER (print exactly as given at the top of the letter):

${header}

PRIMARY INSTITUTION BLOCK:
${primaryBlock}

${throughBlock ? "\n" + throughBlock : ""}

CC RECIPIENTS:
${ccText}

COMPLAINT DESCRIPTION (this is the raw story – convert it into structured facts and legal narrative):
${description}

Write the FULL petition letter now, following all the structure rules above.
Do NOT add any placeholders in square brackets.
Do NOT invent new institutions or contacts – use ONLY what is reasonably implied from the context.
`;

  try {
    const r = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.25,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    return r.choices?.[0]?.message?.content || fallbackPetition(complainant, inst);
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
// POST: GENERATE PETITION  (with preview vs full based on hasPaid)
// --------------------------------------------------------------
app.post("/generate-petition", async (req, res) => {
  console.log("Incoming /generate-petition request:", req.body);

  const description = req.body.description || "";
  const hasPaid = !!req.body.hasPaid; // if true, return full; if false, return preview

  if (!description.trim()) {
    return res.status(200).json({
      petitionText: "Please enter your complaint description.",
      primaryInstitution: null,
      throughInstitution: null,
      ccList: [],
      locked: true,
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

  // Clean CC list
  inst.ccList = inst.ccList.filter(
    (c) => c && typeof c.org === "string" && c.org.trim()
  );

  // 4. Build full petition text
  const fullPetition = await buildPetition(complainant, inst);

  // 5. Paywall: if not paid, return only preview/truncated version
  let petitionText = fullPetition;
  let locked = false;

  if (!hasPaid) {
    locked = true;
    const maxChars = 900; // you can tune this
    if (petitionText.length > maxChars) {
      petitionText =
        petitionText.slice(0, maxChars) +
        "\n\n[Full petition locked. Complete payment on PetitionDesk.com to unlock the complete version, including full legal arguments, reliefs, and formatting.]";
    }
  }

  // 6. Respond
  return res.status(200).json({
    petitionText,
    primaryInstitution: inst.primary,
    throughInstitution: inst.through,
    ccList: inst.ccList,
    locked,
  });
});

// --------------------------------------------------------------
// POST: PAY (Flutterwave V3)
// NIGERIA: 1000 NGN
// OTHERS: 1500 NGN  (all in NGN; Flutterwave handles FX)
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
      fullName,
      email,
      description,
      countryCode = "NG", // expect "NG" or ISO-2
    } = req.body || {};

    let amount = 1000;
    let currency = "NGN";

    if (countryCode && countryCode.toUpperCase() !== "NG") {
      amount = 1500;
    }

    const txRef = `PDK-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

    const payload = {
      tx_ref: txRef,
      amount,
      currency,
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
      amount,
      currency,
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
  console.log(`JusticeBot A13 Backend running on ${PORT}`)
);

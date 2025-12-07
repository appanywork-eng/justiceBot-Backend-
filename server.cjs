/**
 * PetitionDesk / JusticeBot Backend (A8 – World Brain Routing)
 * Express + OpenAI + AI institution detection + PCC/NHRC watchdogs + INTERNATIONAL ROUTING
 */

const express = require("express");
const cors = require("cors");
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

// --------------------------------------------------------------
// LOAD institutions.json
// --------------------------------------------------------------
let INSTITUTIONS_JSON = {};
try {
  const filePath = path.join(__dirname, "data", "institutions.json");
  INSTITUTIONS_JSON = JSON.parse(fs.readFileSync(filePath, "utf8"));
  console.log("A8 institutions loaded successfully");
} catch (err) {
  console.error("Failed to load institutions.json:", err);
  INSTITUTIONS_JSON = {};
}

// --------------------------------------------------------------
// OPENAI INIT
// --------------------------------------------------------------
let openai = null;
if (process.env.OPENAI_API_KEY) {
  try {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.log("OpenAI client initialised");
  } catch (err) {
    console.error("Error initialising OpenAI client:", err);
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
app.get("/", (req, res) => res.send("JusticeBot A8 Backend is running 💡"));

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

function safeLower(text) {
  return (text || "").toLowerCase();
}

// --------------------------------------------------------------
// ELECTRICITY DETECTION (AEDC / NERC)
// --------------------------------------------------------------
function detectElectricity(description) {
  const d = safeLower(description);
  const k = [
    "electricity",
    "aedc",
    "disco",
    "meter",
    "billing",
    "token",
    "power",
    "light",
  ];
  if (!textIncludesAny(d, k)) return null;

  const list = INSTITUTIONS_JSON.electricity || [];
  let primary = null;

  if (d.includes("abuja") || d.includes("gwarinpa") || d.includes("kubwa")) {
    primary = list.find((i) => i.key === "aedc") || null;
  }
  if (!primary) {
    primary =
      list.find((i) => i.key === "generic_dis") ||
      list[0] || {
        org: "Electricity Distribution Company",
        email: "",
      };
  }

  const through =
    list.find((i) => i.key === "nerc") || {
      org: "Nigerian Electricity Regulatory Commission (NERC)",
      email: "",
    };

  const ccList = list
    .filter((i) => i && !["aedc", "generic_dis", "nerc"].includes(i.key))
    .map((i) => ({
      org: i.org,
      email: i.email || "",
      address: i.address || "",
      title: i.title || "",
    }));

  return { primary, through, ccList };
}

// --------------------------------------------------------------
// GLOBAL WATCHDOGS (PCC + NHRC)
// --------------------------------------------------------------
function applyWatchdogs(description, inst) {
  const out = inst || {};
  if (!Array.isArray(out.ccList)) out.ccList = [];

  function add(obj) {
    if (!obj || !obj.org) return;
    const exists = out.ccList.some(
      (c) => c && c.org && c.org.toLowerCase() === obj.org.toLowerCase()
    );
    if (!exists) out.ccList.push(obj);
  }

  // ALWAYS CC PCC
  add({
    org: "Public Complaints Commission",
    email: "complaints@pcc.gov.ng,info@pcc.gov.ng",
    address: "25 Aguiyi Ironsi Street, Maitama, Abuja, Nigeria.",
    title: "The Honourable Chief Commissioner",
  });

  // NHRC if rights-related
  const d = safeLower(description);
  const rights = [
    "human right",
    "brutality",
    "torture",
    "unlawful",
    "detention",
    "violence",
    "abuse",
    "oppression",
    "rape",
    "killing",
    "genocide",
    "extrajudicial",
    "extra judicial",
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
// INTERNATIONAL ROUTING (OPTION A – US CONGRESS AS PRIMARY)
// --------------------------------------------------------------
function detectInternational(description) {
  const d = safeLower(description);
  const triggers = [
    "genocide",
    "ethnic cleansing",
    "international",
    "foreign intervention",
    "foreign pressure",
    "united states congress",
    "us congress",
    "u.s. congress",
    "uk parliament",
    "british parliament",
    "european parliament",
    "african union",
    "ecowas",
    "international community",
  ];
  if (!textIncludesAny(d, triggers)) return null;

  // Support two possible JSON shapes:
  // 1) { "international": { us_congress_house: {...}, ... } }
  // 2) { "us_congress_house": {...}, "uk_parliament_petitions": {...}, ... }
  const intlBlock =
    (INSTITUTIONS_JSON.international &&
      typeof INSTITUTIONS_JSON.international === "object")
      ? INSTITUTIONS_JSON.international
      : null;

  const getIntlEntry = (key) => {
    if (intlBlock && intlBlock[key]) return intlBlock[key];
    if (INSTITUTIONS_JSON[key]) return INSTITUTIONS_JSON[key];
    return null;
  };

  const intlKeys = [
    "us_congress_house",
    "us_congress_hr",
    "us_congress_senate",
    "uk_parliament_petitions",
    "uk_parliament_fac",
    "eu_parliament_droi",
    "eu_eeas_hr",
    "au_paps",
    "achpr",
    "ecowas_pps",
    "ecowas_info",
  ];

  const intlEntries = intlKeys
    .map((k) => getIntlEntry(k))
    .filter((v) => v && typeof v === "object");

  const ccList = intlEntries.map((i) => ({
    org: i.name || i.org || "",
    email: i.email || "",
    address: i.address || "",
    title: i.title || "",
  }));

  const usHouse = getIntlEntry("us_congress_house") || {};
  const primary = {
    org: usHouse.name || "United States Congress",
    email: usHouse.email || "",
    address: usHouse.address || "Washington, D.C., USA",
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
// AI DETECTION (fallback for normal routing)
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
          content:
            `You are a global institutions routing engine. RETURN ONLY JSON:

{
 "primary": {"org":"", "title":"", "email":"", "address":""},
 "supervising":[{"org":"", "title":"", "email":"", "address":""}],
 "cc":[{"org":"", "title":"", "email":"", "address":""}]
}

Rules:
- Prefer real, official institutions (CBN, NCC, NERC, NHRC, PCC, EFCC, NDLEA, US Congress, UK Parliament, etc.).
- Use ONLY verified-style emails (.gov, .gov.ng, .org, .int, or clear institutional domains).
- If unsure of an email, leave it as an empty string "".
- NO placeholders, NO fake domains, NO markdown.`,
        },
        {
          role: "user",
          content:
            "Complaint:\n" +
            description +
            "\nReturn ONLY the JSON object, no markdown, no explanation.",
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
        if (c && !ccList.some((e) => e.org === c.org)) {
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
// HYBRID INSTITUTION DETECTION
// --------------------------------------------------------------
async function detectHybrid(description) {
  // 1. Electricity rule
  const e = detectElectricity(description);
  if (e) {
    console.log("Routing: electricity rule triggered.");
    return e;
  }

  // 2. International escalation rule (OPTION A)
  const intl = detectInternational(description);
  if (intl) {
    console.log("Routing: INTERNATIONAL escalation triggered.");
    return intl;
  }

  // 3. AI detection
  const ai = await aiDetect(description);
  console.log("Routing: AI detection result:", ai);
  return ai;
}

// --------------------------------------------------------------
// PETITION BUILDERS
// --------------------------------------------------------------
async function buildPetition(complainant, inst) {
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
    Array.isArray(inst.ccList) && inst.ccList.length
      ? inst.ccList
          .map((c) => `${c.org}${c.address ? "\n" + c.address : ""}`)
          .join("\n\n")
      : "None";

  const systemPrompt = `
You are an expert Nigerian petition drafting lawyer.
Write a VERY STRONG, highly formal petition.
- No placeholders.
- Use only provided details.
- Tone: firm, legal, respectful, authoritative.
- End with "Yours faithfully," then the complainant's name, phone and email.
`;

  const userPrompt = `
${header}

${inst.primary?.title || ""}
${inst.primary?.org || ""}
${inst.primary?.address || ""}

${
  inst.through?.org
    ? "Through:\n" +
      (inst.through?.title ? inst.through.title + "\n" : "") +
      inst.through.org +
      (inst.through?.address ? "\n" + inst.through.address : "")
    : ""
}

CC:
${ccText}

SUBJECT: Autogenerate a strong, precise subject line based on the description.

Complaint description:
${description}

Write a FULL petition with clear narrative and numbered reliefs. Do not invent facts. Do not use placeholders.`;

  try {
    const r = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.25,
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
// FALLBACK PETITION
// --------------------------------------------------------------
function fallbackPetition(c, inst) {
  const today = new Date().toLocaleDateString("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const ccNames =
    Array.isArray(inst.ccList) && inst.ccList.length
      ? inst.ccList.map((x) => x.org).join("\n")
      : "";

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
${ccNames}

Dear Sir/Madam,

RE: FORMAL COMPLAINT / PETITION

${c.description}

I respectfully request immediate investigation and appropriate remedial action.

Yours faithfully,
${c.fullName}
${c.phone || ""}
${c.email || ""}
`;
}

// --------------------------------------------------------------
// POST: GENERATE PETITION
// --------------------------------------------------------------
app.post("/generate-petition", async (req, res) => {
  console.log("Incoming request:", req.body);

  const description =
    typeof req.body.description === "string" ? req.body.description : "";
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

  let inst = await detectHybrid(description);
  inst = applyWatchdogs(description, inst);

  if (!Array.isArray(inst.ccList)) inst.ccList = [];
  inst.ccList = inst.ccList.filter(
    (c) => c && typeof c.org === "string" && c.org.trim()
  );

  const petitionText = await buildPetition(complainant, inst);

  return res.status(200).json({
    petitionText,
    primaryInstitution: inst.primary || null,
    throughInstitution: inst.through || null,
    ccList: inst.ccList,
  });
});

// --------------------------------------------------------------
// START SERVER
// --------------------------------------------------------------
app.listen(PORT, "0.0.0.0", () =>
  console.log(`JusticeBot A8 Backend running on ${PORT}`)
);

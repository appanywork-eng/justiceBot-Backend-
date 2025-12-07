/**
 * PetitionDesk / JusticeBot Backend (A9 – World Brain + UN/ICC/Media)
 * Express + OpenAI + AI institution detection + PCC/NHRC watchdogs +
 * INTERNATIONAL ROUTING (US/UK/EU/AU/ECOWAS/UN/ICC) + Petition ID
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
  console.log("A9 institutions loaded successfully");
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
  res.send("JusticeBot A9 Backend (World Brain + UN/ICC/Media) is running 💡")
);

app.get("/health", (req, res) =>
  res.json({ status: "ok", version: "A9", time: new Date().toISOString() })
);

app.get("/test", (req, res) =>
  res.json({
    status: "ok",
    message: "Test endpoint working",
    version: "A9",
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

function createPetitionId() {
  // Simple unique-ish petition ID e.g. PD-1733612345678-421
  return `PD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

// --------------------------------------------------------------
// ELECTRICITY DETECTION (AEDC / NERC)
// --------------------------------------------------------------
function detectElectricity(description) {
  const d = (description || "").toLowerCase();
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
  if (!primary)
    primary =
      list.find((i) => i.key === "generic_dis") ||
      list[0] || { org: "Electricity Distribution Company", email: "" };

  const through =
    list.find((i) => i.key === "nerc") || {
      org: "Nigerian Electricity Regulatory Commission (NERC)",
      email: "",
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
// INTERNATIONAL ROUTING  (US/UK/EU/AU/ECOWAS/UN/ICC/MEDIA)
// --------------------------------------------------------------
function detectInternational(description) {
  const d = (description || "").toLowerCase();

  // Only fire when it's clearly a big international / atrocity issue
  const triggers = [
    "genocide",
    "ethnic cleansing",
    "war crime",
    "crimes against humanity",
    "massacre",
    "faith-based killing",
    "religious persecution",
    "minority persecution",
    "international intervention",
    "foreign intervention",
    "world attention",
    "united states congress",
    "us congress",
    "uk parliament",
    "european parliament",
    "african union",
    "ecowas",
    "united nations",
    "un human rights",
    "ohchr",
    "unhcr",
    "icc",
    "international criminal court",
  ];

  if (!textIncludesAny(d, triggers)) return null;

  const intl = INSTITUTIONS_JSON.international || {};
  const unBodies = INSTITUTIONS_JSON.un_bodies || {};
  const media = INSTITUTIONS_JSON.media || {};

  // Primary – US House Foreign Affairs Committee by default
  const primarySource = intl.us_congress_house || {};
  const primary = {
    org: primarySource.name || "US House Foreign Affairs Committee",
    email: primarySource.email || "",
    address: primarySource.address || "Washington, D.C., USA",
    title: "",
  };

  const through = {
    org: "Federal Ministry of Justice",
    email: "info@justice.gov.ng",
    address: "Federal Secretariat, Abuja, Nigeria.",
    title: "Attorney General of the Federation",
  };

  const ccList = [];

  function pushFromObjectMap(objMap) {
    Object.values(objMap || {}).forEach((i) => {
      if (!i || !i.name) return;
      ccList.push({
        org: i.name,
        email: i.email || "",
        address: i.address || "",
        title: i.title || "",
      });
    });
  }

  // Add all other international institutions, UN bodies & media
  pushFromObjectMap(intl);
  pushFromObjectMap(unBodies);
  pushFromObjectMap(media);

  // Remove duplicate of primary from cc
  const filteredCc = ccList.filter(
    (c) =>
      c.org &&
      c.org.toLowerCase() !== primary.org.toLowerCase()
  );

  return { primary, through, ccList: filteredCc };
}

// --------------------------------------------------------------
// GLOBAL WATCHDOGS (PCC + NHRC)
// --------------------------------------------------------------
function applyWatchdogs(description, inst) {
  const out = inst || {};
  if (!Array.isArray(out.ccList)) out.ccList = [];

  function add(obj) {
    if (!obj || !obj.org) return;
    if (
      !out.ccList.some(
        (c) => c.org && c.org.toLowerCase() === obj.org.toLowerCase()
      )
    ) {
      out.ccList.push(obj);
    }
  }

  // PCC – ALWAYS
  add({
    org: "Public Complaints Commission",
    email: "complaints@pcc.gov.ng,info@pcc.gov.ng",
    address: "25 Aguiyi Ironsi Street, Maitama, Abuja, Nigeria.",
    title: "The Honourable Chief Commissioner",
  });

  // NHRC – only if human-rights style complaint
  const d = (description || "").toLowerCase();
  const rights = [
    "human right",
    "right to life",
    "police brutality",
    "brutality",
    "torture",
    "unlawful",
    "illegal detention",
    "detention",
    "violence",
    "abuse",
    "oppression",
    "rape",
    "sexual assault",
    "killing",
    "extrajudicial",
    "extra-judicial",
    "genocide",
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
// AI DETECTION (for non-electricity, non-explicit-international)
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
          content: `You are a global institutions routing engine. RETURN ONLY JSON:

{
 "primary": {"org":"", "title":"", "email":"", "address":""},
 "supervising":[{"org":"", "title":"", "email":"", "address":""}],
 "cc":[{"org":"", "title":"", "email":"", "address":""}]
}

Rules:
- Use ONLY emails you are reasonably confident are official (.gov, .gov.ng, .org, .int, .europa.eu, .senate.gov, .house.gov, etc.).
- If unsure about an email, leave the email field empty.
- No placeholders, no invented fake domains.
- No markdown, no comments – JSON only.`,
        },
        {
          role: "user",
          content:
            "Complaint:\n" +
            description +
            "\nReturn ONLY JSON, no markdown.",
        },
      ],
    });

    const txt = resp.choices?.[0]?.message?.content || "{}";
    const data = JSON.parse(txt);

    function clean(o) {
      if (!o || !o.org) return null;
      return {
        org: String(o.org).trim(),
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
        if (c && !ccList.some((e) => e.org === c.org)) ccList.push(c);
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
    console.log("Hybrid routing: electricity rule fired.");
    return e;
  }

  // 2. International escalation rule
  const intl = detectInternational(description);
  if (intl) {
    console.log("Hybrid routing: international/atrocity rule fired.");
    return intl;
  }

  // 3. AI detection for everything else
  const ai = await aiDetect(description);
  console.log("Hybrid routing: AI routing result:", ai);
  return ai;
}

// --------------------------------------------------------------
// PETITION BUILDERS
// --------------------------------------------------------------
async function buildPetition(complainant, inst, petitionId) {
  const { fullName, email, phone, address, description } = complainant;
  if (!openai) return fallbackPetition(complainant, inst, petitionId);

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
    `Petition ID: ${petitionId}`,
    today,
  ]
    .filter(Boolean)
    .join("\n");

  const ccText =
    inst.ccList
      ?.map((c) => `${c.org}\n${c.address || ""}`)
      .join("\n\n") || "None";

  const systemPrompt = `
You are an expert Nigerian and international human-rights petition drafting lawyer.
Write a VERY STRONG, highly formal petition.
No placeholders.
Use only provided details.
Tone: firm, legal, respectful, authoritative.
Include the Petition ID in the subject or near the top so it can be tracked.
`;

  const userPrompt = `
${header}

${inst.primary?.title || ""}
${inst.primary?.org || ""}
${inst.primary?.address || ""}

${inst.through?.org ? "Through:\n" + inst.through.org : ""}
${inst.through?.address || ""}

CC:
${ccText}

SUBJECT: Autogenerate a strong subject that reflects the complaint and mention Petition ID ${petitionId} in it.

Description:
${description}

Write a FULL petition with numbered reliefs and a clear closing.
Ensure it is suitable to be sent by email or printed as PDF.
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

    return (
      r.choices?.[0]?.message?.content ||
      fallbackPetition(complainant, inst, petitionId)
    );
  } catch (err) {
    console.error("AI petition error:", err);
    return fallbackPetition(complainant, inst, petitionId);
  }
}

// --------------------------------------------------------------
// FALLBACK PETITION
// --------------------------------------------------------------
function fallbackPetition(c, inst, petitionId) {
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
Petition ID: ${petitionId}
${today}

${inst.primary?.org || "The Appropriate Authority"}
${inst.primary?.address || ""}

Through:
${inst.through?.org || ""}

CC:
${inst.ccList?.map((x) => x.org).join("\n")}

Dear Sir/Madam,

RE: FORMAL COMPLAINT / PETITION (Petition ID: ${petitionId})

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

  const description = req.body.description || "";
  if (!description.trim())
    return res.status(200).json({
      petitionId: null,
      petitionText: "Please enter your complaint description.",
      primaryInstitution: null,
      throughInstitution: null,
      ccList: [],
    });

  const complainant = {
    fullName: req.body.fullName || "",
    email: req.body.email || "",
    phone: req.body.phone || "",
    address: req.body.address || "",
    description,
  };

  // Generate Petition ID
  const petitionId = createPetitionId();

  let inst = await detectHybrid(description);
  inst = applyWatchdogs(description, inst);
  inst.ccList = inst.ccList?.filter((c) => c && c.org) || [];

  const petitionText = await buildPetition(complainant, inst, petitionId);

  res.status(200).json({
    petitionId,
    petitionText,
    primaryInstitution: inst.primary,
    throughInstitution: inst.through,
    ccList: inst.ccList,
  });
});

// --------------------------------------------------------------
// START SERVER
// --------------------------------------------------------------
app.listen(PORT, "0.0.0.0", () =>
  console.log(`JusticeBot A9 Backend running on ${PORT}`)
);

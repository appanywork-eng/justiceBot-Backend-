/**
 * PetitionDesk / JusticeBot Backend (A7 – World Brain Routing)
 * Express + OpenAI + AI institution detection + PCC/NHRC watchdogs
 */

const express = require("express");
const cors = require("cors");
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

// --------------------------------------------------------------
// LOAD institutions.json (still used for electricity, etc.)
// --------------------------------------------------------------
let INSTITUTIONS_JSON = {};
try {
  const filePath = path.join(__dirname, "data", "institutions.json");
  const raw = fs.readFileSync(filePath, "utf8");
  INSTITUTIONS_JSON = JSON.parse(raw);
  console.log("A7 institutions loaded successfully");
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
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    console.log("OpenAI client initialised");
  } catch (err) {
    console.error("Error initialising OpenAI client:", err);
    openai = null;
  }
} else {
  console.log("OPENAI_API_KEY not set; using fallback petition builder only.");
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
app.get("/", (req, res) => {
  res.send("JusticeBot A7 World Brain Backend is running 💡");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

app.get("/test", (req, res) => {
  res.json({
    status: "ok",
    message: "Test endpoint working",
    openai_status: openai ? "ready" : "not_initialized",
  });
});

// --------------------------------------------------------------
// HELPERS
// --------------------------------------------------------------
function textIncludesAny(text, keywords) {
  const t = (text || "").toLowerCase();
  return keywords.some((kw) => t.includes(kw.toLowerCase()));
}

// -------- ELECTRICITY SPECIAL CASE (AEDC / NERC etc.) --------
function detectElectricity(description) {
  const d = (description || "").toLowerCase();
  const electricityKeywords = [
    "electricity",
    "disco",
    "aedc",
    "meter",
    "prepaid",
    "over billing",
    "overbilling",
    "power",
    "light",
    "billing",
    "token",
  ];

  if (!textIncludesAny(d, electricityKeywords)) {
    return null;
  }

  const list = Array.isArray(INSTITUTIONS_JSON.electricity)
    ? INSTITUTIONS_JSON.electricity
    : [];

  // Primary – try to pick AEDC if Abuja is mentioned, else generic_dis or first
  let primary = null;

  if (d.includes("abuja") || d.includes("gwarinpa") || d.includes("kubwa")) {
    primary = list.find((i) => i.key === "aedc") || null;
  }

  if (!primary) {
    primary =
      list.find((i) => i.key === "generic_dis") ||
      list[0] || {
        key: "generic_dis",
        org: "The Managing Director,\nElectricity Distribution Company",
        email: "",
      };
  }

  // Through – NERC (if present in JSON)
  const through =
    list.find((i) => i.key === "nerc") || {
      key: "nerc",
      org: "The Chairman,\nNigerian Electricity Regulatory Commission (NERC)",
      email: "",
    };

  // Extra CCs – e.g. Power Ministry, etc. if configured
  const ccList = list
    .filter(
      (i) =>
        i &&
        typeof i.org === "string" &&
        i.key &&
        !["aedc", "generic_dis", "nerc"].includes(i.key)
    )
    .map((i) => ({
      org: i.org,
      email: typeof i.email === "string" ? i.email : "",
      title: typeof i.title === "string" ? i.title : "",
      address: typeof i.address === "string" ? i.address : "",
    }));

  return { primary, through, ccList };
}

// -------- GLOBAL WATCHDOGS (PCC + NHRC) -----------------------
function applyGlobalWatchdogs(description, inst) {
  const result = inst || {};
  if (!Array.isArray(result.ccList)) result.ccList = [];

  const addCc = (orgObj) => {
    if (!orgObj || !orgObj.org) return;
    const exists = result.ccList.some(
      (c) =>
        c &&
        typeof c.org === "string" &&
        c.org.toLowerCase() === orgObj.org.toLowerCase()
    );
    if (!exists) result.ccList.push(orgObj);
  };

  // 1. PCC – ALWAYS CC for administrative injustice
  addCc({
    org: "Public Complaints Commission",
    email: "complaints@pcc.gov.ng,info@pcc.gov.ng",
    title: "The Honourable Chief Commissioner",
    address:
      "Public Complaints Commission,\n25 Aguiyi Ironsi Street,\nMaitama, Abuja, Nigeria.",
  });

  // 2. NHRC – ONLY for human-rights-related complaints
  const d = (description || "").toLowerCase();
  const humanRightsKeywords = [
    "human right",
    "human-right",
    "human rights",
    "police brutality",
    "brutality",
    "torture",
    "discrimination",
    "unlawful detention",
    "illegal detention",
    "extra judicial",
    "extrajudicial",
    "killing",
    "threat to life",
    "harassment",
    "sexual assault",
    "rape",
    "domestic violence",
    "violence",
    "child abuse",
    "degrading treatment",
    "oppression",
  ];
  const isHR = humanRightsKeywords.some((kw) => d.includes(kw));
  if (isHR) {
    addCc({
      org: "National Human Rights Commission",
      email: "info@nhrc.gov.ng",
      title: "The Executive Secretary",
      address:
        "National Human Rights Commission,\n19 Aguiyi Ironsi Street,\nMaitama, Abuja, Nigeria.",
    });
  }

  return result;
}

// --------------------------------------------------------------
// AI INSTITUTION DETECTION (WORLD-WIDE)
// --------------------------------------------------------------
async function aiDetectInstitutions(description) {
  if (!openai) {
    return { primary: null, through: null, ccList: [] };
  }

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            "You are an expert global complaints-routing and consumer-protection analyst.\n" +
            "Read a complaint and determine:\n" +
            "1) The most appropriate PRIMARY institution to address the main issue.\n" +
            "2) Any SUPERVISING or oversight institutions that the complaint should go THROUGH (for example CBN supervising banks, NCC supervising telecoms, NERC supervising electricity discos, etc.).\n" +
            "3) Any additional bodies that should be copied (CC), such as ombudsman, consumer council, parliament committees, anti-corruption agencies, etc.\n" +
            "Return ONLY valid JSON. No markdown, no comments.\n" +
            '{\n' +
            '  "primary": { "org": string, "title": string, "email": string, "address": string },\n' +
            '  "supervising": [ { "org": string, "title": string, "email": string, "address": string } ],\n' +
            '  "cc": [ { "org": string, "title": string, "email": string, "address": string } ]\n' +
            "}\n\n" +
            "When possible, infer the official or most likely email address from your knowledge of government or regulator domains.\n" +
            "If you are not sure of an exact email, leave the email field as an empty string.\n" +
            "NEVER use fake placeholder text like [Email Address] or [Commission Address].\n" +
            "For Nigerian complaints, lean towards the correct Nigerian regulators and institutions.\n" +
            "For bank complaints in Nigeria, consider CBN Consumer Protection Department and other relevant bodies.\n",
        },
        {
          role: "user",
          content:
            "Complaint text:\n" +
            description +
            "\n\nReturn ONLY the JSON object with primary, supervising and cc. No backticks, no extra text.",
        },
      ],
    });

    const text = resp.choices?.[0]?.message?.content || "";
    let data = null;
    try {
      data = JSON.parse(text);
    } catch (err) {
      console.error("Failed to parse AI institutions JSON:", text, err);
      return { primary: null, through: null, ccList: [] };
    }

    const normalizeOrg = (o) => {
      if (!o || typeof o.org !== "string" || !o.org.trim()) {
        return null;
      }
      return {
        org: o.org.trim(),
        title:
          typeof o.title === "string" && o.title.trim() ? o.title.trim() : "",
        email:
          typeof o.email === "string" && o.email.trim() ? o.email.trim() : "",
        address:
          typeof o.address === "string" && o.address.trim()
            ? o.address.trim()
            : "",
      };
    };

    const primary = normalizeOrg(data.primary);
    let through = null;

    if (Array.isArray(data.supervising) && data.supervising.length > 0) {
      through = normalizeOrg(data.supervising[0]);
    }

    const ccList = [];
    if (Array.isArray(data.supervising)) {
      for (let i = 1; i < data.supervising.length; i++) {
        const s = normalizeOrg(data.supervising[i]);
        if (s) ccList.push(s);
      }
    }

    if (Array.isArray(data.cc)) {
      for (const c of data.cc) {
        const norm = normalizeOrg(c);
        if (!norm) continue;
        const exists = ccList.some(
          (x) => x.org.toLowerCase() === norm.org.toLowerCase()
        );
        if (!exists) ccList.push(norm);
      }
    }

    return { primary, through, ccList };
  } catch (err) {
    console.error("Error in AI institution detection:", err);
    return { primary: null, through: null, ccList: [] };
  }
}

// -------- HYBRID DETECTION: ELECTRICITY FIRST, THEN AI --------
async function detectInstitutionsHybrid(description) {
  // 1. Hard-coded electricity rule (AEDC / NERC etc.)
  const elec = detectElectricity(description);
  if (elec) {
    console.log("Detected electricity complaint via rule-based logic.");
    return elec;
  }

  // 2. Generic AI routing for everything else
  const aiInst = await aiDetectInstitutions(description);
  console.log("AI institution routing result:", aiInst);
  return aiInst;
}

// --------------------------------------------------------------
// PETITION BUILDERS
// --------------------------------------------------------------

// Strong AI petition writer (OpenAI)
async function buildPetitionWithOpenAI(complainant, inst) {
  const { fullName, email, phone, address, description } = complainant;

  if (!openai) {
    return buildFallbackPetition(complainant, inst);
  }

  const today = new Date().toLocaleDateString("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const detailsLines = [];
  if (fullName) detailsLines.push(fullName);
  if (address) detailsLines.push(address);
  if (email) detailsLines.push(`Email: ${email}`);
  if (phone) detailsLines.push(`Phone: ${phone}`);
  detailsLines.push(today);

  const complainantBlock =
    detailsLines.length > 0
      ? detailsLines.join("\n")
      : "Use the complainant's real details as provided above.";

  const primaryOrg = inst.primary?.org || "";
  const primaryTitle = inst.primary?.title || "";
  const primaryAddress = inst.primary?.address || "";

  const throughOrg = inst.through?.org || "";
  const throughTitle = inst.through?.title || "";
  const throughAddress = inst.through?.address || "";

  const ccOrgList =
    Array.isArray(inst.ccList) && inst.ccList.length > 0
      ? inst.ccList.map((c) => c.org).join("; ")
      : "";

  const ccBlock =
    Array.isArray(inst.ccList) && inst.ccList.length > 0
      ? inst.ccList
          .map((c) => {
            const parts = [c.org];
            if (c.address) parts.push(c.address);
            return parts.join("\n");
          })
          .join("\n\n")
      : "";

  const routingSummary = [
    primaryOrg ? `Primary institution: ${primaryOrg}` : "",
    throughOrg ? `Through institution: ${throughOrg}` : "",
    ccOrgList ? `CC institutions: ${ccOrgList}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const systemPrompt = `
You are an expert Nigerian petition-drafting lawyer.
Write very strong, formal petitions suitable for regulators, banks, telecoms, electricity discos, law-enforcement, and government agencies.

Obey these STRICT rules:

1. Use only the REAL complainant details and institutions provided.
2. NEVER use placeholder text like [Your Name], [Your Address], [Bank Address], [Commission Address], etc.
   If you don't know an address, simply omit that address line instead of using placeholders.
3. At the top, write the complainant's details (name, address if available, email, phone, date).
4. Then write the full address and title of the PRIMARY institution, and if applicable, a "Through:" line for the supervising institution.
5. After that, add a "CC:" section listing other institutions.
6. Then write the petition body:
   - Opening: clearly state the subject (e.g. "RE: COMPLAINT ABOUT ...")
   - First paragraph: who the complainant is and the purpose of the petition.
   - Middle paragraphs: clear narrative of events, dates, amounts, account numbers, what has been done so far, and impact on the complainant.
   - Next paragraph: legal or regulatory basis (for example, CBN Consumer Protection Framework, NCC regulations, NERC rules, NDPC Act, etc.) ONLY when relevant.
   - Reliefs: a numbered list of what the complainant wants (refunds, investigation, cessation of abuse, sanctions, etc.).
   - Closing: firm but respectful closing paragraph.
7. End with "Yours faithfully," then the complainant's name, phone and email.
8. The tone must be firm, respectful, professional and precise. Avoid slang or emotional outbursts.
9. Output MUST be single plain text that can be printed or saved as PDF. Use clean paragraph spacing and numbered reliefs.
`;

  const userPrompt = `
Complainant details (to appear at the top of the letter exactly as provided):

${complainantBlock}

Primary institution block:
${primaryTitle ? primaryTitle + "\n" : ""}${primaryOrg}
${primaryAddress || ""}

Through institution block (if any):
${throughOrg ? (throughTitle ? throughTitle + "\n" : "") + throughOrg : ""}
${throughAddress || ""}

CC institutions block (if any):
${ccBlock || "None"}

Complaint description (complainant's story – summarise but keep facts accurate):
${description}

Write a full, formal petition letter following all the rules above. Do NOT add any placeholders in square brackets. Use only information you have been given or you can reasonably infer. Do not invent new facts.`;

  try {
    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const petitionText =
      ai.choices?.[0]?.message?.content ||
      `Petition Draft:\n\n${description}`;

    return petitionText;
  } catch (err) {
    console.error("OpenAI error while building petition:", err);
    // Fallback to simple builder if AI fails
    return buildFallbackPetition(complainant, inst);
  }
}

// Simple fallback if OpenAI fails or key is missing
function buildFallbackPetition(complainant, inst) {
  const { fullName, email, phone, address, description } = complainant;

  const today = new Date().toLocaleDateString("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const primaryOrg = inst.primary?.org || "The Appropriate Authority,\nNigeria.";
  const throughOrg = inst.through?.org || "";
  const ccLines =
    Array.isArray(inst.ccList) && inst.ccList.length
      ? inst.ccList.map((c) => c.org).join("\n")
      : "";

  const headerLines = [];
  if (fullName) headerLines.push(fullName);
  if (address) headerLines.push(address);
  if (email) headerLines.push(`Email: ${email}`);
  if (phone) headerLines.push(`Phone: ${phone}`);
  headerLines.push(today);

  let text = "";
  text += headerLines.join("\n") + "\n\n";
  text += primaryOrg + "\n\n";
  if (throughOrg) {
    text += "Through:\n" + throughOrg + "\n\n";
  }
  if (ccLines) {
    text += "CC:\n" + ccLines + "\n\n";
  }

  text += "Dear Sir/Madam,\n\n";
  text += "RE: FORMAL COMPLAINT / PETITION\n\n";
  text +=
    "I am writing to formally lodge a complaint regarding the matter described below:\n\n";
  text += description + "\n\n";
  text +=
    "I respectfully request that your good office investigate this complaint, stop any ongoing unfair treatment, and take appropriate steps to remedy the situation.\n\n";
  text +=
    "Yours faithfully,\n\n" +
    (fullName || "The Complainant") +
    (phone ? `\n${phone}` : "") +
    (email ? `\n${email}` : "") +
    "\n";

  return text;
}

// --------------------------------------------------------------
// POST: GENERATE PETITION (HYBRID)
// --------------------------------------------------------------
app.post("/generate-petition", async (req, res) => {
  console.log("Incoming /generate-petition:", req.body);

  // 1 – safely read description
  let description = "";
  try {
    if (req.body && typeof req.body.description === "string") {
      description = req.body.description;
    }
  } catch (err) {
    console.error("Error reading description from body:", err);
  }

  if (!description.trim()) {
    return res.status(200).json({
      petitionText: "Please enter your complaint description in detail.",
      primaryInstitution: null,
      throughInstitution: null,
      ccList: [],
      error: "Description is required.",
    });
  }

  // 1b – read user details (REAL data)
  let fullName = "";
  let email = "";
  let phone = "";
  let address = "";
  try {
    if (typeof req.body.fullName === "string") fullName = req.body.fullName;
    if (typeof req.body.email === "string") email = req.body.email;
    if (typeof req.body.phone === "string") phone = req.body.phone;
    if (typeof req.body.address === "string") address = req.body.address;
  } catch (err) {
    console.error("Error reading extra fields from body:", err);
  }

  // 2 – detect institutions (hybrid AI + electricity) and apply watchdogs
  let inst = { primary: null, through: null, ccList: [] };
  try {
    inst = await detectInstitutionsHybrid(description);
  } catch (err) {
    console.error("Error in hybrid institution detection:", err);
    inst = { primary: null, through: null, ccList: [] };
  }

  inst = applyGlobalWatchdogs(description, inst);

  // Ensure ccList has no null/empty entries (avoid empty cc objects)
  if (!Array.isArray(inst.ccList)) inst.ccList = [];
  inst.ccList = inst.ccList.filter(
    (c) => c && typeof c.org === "string" && c.org.trim()
  );

  // 3 – generate petition (OpenAI or fallback)
  const complainant = { fullName, email, phone, address, description };
  let petitionText = "";

  try {
    petitionText = await buildPetitionWithOpenAI(complainant, inst);
  } catch (err) {
    console.error("Error during AI petition building:", err);
    petitionText = buildFallbackPetition(complainant, inst);
  }

  // 4 – always respond safely
  try {
    return res.status(200).json({
      petitionText,
      primaryInstitution: inst.primary || null,
      throughInstitution: inst.through || null,
      ccList: Array.isArray(inst.ccList) ? inst.ccList : [],
    });
  } catch (err) {
    console.error("Error sending final JSON:", err);
    return res.status(200).json({
      petitionText,
      primaryInstitution: null,
      throughInstitution: null,
      ccList: [],
    });
  }
});

// --------------------------------------------------------------
// START SERVER
// --------------------------------------------------------------
app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `JusticeBot A7 World Brain Backend running on port ${PORT} (PetitionDesk mode)`
  );
});

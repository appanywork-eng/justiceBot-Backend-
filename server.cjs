/**
 * PetitionDesk / JusticeBot Backend (A9 – Human Rights Mode)
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
  console.log("A9 institutions loaded successfully");
} catch (err) {
  console.error("Failed to load institutions.json:", err.message);
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
app.get("/", (req, res) => res.send("JusticeBot A9 Backend (Human Rights Mode) is running 💡"));
app.get("/health", (req, res) =>
  res.json({
    status: "ok",
    time: new Date().toISOString(),
    openai_status: openai ? "ready" : "not_initialized",
  })
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
// HUMAN RIGHTS CLASSIFICATION (A9)
// --------------------------------------------------------------
function isHumanRightsCase(description) {
  const d = safeLower(description);
  const hrKeywords = [
    "human right",
    "human-right",
    "rights violation",
    "police brutality",
    "torture",
    "ill treatment",
    "ill-treatment",
    "inhuman treatment",
    "degrading treatment",
    "unlawful detention",
    "illegal detention",
    "detained",
    "in custody",
    "cell",
    "awaiting trial",
    "extra judicial",
    "extrajudicial",
    "execution",
    "killing",
    "shot",
    "murdered",
    "enforced disappearance",
    "disappeared",
    "genocide",
    "ethnic cleansing",
    "faith-based attack",
    "religious persecution",
    "minority community",
    "massacre"
  ];
  return hrKeywords.some((kw) => d.includes(kw));
}

/**
 * Return:
 * {
 *   typeId: "UNLAWFUL_DETENTION" | "POLICE_BRUTALITY" | "MASS_ATROCITY" | "GENERAL_HR",
 *   subject: string,
 *   legalPoints: string
 * }
 */
function classifyHumanRightsCase(description) {
  const d = safeLower(description);

  // Unlawful detention / prolonged custody / no trial
  const detentionTriggers = [
    "unlawful detention",
    "illegal detention",
    "detained",
    "in custody",
    "police cell",
    "cell",
    "awaiting trial",
    "over 24 hours",
    "over 48 hours",
    "no trial",
    "no court",
    "no charge"
  ];

  // Brutality / torture / physical abuse
  const brutalityTriggers = [
    "police brutality",
    "brutality",
    "torture",
    "beaten",
    "beating",
    "flogged",
    "slapped",
    "shot",
    "gun",
    "tear gas",
    "extortion at gunpoint",
    "sexual assault",
    "rape"
  ];

  // Mass atrocity / genocide / faith-ethnic targeting
  const massAtrocityTriggers = [
    "genocide",
    "ethnic cleansing",
    "faith genocide",
    "religious genocide",
    "massacre",
    "mass killings",
    "thousands displaced",
    "mass displacement",
    "minority community",
    "targeted attacks",
    "community wiped out"
  ];

  let typeId = "GENERAL_HR";
  let subject = "PETITION ON HUMAN RIGHTS VIOLATIONS AND ABUSE OF DUE PROCESS";
  let legalPoints = `
- 1999 Constitution of the Federal Republic of Nigeria (as amended), particularly:
  - Section 34: Right to dignity of the human person (prohibition of torture, inhuman or degrading treatment).
  - Section 35: Right to personal liberty (no arbitrary or prolonged detention).
  - Section 36: Right to fair hearing.
- African Charter on Human and Peoples’ Rights (ratified and domesticated in Nigeria).
- International Covenant on Civil and Political Rights (ICCPR).
`;

  if (massAtrocityTriggers.some((x) => d.includes(x))) {
    typeId = "MASS_ATROCITY";
    subject = "PETITION ON SYSTEMATIC ATTACKS, MASS ATROCITIES AND POSSIBLE GENOCIDAL VIOLATIONS OF HUMAN RIGHTS";
    legalPoints = `
- 1999 Constitution of the Federal Republic of Nigeria (as amended), especially:
  - Section 33: Right to life.
  - Section 34: Right to dignity of the human person.
  - Section 38: Freedom of thought, conscience and religion.
- African Charter on Human and Peoples’ Rights (right to life, dignity, freedom from discrimination).
- International Covenant on Civil and Political Rights (ICCPR).
- Convention on the Prevention and Punishment of the Crime of Genocide (Genocide Convention).
- Responsibility of the State to prevent, investigate and punish large-scale attacks on civilians.
`;
  } else if (detentionTriggers.some((x) => d.includes(x))) {
    typeId = "UNLAWFUL_DETENTION";
    subject = "PETITION AGAINST UNLAWFUL DETENTION AND VIOLATION OF RIGHT TO PERSONAL LIBERTY";
    legalPoints = `
- Section 35 of the 1999 Constitution of the Federal Republic of Nigeria: Right to personal liberty and requirement to bring an arrested person before a court within a reasonable time.
- Section 36: Right to fair hearing within a reasonable time.
- Section 34: Prohibition of torture, inhuman or degrading treatment.
- Administration of Criminal Justice Act (ACJA) 2015: safeguards on arrest, remand and trial timelines.
- African Charter on Human and Peoples’ Rights and the ICCPR, guaranteeing liberty and protection against arbitrary detention.
`;
  } else if (brutalityTriggers.some((x) => d.includes(x))) {
    typeId = "POLICE_BRUTALITY";
    subject = "PETITION ON POLICE BRUTALITY, TORTURE AND VIOLATION OF FUNDAMENTAL RIGHTS";
    legalPoints = `
- Section 34 of the 1999 Constitution of the Federal Republic of Nigeria: Right to dignity of human person and prohibition of torture or inhuman or degrading treatment.
- Section 35 and 36: Rights to liberty and fair hearing.
- Anti-Torture Act 2017 (Nigeria): prohibition and criminalisation of torture.
- African Charter on Human and Peoples’ Rights and the ICCPR: prohibition of torture, cruel, inhuman or degrading treatment.
`;
  }

  return { typeId, subject, legalPoints: legalPoints.trim() };
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
    "prepaid"
  ];
  if (!textIncludesAny(d, k)) return null;

  const list = Array.isArray(INSTITUTIONS_JSON.electricity)
    ? INSTITUTIONS_JSON.electricity
    : [];

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
        address: "",
        title: ""
      };
  }

  const through =
    list.find((i) => i.key === "nerc") || {
      key: "nerc",
      org: "The Chairman,\nNigerian Electricity Regulatory Commission (NERC)",
      email: "",
      address: "",
      title: ""
    };

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
      address: typeof i.address === "string" ? i.address : ""
    }));

  return { primary, through, ccList };
}

// --------------------------------------------------------------
// GLOBAL WATCHDOGS (PCC + NHRC)
// --------------------------------------------------------------
function applyWatchdogs(description, inst) {
  const out = inst || {};
  if (!Array.isArray(out.ccList)) out.ccList = [];

  function add(orgObj) {
    if (!orgObj || !orgObj.org) return;
    const exists = out.ccList.some(
      (c) =>
        c &&
        typeof c.org === "string" &&
        c.org.toLowerCase() === orgObj.org.toLowerCase()
    );
    if (!exists) out.ccList.push(orgObj);
  }

  // PCC – ALWAYS CC
  add({
    org: "Public Complaints Commission",
    email: "complaints@pcc.gov.ng,info@pcc.gov.ng",
    title: "The Honourable Chief Commissioner",
    address:
      "Public Complaints Commission,\n25 Aguiyi Ironsi Street,\nMaitama, Abuja, Nigeria."
  });

  // NHRC – ONLY if clearly human-rights related
  if (isHumanRightsCase(description)) {
    add({
      org: "National Human Rights Commission",
      email: "info@nhrc.gov.ng",
      title: "The Executive Secretary",
      address:
        "National Human Rights Commission,\n19 Aguiyi Ironsi Street,\nMaitama, Abuja, Nigeria."
    });
  }

  return out;
}

// --------------------------------------------------------------
// INTERNATIONAL ROUTING (Mass atrocities / genocide)
// --------------------------------------------------------------
function detectInternational(description) {
  const d = safeLower(description);
  const triggers = [
    "genocide",
    "ethnic cleansing",
    "faith genocide",
    "religious genocide",
    "massacre",
    "mass killings",
    "mass displacement",
    "minority community",
    "systematic attacks",
    "crimes against humanity",
    "atrocities",
    "ethno-religious"
  ];

  if (!textIncludesAny(d, triggers)) return null;

  const intlBlock = INSTITUTIONS_JSON.international || {};

  const ccList = Object.values(intlBlock).map((i) => ({
    org: i.name || i.org || "",
    email: i.email || "",
    address: i.address || "",
    title: i.title || ""
  })).filter((x) => x.org);

  const usHouse = intlBlock.us_congress_house || intlBlock.us_congress || {};
  const primary = {
    org: usHouse.name || usHouse.org || "United States Congress",
    email: usHouse.email || "",
    address: usHouse.address || "Washington, D.C., USA",
    title: usHouse.title || ""
  };

  const through = {
    org: "Federal Ministry of Justice",
    email: "info@justice.gov.ng",
    address: "Federal Secretariat, Phase II, Abuja, Nigeria.",
    title: "Attorney General of the Federation"
  };

  return { primary, through, ccList };
}

// --------------------------------------------------------------
// AI INSTITUTION DETECTION (Fallback world brain)
// --------------------------------------------------------------
async function aiDetectInstitutions(description) {
  if (!openai) return { primary: null, through: null, ccList: [] };

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
            "2) Any SUPERVISING or oversight institutions that the complaint should go THROUGH.\n" +
            "3) Any additional bodies that should be copied (CC), such as ombudsman, consumer council, parliament committees, anti-corruption agencies, etc.\n" +
            "Return ONLY valid JSON (no markdown, no comments):\n" +
            '{\n' +
            '  "primary": { "org": string, "title": string, "email": string, "address": string },\n' +
            '  "supervising": [ { "org": string, "title": string, "email": string, "address": string } ],\n' +
            '  "cc": [ { "org": string, "title": string, "email": string, "address": string } ]\n' +
            "}\n\n" +
            "EMAIL RULES:\n" +
            "- Use only realistic official emails based on your training from official websites and trusted public sources.\n" +
            '- Prefer \".gov\", \".gov.ng\", \".org\", \".int\" and official institutional domains (cbn.gov.ng, nerc.gov.ng, ncc.gov.ng, pcc.gov.ng, nhrc.gov.ng, etc.).\n' +
            "- Avoid generic free-email providers for institutions unless you are confident.\n" +
            "- If less than 80% sure of an email, leave the email field as an empty string.\n" +
            "- Never use placeholders like [Email Address] or fake domains.\n" +
            "For Nigerian cases, lean towards the correct Nigerian regulators and ombudsman institutions."
        },
        {
          role: "user",
          content:
            "Complaint text:\n" +
            description +
            "\n\nReturn ONLY the JSON object with primary, supervising and cc. No backticks, no extra text."
        }
      ]
    });

    const text = resp.choices?.[0]?.message?.content || "{}";
    let data = {};
    try {
      data = JSON.parse(text);
    } catch (err) {
      console.error("Failed to parse AI institutions JSON:", text, err.message);
      return { primary: null, through: null, ccList: [] };
    }

    const normalizeOrg = (o) => {
      if (!o || typeof o.org !== "string" || !o.org.trim()) return null;
      return {
        org: o.org.trim(),
        title: typeof o.title === "string" ? o.title.trim() : "",
        email: typeof o.email === "string" ? o.email.trim() : "",
        address: typeof o.address === "string" ? o.address.trim() : ""
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

// --------------------------------------------------------------
// HUMAN RIGHTS ROUTING (Domestic) – A9
// --------------------------------------------------------------
function detectHumanRightsRouting(description) {
  const hrMeta = classifyHumanRightsCase(description);
  const d = safeLower(description);

  const hrBlock = INSTITUTIONS_JSON.human_rights || {};
  const national = INSTITUTIONS_JSON.national || {};

  // Base institutions (fallbacks if JSON missing)
  const NHRC_JSON = hrBlock.nhrc || national.nhrc || {};
  const PCC_JSON = hrBlock.pcc || national.pcc || {};
  const IGP_JSON = hrBlock.igp || national.igp || {};
  const NBA_JSON = hrBlock.nba || {};

  const NHRC = {
    org: NHRC_JSON.org || "National Human Rights Commission",
    email: NHRC_JSON.email || "info@nhrc.gov.ng",
    address: NHRC_JSON.address || "19 Aguiyi Ironsi Street, Maitama, Abuja, Nigeria.",
    title: NHRC_JSON.title || "The Executive Secretary"
  };

  const PCC = {
    org: PCC_JSON.org || "Public Complaints Commission",
    email: PCC_JSON.email || "complaints@pcc.gov.ng,info@pcc.gov.ng",
    address: PCC_JSON.address || "25 Aguiyi Ironsi Street, Maitama, Abuja, Nigeria.",
    title: PCC_JSON.title || "The Honourable Chief Commissioner"
  };

  const IGP = {
    org: IGP_JSON.org || "Inspector General of Police, Nigerian Police Force",
    email: IGP_JSON.email || "",
    address: IGP_JSON.address || "Louis Edet House, Force Headquarters, Abuja, Nigeria.",
    title: IGP_JSON.title || "Inspector General of Police"
  };

  const NBA = {
    org: NBA_JSON.org || "Nigerian Bar Association (NBA)",
    email: NBA_JSON.email || "",
    address: NBA_JSON.address || "NBA House, 4 Ladi Kwali Street, Wuse, Abuja, Nigeria.",
    title: NBA_JSON.title || ""
  };

  let primary = NHRC;
  let through = null;
  const ccList = [];

  if (hrMeta.typeId === "UNLAWFUL_DETENTION" || hrMeta.typeId === "POLICE_BRUTALITY") {
    // For police-driven human rights cases, focus on IGP + NHRC
    primary = IGP;
    through = NHRC;
    ccList.push(PCC, NBA);
  } else if (hrMeta.typeId === "MASS_ATROCITY") {
    // For big atrocity / genocide patterns, primary = NHRC, others CC; international layer is added separately by detectInternational
    primary = NHRC;
    through = null;
    ccList.push(PCC, NBA);
  } else {
    // Generic human rights case
    primary = NHRC;
    through = null;
    ccList.push(PCC, NBA);
  }

  // Ensure no null / duplicate orgs
  const seen = new Set();
  const cleanCc = [];
  for (const c of ccList) {
    if (!c || !c.org) continue;
    const key = c.org.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleanCc.push(c);
  }

  return { primary, through, ccList: cleanCc, hrMeta };
}

// --------------------------------------------------------------
// HYBRID INSTITUTION DETECTION (A9)
// --------------------------------------------------------------
async function detectHybrid(description) {
  // 1. Electricity rule
  const e = detectElectricity(description);
  if (e) {
    console.log("[A9] Electricity complaint detected (rule-based).");
    return { ...e, hrMeta: null };
  }

  // 2. International mass-atrocity escalation (US Congress as primary)
  const intl = detectInternational(description);
  if (intl) {
    console.log("[A9] International escalation detected (mass atrocities).");
    // hrMeta still useful to guide petition style
    const hrMeta = isHumanRightsCase(description)
      ? classifyHumanRightsCase(description)
      : null;
    return { ...intl, hrMeta };
  }

  // 3. Human Rights Mode (domestic routing)
  if (isHumanRightsCase(description)) {
    console.log("[A9] Human Rights Mode activated (domestic routing).");
    return detectHumanRightsRouting(description);
  }

  // 4. Generic AI routing
  const ai = await aiDetectInstitutions(description);
  console.log("[A9] AI-based routing result:", ai);
  return { ...ai, hrMeta: null };
}

// --------------------------------------------------------------
// PETITION BUILDERS (A9)
// --------------------------------------------------------------
async function buildPetition(complainant, inst) {
  const { fullName, email, phone, address, description } = complainant;

  if (!openai) {
    return fallbackPetition(complainant, inst);
  }

  const today = new Date().toLocaleDateString("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });

  const headerLines = [];
  if (fullName) headerLines.push(fullName);
  if (address) headerLines.push(address);
  if (email) headerLines.push(`Email: ${email}`);
  if (phone) headerLines.push(`Phone: ${phone}`);
  headerLines.push(today);
  const header = headerLines.join("\n");

  const primary = inst.primary || {};
  const through = inst.through || null;
  const ccList = Array.isArray(inst.ccList) ? inst.ccList : [];

  const ccText = ccList
    .map((c) => {
      const parts = [];
      if (c.title) parts.push(c.title);
      if (c.org) parts.push(c.org);
      if (c.address) parts.push(c.address);
      return parts.join("\n");
    })
    .join("\n\n") || "None";

  const hrMeta = inst.hrMeta || (isHumanRightsCase(description) ? classifyHumanRightsCase(description) : null);

  const subjectLine = hrMeta
    ? `RE: ${hrMeta.subject}`
    : "RE: FORMAL COMPLAINT / PETITION";

  const legalContextBlock = hrMeta
    ? `
LEGAL CONTEXT (you must integrate this naturally in the petition – do not copy as a raw bullet list):
${hrMeta.legalPoints}
`.trim()
    : "";

  const routingSummaryParts = [];
  if (primary.org) routingSummaryParts.push(`Primary: ${primary.org}`);
  if (through && through.org) routingSummaryParts.push(`Through: ${through.org}`);
  if (ccList.length) {
    routingSummaryParts.push(
      "CC: " +
        ccList
          .filter((c) => c && c.org)
          .map((c) => c.org)
          .join("; ")
    );
  }
  const routingSummary = routingSummaryParts.join(" | ") || "N/A";

  const systemPrompt = `
You are a senior human-rights and public-interest litigation lawyer (Nigerian + international standard).

Your job:
- Draft VERY STRONG, highly structured petitions that can go to police, regulators, ombudsman, human-rights commissions, parliaments and international bodies.
- Use ONLY the real complainant details and institutions provided.
- NEVER use placeholders like [Your Name], [Address], [Bank Name]. If information is missing, simply omit that line.

STRUCTURE RULES:
1) Top of letter: complainant details (name, address if available, email, phone, date).
2) Primary institution block (full title, organisation and address).
3) "Through:" block if a through institution exists.
4) "CC:" block listing each copied institution on its own line (title + org + address where available).
5) Clear SUBJECT line starting with "RE:" that reflects the nature of the complaint.
6) Opening paragraph:
   - Introduce the complainant.
   - State clearly the purpose of the petition and the core violation (e.g. unlawful detention, brutality, genocide risk, etc.).
7) Facts section:
   - Set out events in chronological order.
   - Include dates, locations, actors, amounts and any prior steps taken (reports, complaints) – but do NOT invent new facts.
8) Legal / human-rights basis:
   - Use the LEGAL CONTEXT block if provided.
   - Refer to the Nigerian Constitution, ACJA, Anti-Torture Act, African Charter, ICCPR, Genocide Convention, etc., ONLY to the extent they are relevant.
   - Explain briefly how the facts violate these norms.
9) Reliefs sought:
   - Numbered list (1., 2., 3., ...) with clear, realistic remedies: investigation, release, prosecution of offenders, compensation, protection measures, policy review, etc.
10) Closing paragraph:
   - Firm but respectful.
   - Emphasise urgency, risk of irreparable harm, and the importance of state compliance with human-rights obligations.
11) Closing:
   - "Yours faithfully,"
   - Complainant’s name, phone and email.
12) Tone:
   - Firm, professional, rights-based, not abusive and not emotional ranting.
   - The letter must be ready to file as a formal legal petition.

Output MUST be in plain text, with clean paragraphs and numbering. No markdown, no bullet symbols like "*". Use normal numbering (1., 2., 3.) and paragraph spacing.
`;

  const userPrompt = `
COMPLAINANT DETAILS (top of letter – use exactly as given):
${header}

PRIMARY INSTITUTION:
${primary.title || ""}${primary.title ? "\n" : ""}${primary.org || ""}
${primary.address || ""}

THROUGH INSTITUTION (if any):
${
  through && through.org
    ? (through.title ? through.title + "\n" : "") +
      through.org +
      (through.address ? "\n" + through.address : "")
    : "None"
}

CC INSTITUTIONS:
${ccText}

SUBJECT LINE (you MUST start your subject with "RE:"):
${subjectLine}

ROUTING SUMMARY (for your understanding only – DO NOT copy this section word-for-word):
${routingSummary}

${legalContextBlock ? "\n" + legalContextBlock + "\n" : ""}

COMPLAINT DESCRIPTION (raw story from user – organise it into facts):
${description}

Now write ONE full formal petition letter, following all the rules above. Do NOT add any placeholders in square brackets. Do NOT invent new facts; only organise and legally analyse what you have been given and what is reasonably implied.
`;

  try {
    const r = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.25,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    });

    const text = r.choices?.[0]?.message?.content || "";
    if (!text.trim()) {
      return fallbackPetition(complainant, inst);
    }
    return text.trim();
  } catch (err) {
    console.error("AI petition error:", err);
    return fallbackPetition(complainant, inst);
  }
}

// --------------------------------------------------------------
// FALLBACK PETITION (no AI or AI failure)
// --------------------------------------------------------------
function fallbackPetition(c, inst) {
  const today = new Date().toLocaleDateString("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });

  const primary = inst.primary || {};
  const through = inst.through || null;
  const ccList = Array.isArray(inst.ccList) ? inst.ccList : [];

  const header = [
    c.fullName || "",
    c.address || "",
    c.email ? "Email: " + c.email : "",
    c.phone ? "Phone: " + c.phone : "",
    today
  ]
    .filter(Boolean)
    .join("\n");

  const ccLines = ccList
    .map((x) => x.org)
    .filter(Boolean)
    .join("\n");

  return `
${header}

${primary.org || "The Appropriate Authority"}
${primary.address || ""}

${through && through.org ? "Through:\n" + through.org + "\n" + (through.address || "") + "\n" : ""}

${ccLines ? "CC:\n" + ccLines + "\n" : ""}

Dear Sir/Madam,

RE: FORMAL COMPLAINT / PETITION

${c.description || ""}

I respectfully request your urgent investigation and appropriate remedial action.

Yours faithfully,
${c.fullName || "The Complainant"}
${c.phone || ""}
${c.email || ""}
`.trim();
}

// --------------------------------------------------------------
// POST: GENERATE PETITION
// --------------------------------------------------------------
app.post("/generate-petition", async (req, res) => {
  console.log("Incoming /generate-petition:", req.body);

  const description =
    typeof req.body.description === "string" ? req.body.description : "";

  if (!description.trim()) {
    return res.status(200).json({
      petitionText: "Please enter your complaint description.",
      primaryInstitution: null,
      throughInstitution: null,
      ccList: [],
      error: "Description is required."
    });
  }

  const complainant = {
    fullName: typeof req.body.fullName === "string" ? req.body.fullName : "",
    email: typeof req.body.email === "string" ? req.body.email : "",
    phone: typeof req.body.phone === "string" ? req.body.phone : "",
    address: typeof req.body.address === "string" ? req.body.address : "",
    description
  };

  let inst = { primary: null, through: null, ccList: [], hrMeta: null };

  try {
    inst = await detectHybrid(description);
  } catch (err) {
    console.error("Error in hybrid institution detection:", err);
    inst = { primary: null, through: null, ccList: [], hrMeta: null };
  }

  inst = applyWatchdogs(description, inst);

  if (!Array.isArray(inst.ccList)) inst.ccList = [];
  inst.ccList = inst.ccList.filter(
    (c) => c && typeof c.org === "string" && c.org.trim()
  );

  let petitionText = "";
  try {
    petitionText = await buildPetition(complainant, inst);
  } catch (err) {
    console.error("Error during AI petition building:", err);
    petitionText = fallbackPetition(complainant, inst);
  }

  try {
    return res.status(200).json({
      petitionText,
      primaryInstitution: inst.primary || null,
      throughInstitution: inst.through || null,
      ccList: inst.ccList
    });
  } catch (err) {
    console.error("Error sending final JSON:", err);
    return res.status(200).json({
      petitionText,
      primaryInstitution: null,
      throughInstitution: null,
      ccList: []
    });
  }
});

// --------------------------------------------------------------
// START SERVER
// --------------------------------------------------------------
app.listen(PORT, "0.0.0.0", () =>
  console.log(`JusticeBot A9 Backend (Human Rights Mode) running on ${PORT}`)
);

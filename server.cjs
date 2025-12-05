/**
 * JusticeBot Backend (A4)
 * Express + OpenAI + Institution detection + PCC/NHRC watchdog CC
 */

const express = require("express");
const cors = require("cors");
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

// ----------------------------------------------------
// LOAD institutions.json
// ----------------------------------------------------
let INSTITUTIONS_JSON = {};
try {
  const filePath = path.join(__dirname, "data", "institutions.json");
  const raw = fs.readFileSync(filePath, "utf8");
  INSTITUTIONS_JSON = JSON.parse(raw);
  console.log("A1 institutions loaded successfully");
} catch (err) {
  console.error("Failed to load institutions.json:", err);
  INSTITUTIONS_JSON = {};
}

// ----------------------------------------------------
// OPENAI INIT (optional)
// ----------------------------------------------------
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
  console.log("OPENAI_API_KEY not set; using fallback petition text");
}

// ----------------------------------------------------
// EXPRESS INIT
// ----------------------------------------------------
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// ----------------------------------------------------
// BASIC ROUTES
// ----------------------------------------------------
app.get("/", (req, res) => {
  res.send("JusticeBot A4 Backend is running successfully.");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// Simple test route to confirm OpenAI status from browser
app.get("/test", (req, res) => {
  res.json({
    status: "ok",
    message: "Test endpoint working",
    openai_status: openai ? "ready" : "not_initialized",
  });
});

// ----------------------------------------------------
// HELPERS
// ----------------------------------------------------
function textIncludesAny(text, keywords) {
  const t = (text || "").toLowerCase();
  return keywords.some((kw) => t.includes(kw.toLowerCase()));
}

// ----------------------------------------------------
// RULE-BASED DETECTORS (fall-back logic)
// ----------------------------------------------------

// Electricity-specific institution detection (AEDC / NERC / etc.)
function detectElectricity(description) {
  const d = (description || "").toLowerCase();

  if (
    !textIncludesAny(d, [
      "electricity",
      "disco",
      "meter",
      "prepaid",
      "over billing",
      "overbilling",
      "power",
      "light",
      "light bill",
      "power supply",
    ])
  ) {
    return null;
  }

  // Primary – try AEDC or generic DISCO
  let primary =
    INSTITUTIONS_JSON.electricity?.find((i) => i.key === "aedc") || null;

  if (!primary) {
    primary = {
      key: "generic_dis",
      org:
        "The Managing Director,\n" +
        "[Electricity Distribution Company],\n" +
        "Nigeria.",
      email: "",
    };
  }

  // Through – NERC (regulator)
  const through =
    INSTITUTIONS_JSON.electricity?.find((i) => i.key === "nerc") || null;

  // CC list – any others configured in electricity category (e.g. power ministry)
  const powerMin =
    INSTITUTIONS_JSON.electricity?.find((i) => i.key === "power_ministry") ||
    null;

  const ccList = [powerMin].filter(Boolean);

  return { primary, through, ccList };
}

// Education / school complaints (very simple generic fall-back)
function detectEducation(description) {
  const d = (description || "").toLowerCase();

  const hasEdu = textIncludesAny(d, [
    "school",
    "teacher",
    "student",
    "pupil",
    "principal",
    "headmaster",
    "headmistress",
    "college",
    "secondary",
    "primary",
    "ubec",
    "subeb",
    "education board",
    "ubeb",
    "university",
    "polytechnic",
  ]);

  if (!hasEdu) return null;

  const primary =
    INSTITUTIONS_JSON.education?.find((i) => i.key === "school_authority") || {
      key: "school_authority",
      org:
        "The Head of School / Principal / Provost,\n" +
        "[Name of School / Institution],\n" +
        "[City / State], Nigeria.",
      email: "",
    };

  // Try FCT UBEB or generic education ministry from JSON if present
  const through =
    INSTITUTIONS_JSON.education?.find((i) => i.key === "fct_ubeb") ||
    INSTITUTIONS_JSON.education?.find((i) => i.key === "education_ministry") ||
    null;

  const ccList = [];
  return { primary, through, ccList };
}

// ----------------------------------------------------
// GLOBAL WATCHDOGS (PCC + NHRC)
// ----------------------------------------------------
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

  // 1. ALWAYS CC PCC HQ (administrative injustice watchdog)
  addCc({
    org:
      "Honourable Chief Commissioner,\n" +
      "Public Complaints Commission,\n" +
      "No. 25 Aguiyi Ironsi Street,\n" +
      "Maitama, Abuja, Nigeria.",
    email: "complaints@pcc.gov.ng, info@pcc.gov.ng",
  });

  // 2. NHRC – ONLY for human-rights related complaints
  const d = (description || "").toLowerCase();
  const humanRightsKeywords = [
    "human right",
    "human-right",
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
    "abuse",
    "degrading treatment",
    "oppression",
  ];

  const keywordHR = humanRightsKeywords.some((kw) => d.includes(kw));
  const isHR =
    result.isHumanRightsViolation === true ||
    keywordHR ||
    d.includes("human rights");

  if (isHR) {
    addCc({
      org:
        "The Executive Secretary,\n" +
        "National Human Rights Commission,\n" +
        "Abuja, Nigeria.",
      email: "info@nhrc.gov.ng",
    });
  }

  return result;
}

// ----------------------------------------------------
// AI INSTITUTION ANALYZER (OpenAI)
// ----------------------------------------------------
async function analyzeInstitutionsWithOpenAI(description) {
  if (!openai) return null;
  const text = (description || "").trim();
  if (!text) return null;

  try {
    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are an expert Nigerian administrative justice analyst. " +
            "Given a complaint, identify the correct institution(s) responsible. " +
            "Return JSON only in this strict structure:\n" +
            "{ \"primary\": {\"org\": \"\", \"email\": \"\"}, " +
            "\"through\": {\"org\": \"\", \"email\": \"\"}, " +
            "\"cc\": [{\"org\": \"\", \"email\": \"\"}], " +
            "\"isHumanRightsViolation\": true/false }\n" +
            "If any field is unknown, return empty strings or null. " +
            "Use real Nigerian institutions: regulators, ministries, agencies, state authorities, etc. " +
            "Do NOT invent email addresses; if unknown, use empty string.",
        },
        {
          role: "user",
          content:
            "Analyze this complaint and extract institutions:\n\n" +
            text +
            "\n\nReturn ONLY valid JSON, no explanations.",
        },
      ],
    });

    let raw = ai.choices?.[0]?.message?.content?.trim() || "";

    // If model wraps in ```json, strip it
    if (raw.startsWith("```")) {
      const firstBrace = raw.indexOf("{");
      const lastBrace = raw.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1) {
        raw = raw.slice(firstBrace, lastBrace + 1);
      }
    }

    const parsed = JSON.parse(raw);
    return parsed;
  } catch (err) {
    console.error("AI institution analysis failed:", err);
    return null;
  }
}

// Normalise AI JSON to internal structure
function normaliseInstitutionsFromAI(aiResult) {
  if (!aiResult || typeof aiResult !== "object") return {};

  const primary = aiResult.primary && aiResult.primary.org
    ? {
        org: aiResult.primary.org,
        email: aiResult.primary.email || "",
      }
    : null;

  const through = aiResult.through && aiResult.through.org
    ? {
        org: aiResult.through.org,
        email: aiResult.through.email || "",
      }
    : null;

  const ccList = Array.isArray(aiResult.cc)
    ? aiResult.cc
        .filter((c) => c && c.org)
        .map((c) => ({
          org: c.org,
          email: c.email || "",
        }))
    : [];

  return {
    primary,
    through,
    ccList,
    isHumanRightsViolation: aiResult.isHumanRightsViolation === true,
  };
}

// ----------------------------------------------------
// POST: GENERATE PETITION (A4)
// ----------------------------------------------------
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
      petitionText: "Please enter your complaint description.",
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

  // 2 – Institution detection: AI FIRST, then fall-back rules
  let inst = {};

  try {
    const aiRaw = await analyzeInstitutionsWithOpenAI(description);
    if (aiRaw) {
      inst = normaliseInstitutionsFromAI(aiRaw);
    } else {
      inst =
        detectElectricity(description) ||
        detectEducation(description) ||
        {};
    }
  } catch (err) {
    console.error("Error during institution detection:", err);
    inst =
      detectElectricity(description) ||
      detectEducation(description) ||
      {};
  }

  // 2b – Always apply PCC + NHRC global rules
  inst = applyGlobalWatchdogs(description, inst);

  // 3 – generate petition (OpenAI or fallback)
  let petitionText = "";

  try {
    if (openai) {
      const detailsLines = [];
      const today = new Date().toLocaleDateString("en-NG", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });

      if (fullName) detailsLines.push(fullName);
      if (address) detailsLines.push(address);
      if (email) detailsLines.push(`Email: ${email}`);
      if (phone) detailsLines.push(`Phone: ${phone}`);
      detailsLines.push(`Date: ${today}`);

      const complainantBlock =
        detailsLines.length > 0
          ? detailsLines.join("\n")
          : "Use the complainant's real details as provided.";

      const primaryOrg = inst.primary?.org || "";
      const throughOrg = inst.through?.org || "";
      const ccOrgList = Array.isArray(inst.ccList)
        ? inst.ccList.map((c) => c.org).join("; ")
        : "";

      const ai = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are an expert Nigerian petition-drafting lawyer. " +
              "Write very formal petitions suitable for professional institutions and courts. " +
              "ALWAYS use the REAL complainant details (name, address, email, phone, date) at the top. " +
              "Do NOT use placeholders like [Your Name] or [Your Address]. " +
              "Write in clean paragraphs only – no markdown, no asterisks, no bullet points. " +
              "Make the letter ready for the complainant to sign and submit physically or by email.",
          },
          {
            role: "user",
            content:
              `Complainant details:\n${complainantBlock}\n\n` +
              (primaryOrg ? `Primary institution:\n${primaryOrg}\n\n` : "") +
              (throughOrg ? `Through institution:\n${throughOrg}\n\n` : "") +
              (ccOrgList ? `CC institutions:\n${ccOrgList}\n\n` : "") +
              `Petition description (complainant's story):\n${description}\n\n` +
              "Write the full petition letter with proper introduction, body paragraphs, reliefs/prayers and closing. " +
              "Use plain text paragraphs, suitable for printing or saving as PDF.",
          },
        ],
      });

      petitionText =
        ai.choices?.[0]?.message?.content ||
        `Petition Draft:\n\n${description}`;
    } else {
      // No OpenAI – simple fallback draft
      petitionText = `Petition Draft:\n\n${description}`;
    }
  } catch (err) {
    console.error("OpenAI error while drafting petition:", err);
    petitionText = `Petition Draft:\n\n${description}`;
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

// ----------------------------------------------------
// START SERVER
// ----------------------------------------------------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`JusticeBot A4 Backend running on port ${PORT}`);
});

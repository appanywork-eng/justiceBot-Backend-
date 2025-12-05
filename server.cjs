/**
 * JusticeBot Backend (A2)
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
  res.send("JusticeBot A1 Backend is running successfully.");
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
    ])
  ) {
    return null;
  }

  // Primary – AEDC or generic DISCO
  let primary =
    INSTITUTIONS_JSON.electricity?.find((i) => i.key === "aedc") || null;

  if (!primary) {
    primary = {
      key: "generic_dis",
      org: "The Managing Director,\n[Electricity Distribution Company]",
      email: "",
    };
  }

  // Through – NERC (regulator)
  const through =
    INSTITUTIONS_JSON.electricity?.find((i) => i.key === "nerc") || null;

  // CC list – any others configured in electricity category
  const ccList = [
    INSTITUTIONS_JSON.electricity?.find((i) => i.key === "power_ministry"),
  ].filter(Boolean);

  return { primary, through, ccList };
}

// Global watchdogs: PCC always, NHRC for human-rights cases
function applyGlobalWatchdogs(description, inst) {
  const result = inst || {};
  if (!Array.isArray(result.ccList)) result.ccList = [];

  const addCc = (orgObj) => {
    if (!orgObj) return;
    if (!orgObj.org) return;

    const exists = result.ccList.some(
      (c) =>
        c &&
        typeof c.org === "string" &&
        c.org.toLowerCase() === orgObj.org.toLowerCase()
    );
    if (!exists) {
      result.ccList.push(orgObj);
    }
  };

  // 1. PCC – ALWAYS CC (administrative injustice watchdog)
  addCc({
    org: "Public Complaints Commission",
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

  const isHR =
    humanRightsKeywords.some((kw) => d.includes(kw)) ||
    d.includes("human rights");

  if (isHR) {
    addCc({
      org: "National Human Rights Commission",
      email: "info@nhrc.gov.ng",
    });
  }

  return result;
}

// ----------------------------------------------------
// POST: GENERATE PETITION (STABLE / A2)
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

  // 2 – detect institution (never throw) – currently electricity + global watchdogs
  let inst = {};
  try {
    inst = detectElectricity(description) || {};
  } catch (err) {
    console.error("Error detecting institutions:", err);
    inst = {};
  }

  // Apply PCC + NHRC global rules
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
    console.error("OpenAI error:", err);
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
  console.log(`JusticeBot A1 Backend running on port ${PORT}`);
});

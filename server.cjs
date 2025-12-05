/*
 * JusticeBot Backend (A1 STABLE)
 * Express + OpenAI + Institution detection
 */

const express = require("express");
const cors = require("cors");
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

// -----------------------------------------
// LOAD institutions.json
// -----------------------------------------
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

// -----------------------------------------
// OPENAI INIT (optional)
// -----------------------------------------
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

// -----------------------------------------
// EXPRESS INIT
// -----------------------------------------
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// -----------------------------------------
// BASIC ROUTES
// -----------------------------------------
app.get("/", (req, res) => {
  res.send("JusticeBot A1 Backend is running successfully.");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// -----------------------------------------
// HELPERS
// -----------------------------------------
function textIncludesAny(text, keywords) {
  const t = (text || "").toLowerCase();
  return keywords.some((kw) => t.includes(kw.toLowerCase()));
}

function detectElectricity(description) {
  const d = (description || "").toLowerCase();

  // If it doesn't look like an electricity complaint, return null
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
  const through = INSTITUTIONS_JSON.electricity?.find(
    (i) => i.key === "nerc"
  );

  // CC list – any others configured
  const ccList = [
    INSTITUTIONS_JSON.electricity?.find((i) => i.key === "pcc"),
    INSTITUTIONS_JSON.electricity?.find((i) => i.key === "cpd"),
  ].filter(Boolean);

  return { primary, through, ccList };
}

// -----------------------------------------
// POST: GENERATE PETITION (STABLE)
// -----------------------------------------
app.post("/generate-petition", async (req, res) => {
  console.log("Incoming /generate-petition body:", req.body);

  // 1. Safely read description
  let description = "";
  try {
    if (req.body && typeof req.body.description === "string") {
      description = req.body.description;
    }
  } catch (err) {
    console.error("Error reading description from body:", err);
  }

  if (!description.trim()) {
    // Do NOT crash – just return a message
    return res.status(200).json({
      petitionText: "Please enter your complaint description clearly.",
      primaryInstitution: null,
      throughInstitution: null,
      ccList: [],
      error: "Description is required.",
    });
  }

  // 2. Try to detect institutions, but never throw
  let inst = {};
  try {
    inst = detectElectricity(description) || {};
  } catch (err) {
    console.error("Error in detectElectricity:", err);
    inst = {};
  }

  // 3. Build petition text (OpenAI if available, else fallback)
  let petitionText = "";
  try {
    if (openai) {
      const ai = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are an expert Nigerian petition-drafting lawyer. " +
              "Write very formal petitions suitable for Nigerian institutions like the Public Complaints Commission, NERC, AEDC, Police, etc.",
          },
          {
            role: "user",
            content:
              "Draft a formal Nigerian petition based on this complaint description:\n\n" +
              description,
          },
        ],
      });

      petitionText =
        ai.choices?.[0]?.message?.content ||
        `Petition Draft:\n\n${description}`;
    } else {
      petitionText = `Petition Draft:\n\n${description}`;
    }
  } catch (err) {
    console.error("OpenAI error while drafting petition:", err);
    // Fallback instead of 500
    petitionText = `Petition Draft:\n\n${description}`;
  }

  // 4. Always respond with 200 and JSON
  try {
    return res.status(200).json({
      petitionText,
      primaryInstitution: inst.primary || null,
      throughInstitution: inst.through || null,
      ccList: Array.isArray(inst.ccList) ? inst.ccList : [],
    });
  } catch (err) {
    console.error("Error sending response:", err);
    // Absolute last fallback
    return res.status(200).json({
      petitionText,
      primaryInstitution: null,
      throughInstitution: null,
      ccList: [],
    });
  }
});

// -----------------------------------------
// START SERVER
// -----------------------------------------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`JusticeBot A1 Backend running on port ${PORT}`);
});

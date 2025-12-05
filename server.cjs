/**
 * JusticeBot Backend (A1 STABLE)
 * Express + OpenAI + Institution detection
 */

const express = require("express");
const cors = require("cors");
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

// -----------------------------------------------------
// LOAD institutions.json
// -----------------------------------------------------
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

// -----------------------------------------------------
// OPENAI INIT
// -----------------------------------------------------
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
  console.log("OPENAI_API_KEY not set; using fallback petition mode.");
}

// -----------------------------------------------------
// EXPRESS INIT
// -----------------------------------------------------
const app = express();
const PORT = process.env.PORT || 5000;
app.use(cors());
app.use(express.json());

// -----------------------------------------------------
// BASIC ROUTES
// -----------------------------------------------------
app.get("/", (req, res) => {
  res.send("JusticeBot A1 Backend is running successfully.");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// NEW TEST ROUTE
app.get("/test", (req, res) => {
  res.json({
    status: "ok",
    message: "Test endpoint working",
    openai_status: openai ? "ready" : "not_initialized",
  });
});

// -----------------------------------------------------
// HELPERS
// -----------------------------------------------------
function textIncludesAny(text, keywords) {
  const t = (text || "").toLowerCase();
  return keywords.some((kw) => t.includes(kw.toLowerCase()));
}

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

  let primary =
    INSTITUTIONS_JSON.electricity?.find((i) => i.key === "aedc") || null;

  if (!primary) {
    primary = {
      key: "generic_dis",
      org: "The Managing Director,\n[Electricity Distribution Company]",
      email: "",
    };
  }

  const through = INSTITUTIONS_JSON.electricity?.find(
    (i) => i.key === "nerc"
  );

  const ccList = [
    INSTITUTIONS_JSON.electricity?.find((i) => i.key === "min_power"),
    INSTITUTIONS_JSON.electricity?.find((i) => i.key === "consumer_protection"),
  ].filter(Boolean);

  return { primary, through, ccList };
}

// -----------------------------------------------------
// POST: GENERATE PETITION (STABLE)
// -----------------------------------------------------
app.post("/generate-petition", async (req, res) => {
  console.log("Incoming /generate-petition:", req.body);

  // 1 — description
  let description = "";
  try {
    if (req.body?.description) description = req.body.description;
  } catch (err) {
    console.error("Error reading description:", err);
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

  // 2 — detect institution
  let inst = {};
  try {
    inst = detectElectricity(description) || {};
  } catch (err) {
    console.error("Error detecting institutions:", err);
    inst = {};
  }

  // 3 — generate petition (OpenAI or fallback)
  let petitionText = "";
  try {
    if (openai) {
      const ai = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are an expert Nigerian petition-drafting AI. Write very formal petitions suitable for Nigerian institutions.",
          },
          {
            role: "user",
            content:
              "Draft a very formal Nigerian petition based on this complaint:\n\n" +
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
    console.error("OpenAI error:", err);
    petitionText = `Petition Draft:\n\n${description}`;
  }

  // 4 — always respond safely
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

// -----------------------------------------------------
// START SERVER
// -----------------------------------------------------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`JusticeBot A1 Backend running on port ${PORT}`);
});

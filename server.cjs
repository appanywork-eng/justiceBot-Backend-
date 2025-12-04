/*
 * JusticeBot Backend (A1 STANDARD)
 * Express + OpenAI + Institution detection
 */

const express = require("express");
const cors = require("cors");
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

// -------------------------------
// LOAD institutions.json
// -------------------------------
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

// -------------------------------
// OPENAI INIT
// -------------------------------
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

// -------------------------------
// EXPRESS INIT
// -------------------------------
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// -------------------------------
// GET ROUTES (Fix “Cannot GET /” errors)
// -------------------------------
app.get("/", (req, res) => {
  res.send("JusticeBot A1 Backend is running successfully.");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// -------------------------------
// RULE-BASED DETECTORS
// -------------------------------
function textIncludesAny(text, keywords) {
  const t = text.toLowerCase();
  return keywords.some((kw) => t.includes(kw.toLowerCase()));
}

function detectElectricity(description) {
  const d = description.toLowerCase();

  if (
    !textIncludesAny(d, [
      "electricity",
      "disco",
      "meter",
      "prepaid",
      "over billing",
      "power",
      "light",
    ])
  ) {
    return null;
  }

  let primary = INSTITUTIONS_JSON.electricity?.find(
    (i) => i.key === "aedc"
  );

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
    INSTITUTIONS_JSON.electricity?.find((i) => i.key === "fccpc"),
  ].filter(Boolean);

  return { primary, through, ccList };
}

// -------------------------------
// POST: GENERATE PETITION
// -------------------------------
app.post("/generate-petition", async (req, res) => {
  try {
    const { description } = req.body;
    if (!description) {
      return res.status(400).json({ error: "Description is required" });
    }

    let inst = detectElectricity(description);
    let petitionText = "";

    if (openai) {
      const ai = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an expert Nigerian petition-writing assistant.",
          },
          {
            role: "user",
            content:
              "Draft a formal Nigerian petition based on this description:\n" +
              description,
          },
        ],
      });

      petitionText =
        ai.choices?.[0]?.message?.content ||
        "Unable to generate petition at this time.";
    } else {
      petitionText = `Petition Draft:\n\n${description}`;
    }

    return res.json({
      petitionText,
      primaryInstitution: inst?.primary || null,
      throughInstitution: inst?.through || null,
      ccList: inst?.ccList || [],
    });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({
      error: "Server error generating petition.",
    });
  }
});

// -------------------------------
// START SERVER
// -------------------------------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`JusticeBot A1 Backend running on port ${PORT}`);
});

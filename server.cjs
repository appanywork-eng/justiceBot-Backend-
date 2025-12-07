/**
 * PetitionDesk / JusticeBot Backend
 * A8 – World Brain Router + Petition Writer
 *
 * This server:
 *  - Receives complaint description + optional complainant details
 *  - Hands everything to the A8 engine (./a8Engine.js)
 *  - Returns the petition text + routing information
 *  - Falls back to a simple petition if A8 fails for any reason
 */

const express = require("express");
const cors = require("cors");
require("dotenv").config();
const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// LOAD institutions.json (if present) – optional extra data for A8
// ---------------------------------------------------------------------------
let INSTITUTIONS_JSON = {};
try {
  const filePath = path.join(__dirname, "data", "institutions.json");
  const raw = fs.readFileSync(filePath, "utf8");
  INSTITUTIONS_JSON = JSON.parse(raw);
  console.log("institutions.json loaded successfully");
} catch (err) {
  console.error("Could not load institutions.json (this is OK):", err.message);
  INSTITUTIONS_JSON = {};
}

// ---------------------------------------------------------------------------
// LOAD A8 ENGINE
// ---------------------------------------------------------------------------
let generatePetitionA8 = null;
try {
  const a8 = require("./a8Engine");
  if (a8 && typeof a8.generatePetitionA8 === "function") {
    generatePetitionA8 = a8.generatePetitionA8;
    console.log("A8 engine loaded successfully from a8Engine.js");
  } else {
    console.error("a8Engine.js does not export generatePetitionA8");
  }
} catch (err) {
  console.error("Error loading a8Engine.js:", err);
}

// ---------------------------------------------------------------------------
// EXPRESS INIT
// ---------------------------------------------------------------------------
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------------------
// BASIC ROUTES
// ---------------------------------------------------------------------------
app.get("/", (req, res) => {
  res.send("JusticeBot A8 World Brain Backend is running.");
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    time: new Date().toISOString(),
    engine: "A8",
    a8Loaded: !!generatePetitionA8,
    hasOpenAIKey: !!process.env.OPENAI_API_KEY,
  });
});

// ---------------------------------------------------------------------------
// SIMPLE FALLBACK PETITION (if A8 or OpenAI fails)
// ---------------------------------------------------------------------------
function buildVerySimpleFallbackPetition(complainant, description) {
  const { fullName, email, phone, address } = complainant || {};

  const today = new Date().toLocaleDateString("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const headerLines = [];
  if (fullName) headerLines.push(fullName);
  if (address) headerLines.push(address);
  if (email) headerLines.push(`Email: ${email}`);
  if (phone) headerLines.push(`Phone: ${phone}`);
  headerLines.push(today);

  let text = "";
  text += headerLines.join("\n") + "\n\n";
  text += "The Appropriate Authority\n\n";
  text += "Dear Sir/Madam,\n\n";
  text += "RE: FORMAL COMPLAINT / PETITION\n\n";
  text +=
    "I am writing to formally lodge a complaint regarding the matter described below:\n\n";
  text += description + "\n\n";
  text +=
    "I respectfully request that your good office investigate this complaint and take all necessary steps to ensure justice is done.\n\n";
  text += "Yours faithfully,\n\n";
  text += (fullName || "The Complainant") + "\n";
  if (phone) text += phone + "\n";
  if (email) text += email + "\n";

  return text;
}

// ---------------------------------------------------------------------------
// POST: GENERATE PETITION (A8 + SAFE FALLBACK)
// ---------------------------------------------------------------------------
app.post("/generate-petition", async (req, res) => {
  console.log("Incoming /generate-petition:", req.body);

  // 1. safely read description
  let description = "";
  try {
    if (req.body && typeof req.body.description === "string") {
      description = req.body.description.trim();
    }
  } catch (err) {
    console.error("Error reading description from body:", err);
  }

  if (!description) {
    return res.status(200).json({
      petitionText: "Please enter your complaint description.",
      primaryInstitution: null,
      throughInstitution: null,
      ccList: [],
      error: "Description is required.",
    });
  }

  // 2. read complainant details (REAL user data)
  let fullName = "";
  let email = "";
  let phone = "";
  let address = "";

  try {
    if (req.body && typeof req.body.fullName === "string") {
      fullName = req.body.fullName.trim();
    }
    if (req.body && typeof req.body.email === "string") {
      email = req.body.email.trim();
    }
    if (req.body && typeof req.body.phone === "string") {
      phone = req.body.phone.trim();
    }
    if (req.body && typeof req.body.address === "string") {
      address = req.body.address.trim();
    }
  } catch (err) {
    console.error("Error reading extra fields from body:", err);
  }

  const complainant = { fullName, email, phone, address };

  // 3. If A8 is not loaded, go straight to simple fallback
  if (!generatePetitionA8) {
    console.error("A8 engine not available – using simple fallback petition.");
    const fallbackText = buildVerySimpleFallbackPetition(complainant, description);

    return res.status(200).json({
      petitionText: fallbackText,
      primaryInstitution: null,
      throughInstitution: null,
      ccList: [],
      error: "A8 engine not available – using fallback petition.",
    });
  }

  // 4. Call A8 engine
  try {
    const result = await generatePetitionA8({
      complainant,
      description,
      institutionsJson: INSTITUTIONS_JSON,
    });

    // A8 is expected to return something like:
    // {
    //   petitionText: string,
    //   primaryInstitution: {...} | null,
    //   throughInstitution: {...} | null,
    //   ccList: [ {...}, ... ],
    //   routingSummary: string
    // }

    const petitionText =
      (result && typeof result.petitionText === "string"
        ? result.petitionText
        : "") || buildVerySimpleFallbackPetition(complainant, description);

    const primaryInstitution = result && result.primaryInstitution
      ? result.primaryInstitution
      : null;

    const throughInstitution = result && result.throughInstitution
      ? result.throughInstitution
      : null;

    const ccList =
      result && Array.isArray(result.ccList) ? result.ccList : [];

    const routingSummary =
      result && typeof result.routingSummary === "string"
        ? result.routingSummary
        : null;

    return res.status(200).json({
      petitionText,
      primaryInstitution,
      throughInstitution,
      ccList,
      routingSummary,
    });
  } catch (err) {
    console.error("Error inside A8 engine:", err);

    const fallbackText = buildVerySimpleFallbackPetition(complainant, description);

    return res.status(200).json({
      petitionText: fallbackText,
      primaryInstitution: null,
      throughInstitution: null,
      ccList: [],
      error: "A8 engine failed – using fallback petition.",
    });
  }
});

// ---------------------------------------------------------------------------
// START SERVER
// ---------------------------------------------------------------------------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`JusticeBot A8 World Brain Backend running on port ${PORT}`);
});

// server.cjs - JusticeBot backend (A1 STANDARD)
// Express + OpenAI + AI institution detection + rule fallback
// JSON-based institution list loading (SAFE, NON-BREAKING)

const express = require("express");
const cors = require("cors");
require("dotenv").config();
const fs = require("fs");
const path = require("path");

const OpenAI = require("openai");

// -----------------------------------------
// LOAD institutions.json (A1 STANDARD)
// -----------------------------------------
let INSTITUTIONS_JSON = {};
try {
  const filePath = path.join(__dirname, "institutions.json");
  const raw = fs.readFileSync(filePath, "utf8");
  INSTITUTIONS_JSON = JSON.parse(raw);
  console.log("A1 Institutions loaded successfully.");
} catch (err) {
  console.error("Failed to load institutions.json:", err);
  INSTITUTIONS_JSON = {};
}

// -----------------------------------------
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// ======================================================
// RULE-BASED DETECTORS (unchanged from your V3 logic)
// ======================================================

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
      "light"
    ])
  )
    return null;

  let primary = INSTITUTIONS_JSON.electricity?.find((i) =>
    i.key === "aedc"
  );

  if (!primary) {
    primary = {
      key: "generic_disco",
      org:
        "The Managing Director,\n[Electricity Distribution Company],\nNigeria.",
      email: ""
    };
  }

  const through = INSTITUTIONS_JSON.electricity?.find(
    (i) => i.key === "nerc"
  );
  const ccList = [
    INSTITUTIONS_JSON.electricity?.find((i) => i.key === "min_power"),
    INSTITUTIONS_JSON.oversight_bodies?.find((i) => i.key === "pcc")
  ].filter(Boolean);

  return { primary, through, ccList };
}

function detectHealth(description) {
  const d = description.toLowerCase();
  if (
    !textIncludesAny(d, [
      "hospital",
      "clinic",
      "medical",
      "doctor",
      "nurse",
      "lab"
    ])
  )
    return null;

  const primary = INSTITUTIONS_JSON.health?.find((i) => i.key === "hospital");

  const through = d.includes("abuja")
    ? INSTITUTIONS_JSON.health?.find((i) => i.key === "fct_health")
    : INSTITUTIONS_JSON.health?.find((i) => i.key === "min_health");

  const ccList = [
    INSTITUTIONS_JSON.health?.find((i) => i.key === "servicom"),
    INSTITUTIONS_JSON.oversight_bodies?.find((i) => i.key === "pcc"),
    INSTITUTIONS_JSON.oversight_bodies?.find((i) => i.key === "nhrc")
  ].filter(Boolean);

  return { primary, through, ccList };
}

function detectPolice(description) {
  const d = description.toLowerCase();
  if (!textIncludesAny(d, ["police", "officer", "dpo", "station"]))
    return null;

  const primary = INSTITUTIONS_JSON.police?.find(
    (i) => i.key === "state_police"
  );
  const through = INSTITUTIONS_JSON.police?.find((i) => i.key === "igp");

  const ccList = [
    INSTITUTIONS_JSON.police?.find((i) => i.key === "psc"),
    INSTITUTIONS_JSON.oversight_bodies?.find((i) => i.key === "pcc"),
    INSTITUTIONS_JSON.oversight_bodies?.find((i) => i.key === "nhrc")
  ].filter(Boolean);

  return { primary, through, ccList };
}

// CORRUPTION
function detectCorruption(description) {
  const d = description.toLowerCase();
  if (
    !textIncludesAny(d, [
      "bribe",
      "fraud",
      "scam",
      "money laundering",
      "embezzle"
    ])
  )
    return null;

  const primary = INSTITUTIONS_JSON.corruption?.find(
    (i) => i.key === "efcc"
  );
  const through = INSTITUTIONS_JSON.corruption?.find(
    (i) => i.key === "icpc"
  );
  const ccList = [
    INSTITUTIONS_JSON.corruption?.find((i) => i.key === "agf"),
    INSTITUTIONS_JSON.oversight_bodies?.find((i) => i.key === "pcc")
  ].filter(Boolean);

  return { primary, through, ccList };
}

// BANKING
function detectBanking(description) {
  const d = description.toLowerCase();
  if (
    !textIncludesAny(d, ["bank", "account", "debit", "pos", "atm", "unauthorised"])
  )
    return null;

  const primary = INSTITUTIONS_JSON.banking?.find((i) => i.key === "bank");
  const through = INSTITUTIONS_JSON.banking?.find((i) => i.key === "cbn");
  const ccList = [
    INSTITUTIONS_JSON.banking?.find((i) => i.key === "pcc")
  ].filter(Boolean);

  return { primary, through, ccList };
}

// TELECOMS
function detectTelecoms(description) {
  const d = description.toLowerCase();
  if (
    !textIncludesAny(d, ["mtn", "glo", "airtel", "9mobile", "network", "sim"])
  )
    return null;

  const primary = INSTITUTIONS_JSON.telecoms?.find((i) => i.key === "telco");
  const through = INSTITUTIONS_JSON.telecoms?.find((i) => i.key === "ncc");
  const ccList = [
    INSTITUTIONS_JSON.oversight_bodies?.find((i) => i.key === "pcc")
  ].filter(Boolean);

  return { primary, through, ccList };
}

// LAND / HOUSING
function detectLandHousing(description) {
  const d = description.toLowerCase();
  if (
    !textIncludesAny(d, ["land", "allocation", "plot", "housing", "demolition"])
  )
    return null;

  const primary = INSTITUTIONS_JSON.land_housing?.find(
    (i) => i.key === "land_authority"
  );
  const through = INSTITUTIONS_JSON.land_housing?.find(
    (i) => i.key === "governor"
  );
  const ccList = [
    INSTITUTIONS_JSON.land_housing?.find((i) => i.key === "pcc")
  ].filter(Boolean);

  return { primary, through, ccList };
}

// MASTER FALLBACK
function detectInstitutionsRuleBased(description = "") {
  const detectors = [
    detectElectricity,
    detectHealth,
    detectPolice,
    detectCorruption,
    detectBanking,
    detectTelecoms,
    detectLandHousing
  ];

  for (const fn of detectors) {
    const result = fn(description);
    if (result) return result;
  }

  // Default PCC fallback
  const pcc = INSTITUTIONS_JSON.oversight_bodies?.find(
    (i) => i.key === "pcc"
  );

  return { primary: pcc, through: null, ccList: [] };
}

// ======================================================
// AI INSTITUTION DETECTOR (unchanged logic)
// ======================================================

async function aiDetectInstitutions(description = "") {
  if (!openai) return null;
  if (!description.trim()) return null;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1",
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content:
            "You are an expert Nigerian legal routing assistant. Return ONLY JSON."
        },
        {
          role: "user",
          content: `
COMPLAINT:
"${description}"

Return JSON:
{
  "primary": { "key": "", "org": "", "email": "" },
  "through": { "key": "", "org": "", "email": "" } or null,
  "cc": [
    { "key": "", "org": "", "email": "" }
  ]
}
`
        }
      ]
    });

    let raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) return null;

    if (raw.startsWith("```")) {
      const first = raw.indexOf("{");
      const last = raw.lastIndexOf("}");
      raw = raw.slice(first, last + 1);
    }

    const parsed = JSON.parse(raw);

    return {
      primary: parsed.primary,
      through: parsed.through,
      ccList: parsed.cc || []
    };
  } catch (err) {
    console.error("AI detect error:", err);
    return null;
  }
}

// Unified detector
async function detectInstitutions(description = "") {
  const ai = await aiDetectInstitutions(description);
  if (ai && ai.primary && ai.primary.org) return ai;

  return detectInstitutionsRuleBased(description);
}

// ======================================================
// PETITION GENERATION (unchanged)
// ======================================================

function humanRoleLabel(role) {
  switch (role) {
    case "victim":
      return "the direct victim of the incident";
    case "representative":
      return "the authorised representative of the victim";
    case "witness":
      return "a witness to the incident";
    case "concerned_citizen":
      return "a concerned citizen bringing this matter to your attention";
    default:
      return "the complainant";
  }
}

function buildPrompt(data, inst) {
  const ccOrgs =
    inst.ccList && inst.ccList.length
      ? inst.ccList.map((c) => c.org).join("\n\n")
      : "None explicitly specified.";

  return `
You are a Nigerian human rights lawyer. Draft a formal petition:

Primary:
${inst.primary?.org}

Through:
${inst.through?.org || "None"}

CC:
${ccOrgs}

User Role: ${humanRoleLabel(data.role)}
Facts:
${data.description}

Return ONLY the petition (no explanations).
`;
}

function fallbackPetition(data, inst) {
  return `
${new Date().toLocaleDateString("en-NG")}

${inst.primary.org}

${
  inst.through
    ? `Through:\n${inst.through.org}\n`
    : ""
}

PETITION ON BEHALF OF ${data.fullName.toUpperCase()}

Dear Sir/Ma,
${data.description}

Yours faithfully,
${data.fullName}
Email: ${data.email}
Phone: ${data.phone}
`.trim();
}

// ======================================================
// ROUTES
// ======================================================

app.get("/health", (req, res) => {
  res.json({ status: "ok", version: "A1 STANDARD BACKEND" });
});

app.post("/petition", async (req, res) => {
  try {
    const data = req.body;

    if (!data.fullName || !data.description) {
      return res.status(400).json({
        error: "Full name and description are required."
      });
    }

    if (!data.role) data.role = "victim";

    const inst = await detectInstitutions(data.description);

    // If no OpenAI available → fallback petition
    if (!openai) {
      return res.json({
        petitionText: fallbackPetition(data, inst),
        primaryInstitution: inst.primary,
        throughInstitution: inst.through,
        ccList: inst.ccList
      });
    }

    const prompt = buildPrompt(data, inst);

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.4,
      messages: [
        { role: "system", content: "You are a Nigerian human rights lawyer." },
        { role: "user", content: prompt }
      ]
    });

    const petitionText =
      completion.choices[0]?.message?.content?.trim() ||
      fallbackPetition(data, inst);

    return res.json({
      petitionText,
      primaryInstitution: inst.primary,
      throughInstitution: inst.through,
      ccList: inst.ccList
    });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({
      error: "Server error generating petition."
    });
  }
});

// ======================================================
// START SERVER
// ======================================================

app.listen(PORT, "0.0.0.0", () => {
  console.log("JusticeBot A1 Backend running on port " + PORT);
});

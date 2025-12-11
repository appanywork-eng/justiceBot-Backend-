// ============================================================
// aiRouting.js  —  PetitionDesk AI routing + sector detection
// ============================================================

const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

// ----------------------------------------------
// 1. OPENAI CLIENT WRAPPER  (Fixes your error)
// ----------------------------------------------
function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    console.warn("⚠ OPENAI_API_KEY missing. Fallback mode ACTIVE — AI text will be template-generated only.");
  }

  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || "",
  });
}

module.exports.getOpenAIClient = getOpenAIClient;

// ----------------------------------------------
// 2. Load institutions database
// ----------------------------------------------
const institutionsPath = path.join(__dirname, "data", "institutions.json");

let institutions = {};
try {
  institutions = JSON.parse(fs.readFileSync(institutionsPath, "utf8"));
  console.log("[aiRouting] institutions.json loaded");
} catch (err) {
  console.error("❌ ERROR loading institutions.json:", err);
}

// ----------------------------------------------
// 3. Keyword → Sector classifier
// ----------------------------------------------
function detectSector(description) {
  const text = description.toLowerCase();

  const sectorKeywords = {
    electricity: [
      "meter", "estimated billing", "token", "blackout", "transformer",
      "overbilling", "disco", "nedc", "aedc", "ibedc", "ikdc"
    ],
    banking: [
      "fraud", "unauthorized debit", "atm", "transfer", "card", "chargeback", "pos"
    ],
    telecom: [
      "network", "data", "sim", "airtime", "mtn", "glo", "9mobile", "airtel"
    ],
    aviation: [
      "flight", "airline", "delay", "cancellation", "airport"
    ],
    judiciary: [
      "court", "magistrate", "judge", "legal", "bail"
    ],
    police: [
      "police", "assault", "brutality", "illegal arrest", "detention", "extortion", "sars"
    ],
    health: [
      "hospital", "doctor", "nurse", "treatment", "nhis", "pharmacy"
    ],
    education: [
      "school", "university", "teacher", "student", "lecture"
    ],
    transport: [
      "road", "frsc", "driver", "vehicle", "license"
    ]
  };

  for (const sector in sectorKeywords) {
    for (const kw of sectorKeywords[sector]) {
      if (text.includes(kw)) return sector;
    }
  }

  return "general";
}

// ----------------------------------------------
// 4. Institution selector
// ----------------------------------------------
function getInstitutionsForSector(sector, userAddress = "") {
  if (!institutions[sector]) return [];

  // Try match police command by state/city
  if (sector === "police") {
    const lower = userAddress.toLowerCase();
    const policeMap = institutions.police_states || {};

    for (const key in policeMap) {
      if (lower.includes(key)) {
        return [{ org: policeMap[key], level: "state", role: "police command" }];
      }
    }
  }

  return institutions[sector];
}

// ----------------------------------------------
// 5. Generate Petition using OpenAI
// ----------------------------------------------
async function generatePetition(fullName, email, phone, address, description) {
  try {
    const sector = detectSector(description);
    const routes = getInstitutionsForSector(sector, address);

    const client = getOpenAIClient();

    let prompt = `
You are PetitionDesk AI. Write a formal, legally structured petition.

Full Name: ${fullName}
Email: ${email}
Phone: ${phone}
Address: ${address}

Issue Description:
"${description}"

Detected Sector: ${sector}
Relevant Institutions to Address:
${routes.map(r => `- ${r.org}`).join("\n")}

Write a complete petition including:
1. Proper salutation to ALL matched institutions
2. Summary of grievance
3. Chronology of events
4. Violated rights / rules (if any)
5. Demands for remedy
6. Conclusion + signature block
`;

    // If API key missing, fallback
    if (!process.env.OPENAI_API_KEY) {
      return {
        petition: `Dear Sir/Madam,\n\nThis is a fallback petition template for: ${description}`,
        routes,
      };
    }

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 700,
      temperature: 0.4,
    });

    const petitionText =
      completion?.choices?.[0]?.message?.content ||
      "Error generating petition text.";

    return {
      petition: petitionText,
      routes,
    };
  } catch (err) {
    console.error("❌ AI Error:", err);
    return {
      petition: "System error generating petition.",
      routes: [],
    };
  }
}

module.exports.generatePetition = generatePetition;

// aiRouting.js – PetitionDesk AI routing + sector detection
// ========================================================

const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

// --------------------------------------------------------
// 1. OpenAI client wrapper
// --------------------------------------------------------
function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    console.warn("⚠ OPENAI_API_KEY missing. Petition text will use fallback.");
  }

  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || "DUMMY_KEY",
  });
}

// --------------------------------------------------------
// 2. Load institutions database
// --------------------------------------------------------
const institutionsPath = path.join(__dirname, "data", "institutions.json");
let institutions = {};

try {
  const raw = fs.readFileSync(institutionsPath, "utf8");
  institutions = JSON.parse(raw);
  console.log("[aiRouting] institutions.json loaded");
} catch (err) {
  console.error("❌ ERROR loading institutions.json:", err);
  institutions = {};
}

// --------------------------------------------------------
// 3. Keyword-based sector classifier
// --------------------------------------------------------
function detectSector(description = "") {
  const text = description.toLowerCase();

  const sectorKeywords = {
    electricity: [
      "meter", "estimated billing", "token", "blackout",
      "overbilling", "disco", "aedc", "kedc", "ibedc",
      "ekedc", "eedc", "abuja disco", "electricity"
    ],
    banking: [
      "fraud", "unauthorized debit", "atm", "transfer",
      "pos", "chargeback", "bank", "gtbank", "zenith",
      "uba", "access bank", "first bank", "fidelity",
      "loan", "overcharge"
    ],
    telecom: [
      "network", "data", "sim", "airtime", "mtn", "glo",
      "airtel", "9mobile", "call", "internet", "sms"
    ],
    aviation: [
      "flight", "airline", "delay", "cancellation",
      "airport", "boarding pass", "baggage", "luggage"
    ],
    judiciary: [
      "court", "magistrate", "judge", "legal",
      "bail", "judgment", "injunction"
    ],
    police: [
      "police", "assault", "brutality", "illegal arrest",
      "detention", "cp", "commissioner of police", "sars",
      "checkpoint", "police station"
    ],
    health: [
      "hospital", "doctor", "nurse", "treatment",
      "nhis", "nhia", "clinic", "medical", "drug"
    ],
    education: [
      "school", "university", "teacher", "student",
      "lecturer", "exam", "result", "admission"
    ],
    transport: [
      "road", "frsc", "driver", "vehicle",
      "license", "accident", "traffic"
    ],
    human_rights: [
      "torture", "detention", "extra-judicial",
      "human rights", "amnesty", "nhrec", "abuse"
    ],
    corruption: [
      "bribe", "extortion", "kickback",
      "corrupt", "embezzle", "misappropriation", "efcc", "icpc"
    ],
    identity: [
      "nin", "national id", "nimc", "identity card"
    ],
    elections: [
      "inec", "election", "voter", "polling unit",
      "ballot", "result collation"
    ],
  };

  for (const sector in sectorKeywords) {
    const kws = sectorKeywords[sector];
    for (const kw of kws) {
      if (text.includes(kw)) {
        return sector;
      }
    }
  }

  return "general";
}

// --------------------------------------------------------
// 4. Institution selector
// --------------------------------------------------------
function getInstitutionsForSector(sector, userAddress = "") {
  if (!institutions || typeof institutions !== "object") return [];

  const addr = (userAddress || "").toLowerCase();

  switch (sector) {
    case "electricity":
      return institutions.power_companies || [];

    case "banking":
      return institutions.banks || [];

    case "telecom":
      return institutions.telecom_companies || [];

    case "identity":
      // NIMC & similar live under regulators in your JSON
      return (institutions.regulators || []).filter((r) =>
        (r.sector || []).includes("identity")
      );

    case "elections":
      return (institutions.regulators || []).filter((r) =>
        (r.sector || []).includes("elections")
      );

    case "health":
      return (institutions.health_agencies || []).concat(
        institutions.sector_agencies || []
      );

    case "police": {
      const list = [];
      const policeStates = institutions.police_commands || [];

      if (addr && Array.isArray(policeStates)) {
        const match = policeStates.find((p) =>
          addr.includes((p.state || "").toLowerCase())
        );
        if (match) list.push(match);
      }

      // national-level security agencies (npf hq, dss, nscdc, efcc, icpc, ndlea, naptip)
      if (Array.isArray(institutions.security_agencies)) {
        list.push(...institutions.security_agencies);
      }

      return list;
    }

    case "judiciary":
      // you can later add judiciary_bodies in JSON if needed
      return [];

    case "transport":
      return (institutions.sector_agencies || []).filter((r) =>
        (r.sector || []).includes("transport")
      );

    case "human_rights":
      return []
        .concat(institutions.civil_rights_ngos || [])
        .concat(institutions.international_bodies || [])
        .concat(institutions.oversight || []);

    case "corruption":
      return (institutions.sector_agencies || []).filter((r) =>
        (r.sector || []).includes("anti_corruption")
      );

    default:
      // generic complaints → oversight, transparency, ombudsman etc.
      return []
        .concat(institutions.oversight || [])
        .concat(institutions.civil_rights_ngos || [])
        .concat(institutions.regulators || []);
  }
}

// --------------------------------------------------------
// 5. Hybrid detector used by server.cjs (THIS FIXES THE ERROR)
// --------------------------------------------------------
function aiDetect(fullName, description, userAddress = "") {
  const sector = detectSector(description || "");
  const routes = getInstitutionsForSector(sector, userAddress);

  const [primary, ...ccList] = Array.isArray(routes) ? routes : [];

  return {
    primary: primary || null,
    through: null,          // can be filled by applyWatchdogs / applySectorSupervisors
    ccList,
    sector,
    routes,
  };
}

// --------------------------------------------------------
// 6. Optional: single-call petition generator (not used by server.cjs,
//    but we keep it exported in case you want it later)
// --------------------------------------------------------
async function generatePetition(fullName, email, phone, address, description) {
  const sector = detectSector(description);
  const routes = getInstitutionsForSector(sector, address);
  const client = getOpenAIClient();

  // Build AI prompt
  let prompt = `
You are PetitionDesk AI. Write a formal, legally structured petition for a Nigerian complainant.

Complainant:
Full Name: ${fullName}
Email: ${email}
Phone: ${phone}
Address: ${address}

Issue Description:
"${description}"

Detected Sector: ${sector}
Relevant Institutions to Address:
${routes.map((r) => `- ${r.org}`).join("\n")}

Write a complete petition including:
1. Proper salutation to ALL matched institutions
2. Summary of grievance
3. Chronology of events
4. Violated rights / rules (if any)
5. Demands for remedy
6. Conclusion + signature block
`;

  // If there is no API key, just return a very basic fallback text
  if (!process.env.OPENAI_API_KEY) {
    return {
      petition:
        "Dear Sir/Madam,\n\nThis is a fallback petition because no OpenAI API key is configured.\n\nYours faithfully,\n" +
        fullName,
      routes,
    };
  }

  try {
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

// --------------------------------------------------------
// Exports
// --------------------------------------------------------
module.exports = {
  getOpenAIClient,
  detectSector,
  getInstitutionsForSector,
  aiDetect,
  generatePetition,
};

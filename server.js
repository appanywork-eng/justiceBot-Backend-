// server.js
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 10000;

// ========= MIDDLEWARE =========
app.use(cors());
app.use(express.json());

// ========= SIMPLE HEALTH / ROOT ROUTES =========
app.get("/", (req, res) => {
  res.send("JusticeBot backend is running.");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "JusticeBot backend healthy" });
});

// ========= INSTITUTIONS DATABASE (STARTER LIST) =========
// You can keep adding more items to this array later.
const institutions = [
  // --- CORE JUSTICE / COMPLAINT BODIES ---
  {
    name: "Public Complaints Commission (PCC) – HQ",
    category: "Ombudsman / General Complaints",
    tags: ["general", "civil_service", "human_rights", "police", "land", "public_officer"],
    email: "info@pcc.gov.ng",
    phone: "+234-9-2901430",
    website: "https://pcc.gov.ng",
    address: "25 Aguiyi Ironsi Street, Maitama, Abuja",
    type: "Federal Government"
  },
  {
    name: "National Human Rights Commission (NHRC)",
    category: "Human Rights / Police Brutality / Detention",
    tags: ["human_rights", "police", "detention", "prison", "torture"],
    email: "info@nhrc.gov.ng",
    phone: "+234-9-4135277",
    website: "https://www.nhrc.gov.ng",
    address: "19 Aguiyi Ironsi Street, Maitama, Abuja",
    type: "Federal Government"
  },
  {
    name: "Legal Aid Council of Nigeria",
    category: "Free Legal Representation",
    tags: ["court", "criminal", "detention", "poor", "human_rights"],
    email: "info@legalaidcouncil.gov.ng",
    phone: "+234-9-4622900",
    website: "https://legalaidcouncil.gov.ng",
    address: "No. 22 Port Harcourt Crescent, Off Gimbiya Street, Area 11, Garki, Abuja",
    type: "Federal Government"
  },

  // --- POLICE / SECURITY ---
  {
    name: "Nigeria Police Force – Complaint Response Unit (CRU)",
    category: "Police Misconduct / Extortion / Brutality",
    tags: ["police", "brutality", "extortion", "harassment"],
    email: "npfcomplaint@npf.gov.ng",
    phone: "0805 700 0001",
    website: "https://npf.gov.ng",
    address: "Force Headquarters, Louis Edet House, Abuja",
    type: "Federal Government"
  },
  {
    name: "Office of the Inspector-General of Police",
    category: "Serious Police Misconduct / High-Level Complaints",
    tags: ["police", "serious_police"],
    email: "igp@npf.gov.ng",
    phone: "+234-9-4321233",
    website: "https://npf.gov.ng",
    address: "Force Headquarters, Louis Edet House, Abuja",
    type: "Federal Government"
  },

  // --- ANTI-CORRUPTION ---
  {
    name: "Economic and Financial Crimes Commission (EFCC)",
    category: "Corruption / Fraud / Financial Crimes",
    tags: ["corruption", "fraud", "419", "advance_fee", "public_funds"],
    email: "info@efccnigeria.org",
    phone: "+234-9-9044751",
    website: "https://efcc.gov.ng",
    address: "5 Fomella Street, Wuse Zone 2, Abuja",
    type: "Federal Government"
  },
  {
    name: "Independent Corrupt Practices & Other Related Offences Commission (ICPC)",
    category: "Corruption / Bribery / Abuse of Office",
    tags: ["corruption", "bribery", "public_officer"],
    email: "info@icpc.gov.ng",
    phone: "+234-9-4601100",
    website: "https://icpc.gov.ng",
    address: "Plot 802, Constitution Avenue, Central Area, Abuja",
    type: "Federal Government"
  },

  // --- JUDICIARY / LAW ---
  {
    name: "Nigerian Bar Association (NBA) – Human Rights Committee",
    category: "Human Rights / Lawyers’ Intervention",
    tags: ["human_rights", "lawyer", "court"],
    email: "info@nigerianbar.org.ng",
    phone: "+234-9-4602222",
    website: "https://nigerianbar.org.ng",
    address: "NBA House, Central Business District, Abuja",
    type: "Professional Body"
  },

  // --- PRISONS / CORRECTIONAL ---
  {
    name: "Nigerian Correctional Service (Prisons) – HQ",
    category: "Prison Conditions / Unlawful Detention",
    tags: ["prison", "detention", "human_rights"],
    email: "info@corrections.gov.ng",
    phone: "+234-9-2340094",
    website: "https://corrections.gov.ng",
    address: "Bill Clinton Drive, Airport Road, Abuja",
    type: "Federal Government"
  },

  // --- AVIATION ---
  {
    name: "Federal Airports Authority of Nigeria (FAAN)",
    category: "Airport Services / Passenger Complaints",
    tags: ["aviation", "airport", "flight"],
    email: "feedback@faan.gov.ng",
    phone: "+234-1-2794480",
    website: "https://faan.gov.ng",
    address: "Murtala Muhammed Airport, Ikeja, Lagos",
    type: "Federal Government"
  },
  {
    name: "Nigerian Civil Aviation Authority (NCAA)",
    category: "Airline Misconduct / Flight Cancellations",
    tags: ["aviation", "flight", "airline"],
    email: "consumerprotection@ncaa.gov.ng",
    phone: "+234-1-2799000",
    website: "https://ncaa.gov.ng",
    address: "Aviation House, Ikeja, Lagos",
    type: "Regulatory Agency"
  },

  // --- LAND / FCDA / PLANNING ---
  {
    name: "Federal Capital Development Authority (FCDA)",
    category: "Land / Building / FCT Development Issues",
    tags: ["land", "building", "fcda", "abuja"],
    email: "info@fcda.gov.ng",
    phone: "+234-9-4134465",
    website: "https://fcda.gov.ng",
    address: "No. 1 Kapital Road, Area 11, Garki, Abuja",
    type: "Federal Government"
  },

  // --- FOREIGN AFFAIRS / EMBASSIES ---
  {
    name: "Federal Ministry of Foreign Affairs",
    category: "Issues Outside Nigeria / Embassies / Consular",
    tags: ["embassy", "foreign", "consular"],
    email: "info@foreignaffairs.gov.ng",
    phone: "+234-9-5237647",
    website: "https://foreignaffairs.gov.ng",
    address: "Maputo Street, Wuse Zone 3, Abuja",
    type: "Federal Government"
  },
  {
    name: "United States Embassy Abuja – Consular Section",
    category: "US Visa / Consular Complaints",
    tags: ["embassy", "usa"],
    email: "ConsularAbuja@state.gov",
    phone: "+234-9-4614000",
    website: "https://ng.usembassy.gov",
    address: "Plot 1075 Diplomatic Drive, Central Area, Abuja",
    type: "Foreign Embassy"
  },
  {
    name: "British High Commission Abuja",
    category: "UK Visa / Consular Complaints",
    tags: ["embassy", "uk"],
    email: "ukinnigeria@fcdo.gov.uk",
    phone: "+234-9-4622200",
    website: "https://www.gov.uk/world/organisations/british-high-commission-abuja",
    address: "19 Torrens Close, Maitama, Abuja",
    type: "Foreign Embassy"
  },

  // --- TELECOM / CONSUMER ---
  {
    name: "Nigerian Communications Commission (NCC)",
    category: "Telecom / Data / Network Complaints",
    tags: ["telecom", "network", "data", "phone"],
    email: "consumerportal@ncc.gov.ng",
    phone: "622",
    website: "https://ncc.gov.ng",
    address: "423 Aguiyi Ironsi Street, Maitama, Abuja",
    type: "Regulatory Agency"
  },

  // --- BANKING / FINANCE ---
  {
    name: "Central Bank of Nigeria – Consumer Protection",
    category: "Bank / Loan / ATM / Deduction Complaints",
    tags: ["bank", "loan", "atm", "deduction"],
    email: "cpd@cbn.gov.ng",
    phone: "0700 225 5226",
    website: "https://www.cbn.gov.ng",
    address: "Central Business District, Abuja",
    type: "Federal Government"
  }
];

// ========= CLASSIFICATION LOGIC =========

function classifyComplaint(textRaw) {
  const text = (textRaw || "").toLowerCase();

  let classification = "General complaint";
  let advice =
    "You may submit this complaint to the appropriate authority or the Public Complaints Commission.";
  let recommendation = "Include dates, locations, names of people involved and any evidence.";
  const tags = ["general"];

  // Police / brutality
  if (text.includes("police") || text.includes("sars") || text.includes("npf")) {
    classification = "Possible police misconduct / human rights issue";
    advice =
      "You can report this to the National Human Rights Commission, the Police Complaint Response Unit, and the Public Complaints Commission.";
    recommendation =
      "Include station name, officer names (if known), date, time, and any witnesses.";
    tags.push("police", "human_rights", "detention");
  }

  // Detention / prison
  if (text.includes("prison") || text.includes("custody") || text.includes("correctional")) {
    tags.push("prison", "detention", "human_rights");
  }

  // Corruption / bribery
  if (
    text.includes("bribe") ||
    text.includes("brown envelope") ||
    text.includes("settle me") ||
    text.includes("corrupt") ||
    text.includes("embezzle") ||
    text.includes("fraud") ||
    text.includes("419")
  ) {
    classification = "Possible corruption / financial crime";
    advice =
      "You may report this to ICPC for corruption or EFCC for financial crimes, and optionally PCC.";
    recommendation =
      "Describe the person/office involved, amount requested or paid, date, location, and any proof.";
    tags.push("corruption", "fraud", "public_officer", "public_funds");
  }

  // Land / FCDA
  if (
    text.includes("land") ||
    text.includes("plot") ||
    text.includes("allocation") ||
    text.includes("demolition") ||
    text.includes("building approval")
  ) {
    classification = "Land / building / development dispute";
    advice =
      "You may take this to FCDA (for FCT issues), relevant urban development authority, and PCC.";
    recommendation =
      "Attach any allocation letters, approvals, notices, and photos if available.";
    tags.push("land", "building", "fcda", "abuja");
  }

  // Aviation / airline
  if (
    text.includes("flight") ||
    text.includes("airline") ||
    text.includes("airport") ||
    text.includes("cancelled") ||
    text.includes("delayed")
  ) {
    classification = "Aviation / airline consumer complaint";
    advice =
      "You may report this to FAAN (for airport services) and NCAA Consumer Protection (for airline issues).";
    recommendation =
      "Include airline name, flight number, date, ticket details, and what exactly happened.";
    tags.push("aviation", "flight", "airline", "airport");
  }

  // Embassy / abroad
  if (
    text.includes("embassy") ||
    text.includes("visa") ||
    text.includes("consulate") ||
    text.includes("consular") ||
    text.includes("abroad")
  ) {
    classification = "Foreign affairs / embassy / consular issue";
    advice =
      "You may contact the specific embassy/mission and also the Federal Ministry of Foreign Affairs.";
    recommendation =
      "Include country, type of visa/issue, reference numbers and any email correspondence.";
    tags.push("embassy", "foreign", "consular");
  }

  // Telecom
  if (
    text.includes("data") ||
    text.includes("network") ||
    text.includes("call") ||
    text.includes("airtime") ||
    text.includes("glo") ||
    text.includes("mtn") ||
    text.includes("airtel") ||
    text.includes("9mobile")
  ) {
    classification = "Telecom / mobile network complaint";
    advice =
      "First complain to the service provider. If unresolved, escalate to NCC using their consumer contact channels.";
    recommendation =
      "Include phone number, network, dates of the problem, and screenshots or SMS where possible.";
    tags.push("telecom", "network", "phone", "data");
  }

  // Banking
  if (
    text.includes("bank") ||
    text.includes("atm") ||
    text.includes("pos") ||
    text.includes("deduction") ||
    text.includes("debit") ||
    text.includes("loan")
  ) {
    classification = "Banking / financial services complaint";
    advice =
      "Complain first to the bank. If not resolved, escalate to the Central Bank Consumer Protection Department.";
    recommendation =
      "Include bank name, account number (partly masked), transaction references and dates.";
    tags.push("bank", "loan", "atm", "deduction");
  }

  // Human rights keyword override
  if (
    text.includes("torture") ||
    text.includes("beaten") ||
    text.includes("killed") ||
    text.includes("threat") ||
    text.includes("shoot") ||
    text.includes("rape")
  ) {
    if (!tags.includes("human_rights")) tags.push("human_rights");
  }

  return { classification, advice, recommendation, tags };
}

// ========= MATCH INSTITUTIONS BASED ON TAGS =========

function findRelevantInstitutions(tags) {
  const tagSet = new Set(tags);

  const scored = institutions
    .map((inst) => {
      const instTagSet = new Set(inst.tags || []);
      let score = 0;
      instTagSet.forEach((t) => {
        if (tagSet.has(t)) score += 1;
      });
      return { inst, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  // return top 8 best matches
  return scored.slice(0, 8).map((s) => s.inst);
}

// ========= MAIN ANALYZE ENDPOINT =========

app.post("/analyze", (req, res) => {
  try {
    const { text } = req.body || {};

    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "Complaint text is required." });
    }

    const analysis = classifyComplaint(text);
    const institutionsList = findRelevantInstitutions(analysis.tags);

    return res.json({
      received: text,
      classification: analysis.classification,
      advice: analysis.advice,
      recommendation: analysis.recommendation,
      tags: analysis.tags,
      institutions: institutionsList
    });
  } catch (err) {
    console.error("Analyze error:", err);
    res.status(500).json({ error: "Server error while analyzing complaint." });
  }
});

// ========= START SERVER (LOCAL ONLY) =========
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`JusticeBot backend running on port ${PORT}`);
  });
}

module.exports = app;

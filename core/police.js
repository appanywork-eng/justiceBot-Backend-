// core/police.js
// Sector detection + police-specific addressing.

const { textIncludesAny, normaliseOrgName } = require("./helpers");

// SECTOR DETECTION (for petition style selection)
function detectSector(description, inst) {
  const d = (description || "").toLowerCase();
  const primaryName = normaliseOrgName(inst?.primary?.org || "");

  const policeKeywords = [
    "police",
    "sars",
    "swat",
    "dpo",
    "checkpoint",
    "cell",
    "custody",
    "station",
    "anti-kidnapping",
    "anti kidnapping",
    "anti-cultism",
    "detention",
    "igp",
  ];
  if (textIncludesAny(d, policeKeywords) || primaryName.includes("police")) {
    return "police";
  }

  const elecKeywords = [
    "electricity",
    "disco",
    "meter",
    "prepaid",
    "token",
    "transformer",
    "overbilling",
    "over billing",
    "light",
    "power",
  ];
  if (textIncludesAny(d, elecKeywords) || primaryName.includes("electricity")) {
    return "electricity";
  }

  const bankingKeywords = [
    "bank",
    "account",
    "atm",
    "pos",
    "debit",
    "credit",
    "transfer",
    "loan",
    "mortgage",
    "card",
    "dom account",
  ];
  if (textIncludesAny(d, bankingKeywords) || primaryName.includes("bank")) {
    return "banking";
  }

  const healthKeywords = [
    "hospital",
    "clinic",
    "doctor",
    "nurse",
    "midwife",
    "surgery",
    "operation",
    "medical negligence",
    "wrong diagnosis",
    "pharmacy",
    "drug",
    "medication",
  ];
  if (
    textIncludesAny(d, healthKeywords) ||
    primaryName.includes("hospital") ||
    primaryName.includes("clinic")
  ) {
    return "health";
  }

  const telcoKeywords = [
    "mtn",
    "glo",
    "airtel",
    "9mobile",
    "etisalat",
    "network",
    "data bundle",
    "recharge card",
    "call rate",
  ];
  if (
    textIncludesAny(d, telcoKeywords) ||
    primaryName.includes("telecom") ||
    primaryName.includes("ncc")
  ) {
    return "telecom";
  }

  const educationKeywords = [
    "school",
    "student",
    "pupil",
    "university",
    "polytechnic",
    "college",
    "lecturer",
    "teacher",
    "principal",
    "vc",
    "dean",
  ];
  if (
    textIncludesAny(d, educationKeywords) ||
    primaryName.includes("university") ||
    primaryName.includes("polytechnic") ||
    primaryName.includes("college")
  ) {
    return "education";
  }

  // fallback
  return "general";
}

// POLICE ADDRESSING REFINER (CP + IGP "Through")
function refinePoliceInstitutions(description, inst) {
  const out = inst || { primary: null, through: null, ccList: [] };
  if (!Array.isArray(out.ccList)) out.ccList = [];

  const d = (description || "").toLowerCase();

  const STATE_MATCHES = [
    {
      state: "Federal Capital Territory (FCT)",
      command: "FCT Police Command",
      keywords: ["abuja", "gwarinpa", "kubwa", "nyanya", "lugbe", "fct"],
    },
    {
      state: "Kogi State",
      command: "Kogi State Police Command",
      keywords: ["kogi", "okene", "lokoja", "ayegunle"],
    },
    {
      state: "Edo State",
      command: "Edo State Police Command",
      keywords: ["edo", "benin", "ekpoma", "auch", "auchii"],
    },
    {
      state: "Lagos State",
      command: "Lagos State Police Command",
      keywords: ["lagos", "lekki", "oshodi", "ikorodu", "ajah", "ikeja"],
    },
    {
      state: "Rivers State",
      command: "Rivers State Police Command",
      keywords: ["rivers", "port harcourt", "ph city"],
    },
  ];

  let detected = null;
  for (const entry of STATE_MATCHES) {
    if (textIncludesAny(d, entry.keywords)) {
      detected = entry;
      break;
    }
  }

  let emailBackup =
    out.primary && out.primary.email ? out.primary.email : "";

  if (detected) {
    out.primary = {
      org: `Commissioner of Police, ${detected.command}`,
      title: "The Commissioner of Police",
      address: `${detected.command} Headquarters, ${detected.state}, Nigeria.`,
      email: emailBackup,
    };
  } else if (
    !out.primary ||
    !normaliseOrgName(out.primary.org || "").includes("police")
  ) {
    out.primary = {
      org: "Commissioner of Police, State Police Command",
      title: "The Commissioner of Police",
      address: "State Police Command Headquarters, Nigeria.",
      email: emailBackup,
    };
  }

  const throughEmail =
    out.through && out.through.email ? out.through.email : "";

  out.through = {
    org: "Inspector-General of Police, Nigeria Police Force",
    title: "The Inspector-General of Police",
    address: "Force Headquarters, Louis Edet House, Abuja, Nigeria.",
    email: throughEmail,
  };

  return out;
}

module.exports = {
  detectSector,
  refinePoliceInstitutions,
};

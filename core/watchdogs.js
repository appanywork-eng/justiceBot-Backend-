// core/watchdogs.js
// PCC + NHRC + sector-wide supervisors.

const { textIncludesAny, normaliseOrgName } = require("./helpers");

// GLOBAL WATCHDOGS – PCC + NHRC
function applyWatchdogs(description, inst) {
  const out = inst || {};
  if (!Array.isArray(out.ccList)) out.ccList = [];

  function add(obj) {
    if (!obj || !obj.org) return;
    const key = normaliseOrgName(obj.org);
    if (!key) return;
    const exists = out.ccList.some(
      (c) => normaliseOrgName(c.org) === key
    );
    if (!exists) out.ccList.push(obj);
  }

  // PCC ALWAYS (administrative injustice watchdog)
  add({
    org: "Public Complaints Commission",
    email: "complaints@pcc.gov.ng,info@pcc.gov.ng",
    address: "25 Aguiyi Ironsi Street, Maitama, Abuja, Nigeria.",
    title: "The Honourable Chief Commissioner",
  });

  // NHRC if human rights related
  const d = (description || "").toLowerCase();
  const rights = [
    "human right",
    "brutality",
    "torture",
    "unlawful detention",
    "illegal detention",
    "extrajudicial",
    "extra judicial",
    "killing",
    "genocide",
    "discrimination",
    "rape",
    "sexual assault",
    "domestic violence",
    "violence",
    "oppression",
    "degrading treatment",
    "threat to life",
  ];
  if (rights.some((x) => d.includes(x))) {
    add({
      org: "National Human Rights Commission",
      email: "info@nhrc.gov.ng",
      address: "19 Aguiyi Ironsi Street, Maitama, Abuja, Nigeria.",
      title: "The Executive Secretary",
    });
  }

  return out;
}

// A10 SUPERVISORY ESCALATION BY SECTOR (NIGERIA FOCUS)
function applySectorSupervisors(description, inst) {
  const out = inst || {};
  if (!Array.isArray(out.ccList)) out.ccList = [];

  const d = (description || "").toLowerCase();
  const primaryName = normaliseOrgName(out.primary?.org || "");

  function addCc(obj) {
    if (!obj || !obj.org) return;
    const key = normaliseOrgName(obj.org);
    if (!key) return;
    const exists = out.ccList.some(
      (c) => normaliseOrgName(c.org) === key
    );
    if (!exists) out.ccList.push(obj);
  }

  // ---- POLICE & SECURITY ----
  const policeKeywords = [
    "police",
    "sars",
    "swat",
    "dpo",
    "cell",
    "custody",
    "station",
    "anti-kidnapping",
    "anti kidnapping",
    "anti-cultism",
    "detention",
    "igp",
    "checkpoint",
  ];

  const isPolice =
    textIncludesAny(d, policeKeywords) || primaryName.includes("police");

  if (isPolice) {
    addCc({
      org: "Inspector-General of Police, Nigeria Police Force",
      email: "",
      address: "Louis Edet House, Shehu Shagari Way, CBD, Abuja, Nigeria.",
      title: "Inspector-General of Police",
    });

    addCc({
      org: "Police Service Commission",
      email: "",
      address: "PSC Headquarters, Abuja, Nigeria.",
      title: "",
    });
  }

  // ---- HEALTH SECTOR ----
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
    "injection",
    "laboratory",
    "lab result",
  ];

  const isHealth =
    textIncludesAny(d, healthKeywords) ||
    primaryName.includes("hospital") ||
    primaryName.includes("clinic") ||
    primaryName.includes("medical");

  if (isHealth) {
    addCc({
      org: "Federal Ministry of Health",
      email: "",
      address: "Federal Secretariat, Abuja, Nigeria.",
      title: "Honourable Minister of Health",
    });

    addCc({
      org: "Medical and Dental Council of Nigeria",
      email: "",
      address: "Abuja, Nigeria.",
      title: "",
    });

    const drugWords = [
      "drug",
      "medication",
      "fake medicine",
      "fake drug",
      "expired drug",
      "pharmacy",
      "injection",
      "syrup",
    ];
    if (textIncludesAny(d, drugWords)) {
      addCc({
        org: "National Agency for Food and Drug Administration and Control (NAFDAC)",
        email: "",
        address: "NAFDAC Headquarters, Abuja, Nigeria.",
        title: "",
      });
    }

    const outbreakWords = [
      "cholera",
      "outbreak",
      "epidemic",
      "pandemic",
      "infectious disease",
      "ebola",
    ];
    if (textIncludesAny(d, outbreakWords)) {
      addCc({
        org: "Nigeria Centre for Disease Control and Prevention (NCDC)",
        email: "",
        address: "Abuja, Nigeria.",
        title: "",
      });
    }
  }

  // ---- AVIATION ----
  const aviationKeywords = [
    "flight",
    "airline",
    "airport",
    "boarding pass",
    "aircraft",
    "plane",
    "runway",
    "lost luggage",
    "baggage",
    "tarmac",
  ];

  const isAviation =
    textIncludesAny(d, aviationKeywords) ||
    primaryName.includes("airline") ||
    primaryName.includes("airport") ||
    primaryName.includes("aviation");

  if (isAviation) {
    addCc({
      org: "Nigerian Civil Aviation Authority (NCAA)",
      email: "",
      address: "Murtala Muhammed Airport, Lagos, Nigeria.",
      title: "",
    });

    addCc({
      org: "Federal Airports Authority of Nigeria (FAAN)",
      email: "",
      address: "FAAN Headquarters, Lagos, Nigeria.",
      title: "",
    });

    addCc({
      org: "Federal Ministry of Aviation",
      email: "",
      address: "Federal Secretariat, Abuja, Nigeria.",
      title: "Honourable Minister of Aviation",
    });
  }

  // ---- JUDICIARY ----
  const judiciaryKeywords = [
    "court",
    "judge",
    "magistrate",
    "justice",
    "bail",
    "registry",
    "judicial",
    "appeal",
  ];

  const isJudiciary =
    textIncludesAny(d, judiciaryKeywords) ||
    primaryName.includes("court") ||
    primaryName.includes("judicial") ||
    primaryName.includes("registry");

  if (isJudiciary) {
    addCc({
      org: "National Judicial Council (NJC)",
      email: "",
      address: "Abuja, Nigeria.",
      title: "",
    });

    addCc({
      org: "Nigerian Bar Association",
      email: "",
      address:
        "NBA House, 4 Ladi Kwali Street, Wuse Zone 4, Abuja, Nigeria.",
      title: "",
    });
  }

  // ---- BANKING & FINANCIAL ----
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
    "current account",
    "savings account",
    "chargeback",
  ];

  const isBanking =
    textIncludesAny(d, bankingKeywords) ||
    primaryName.includes("bank") ||
    primaryName.includes("microfinance");

  if (isBanking) {
    addCc({
      org: "Central Bank of Nigeria – Consumer Protection Department",
      email: "",
      address: "Central Bank of Nigeria, Abuja, Nigeria.",
      title: "",
    });

    addCc({
      org: "Nigeria Deposit Insurance Corporation (NDIC)",
      email: "",
      address: "NDIC Headquarters, Abuja, Nigeria.",
      title: "",
    });

    addCc({
      org: "Federal Competition and Consumer Protection Commission (FCCPC)",
      email: "",
      address: "FCCPC Headquarters, Abuja, Nigeria.",
      title: "",
    });
  }

  // ---- TELECOMMUNICATIONS ----
  const telcoKeywords = [
    "mtn",
    "glo",
    "airtel",
    "9mobile",
    "etisalat",
    "data bundle",
    "call rate",
    "network",
    "no service",
    "dropped call",
    "sms",
    "ussd",
    "recharge card",
  ];

  const isTelecom =
    textIncludesAny(d, telcoKeywords) ||
    primaryName.includes("telecom") ||
    primaryName.includes("mtn") ||
    primaryName.includes("airtel") ||
    primaryName.includes("glo") ||
    primaryName.includes("9mobile");

  if (isTelecom) {
    addCc({
      org: "Nigerian Communications Commission (NCC)",
      email: "",
      address: "NCC Headquarters, Abuja, Nigeria.",
      title: "",
    });

    addCc({
      org: "Federal Ministry of Communications, Innovation and Digital Economy",
      email: "",
      address: "Abuja, Nigeria.",
      title: "",
    });
  }

  // ---- EDUCATION ----
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
    "expulsion",
    "suspension",
    "fee",
    "tuition",
  ];

  const isEducation =
    textIncludesAny(d, educationKeywords) ||
    primaryName.includes("university") ||
    primaryName.includes("polytechnic") ||
    primaryName.includes("college") ||
    primaryName.includes("school");

  if (isEducation) {
    addCc({
      org: "Federal Ministry of Education",
      email: "",
      address: "Federal Secretariat, Abuja, Nigeria.",
      title: "Honourable Minister of Education",
    });

    addCc({
      org: "National Universities Commission (NUC)",
      email: "",
      address: "Abuja, Nigeria.",
      title: "",
    });

    addCc({
      org: "National Commission for Colleges of Education (NCCE)",
      email: "",
      address: "Abuja, Nigeria.",
      title: "",
    });

    addCc({
      org: "Universal Basic Education Commission (UBEC)",
      email: "",
      address: "Abuja, Nigeria.",
      title: "",
    });
  }

  // ---- ELECTRICITY SUPERVISOR EXTRA (if not already in JSON) ----
  const isElectricity =
    textIncludesAny(d, ["electricity", "disco", "meter", "prepaid", "token"]) ||
    primaryName.includes("electricity") ||
    primaryName.includes("distribution company") ||
    primaryName.includes("disco");

  if (isElectricity) {
    addCc({
      org: "Federal Ministry of Power",
      email: "",
      address: "Federal Secretariat, Abuja, Nigeria.",
      title: "Honourable Minister of Power",
    });
  }

  return out;
}

module.exports = {
  applyWatchdogs,
  applySectorSupervisors,
};

// a8Engine.js
"use strict";

/**
 * JUSTICEBOT A8 ENGINE (v1 skeleton)
 * ----------------------------------
 * - Pure JS, no external API calls.
 * - 3 layers:
 *    1. classifyCase()    -> figure out type of issue
 *    2. buildRouting()    -> Primary / Through / CC
 *    3. buildPetition()   -> final text with proper structure
 *
 * You can keep expanding RULES + INSTITUTIONS as we go.
 */

// ---------- Helpers ----------

function norm(text) {
  return (text || "").toLowerCase();
}

function has(text, ...needles) {
  const t = norm(text);
  return needles.some((n) => t.includes(n.toLowerCase()));
}

// ---------- Institutions (safe, generic but usable) ----------

const INSTITUTIONS = {
  PCC: {
    label: "Public Complaints Commission",
    address: "25 Aguiyi Ironsi Street, Maitama, Abuja, Nigeria.",
  },
  NHRC: {
    label: "National Human Rights Commission",
    address: "Abuja, Nigeria.",
  },
  NERC: {
    label: "Nigerian Electricity Regulatory Commission (NERC)",
    address: "Abuja, Nigeria.",
  },
  AEDC: {
    label: "Abuja Electricity Distribution Company (AEDC)",
    address: "Abuja, Nigeria.",
  },
  MTN: {
    label: "MTN Nigeria Communications Plc",
    address: "Victoria Island, Lagos, Nigeria.",
  },
  NCC: {
    label: "Nigerian Communications Commission (NCC)",
    address: "Abuja, Nigeria.",
  },
  CBN: {
    label: "Central Bank of Nigeria (CBN)",
    address: "Abuja, Nigeria.",
  },
  FCCPC: {
    label: "Federal Competition and Consumer Protection Commission (FCCPC)",
    address: "Abuja, Nigeria.",
  },
  GTB: {
    label: "Guaranty Trust Bank Plc",
    address: "Victoria Island, Lagos, Nigeria.",
  },
  DSTV: {
    label: "MultiChoice Nigeria (DStv)",
    address: "Victoria Island, Lagos, Nigeria.",
  },
  POLICE_IGP: {
    label: "Inspector General of Police, Nigeria Police Force",
    address: "Louis Edet House, Garki, Abuja, Nigeria.",
  },
  PSC: {
    label: "Chairman, Police Service Commission",
    address: "Abuja, Nigeria.",
  },
  LABOUR_MIN: {
    label: "Federal Ministry of Labour and Employment",
    address: "Federal Secretariat, Abuja, Nigeria.",
  },
  NICN: {
    label: "President, National Industrial Court of Nigeria",
    address: "Abuja, Nigeria.",
  },
  HOUSING_MIN: {
    label: "Federal Ministry of Housing and Urban Development",
    address: "Federal Secretariat, Abuja, Nigeria.",
  },
  HEALTH_MIN: {
    label: "Federal Ministry of Health",
    address: "Federal Secretariat, Abuja, Nigeria.",
  },
  PTAD: {
    label: "Pension Transitional Arrangement Directorate (PTAD)",
    address: "Abuja, Nigeria.",
  },
  PENCOM: {
    label: "National Pension Commission (PenCom)",
    address: "Abuja, Nigeria.",
  },

  // International / advocacy
  US_PRESIDENT: {
    label: "President of the United States of America",
    address: "The White House, Washington, D.C., USA.",
  },
  US_CONGRESS: {
    label: "United States Congress",
    address: "Washington, D.C., USA.",
  },
  UK_PARLIAMENT: {
    label: "UK Parliament",
    address: "London, United Kingdom.",
  },
  EU_PARLIAMENT: {
    label: "European Parliament",
    address: "Brussels / Strasbourg.",
  },
  UN_HR: {
    label: "United Nations Human Rights Council",
    address: "Geneva, Switzerland.",
  },
  AU: {
    label: "African Union Commission",
    address: "Addis Ababa, Ethiopia.",
  },
  ECOWAS: {
    label: "ECOWAS Commission",
    address: "Abuja, Nigeria.",
  },
  COMMONWEALTH: {
    label: "Commonwealth Secretariat",
    address: "London, United Kingdom.",
  },
};

// ---------- Classification Layer ----------

function classifyCase(rawText, country = "Nigeria") {
  const text = norm(rawText);

  // Special iconic political-detention case (e.g. Nnamdi Kanu style)
  if (has(text, "nnamdi kanu", "mazi nnamdi")) {
    return {
      id: "POLITICAL_DETENTION_ICONIC",
      sector: "HUMAN_RIGHTS",
      international: true,
      description: "High-profile political detention with global advocacy angle.",
    };
  }

  // Electricity: non-installation or billing
  if (has(text, "prepaid meter", "meter", "a e d c", "aedc", "electricity", "power")) {
    if (has(text, "not install", "no come", "has refused", "since")) {
      return {
        id: "POWER_NON_INSTALLATION_METER",
        sector: "POWER",
        description: "DISCO collected money but failed to install prepaid meter.",
      };
    }
    return {
      id: "POWER_GENERAL",
      sector: "POWER",
      description: "General electricity / billing complaint.",
    };
  }

  // Telecom (MTN example)
  if (has(text, "mtn", "glo", "airtel", "9mobile", "sim swap", "data", "network")) {
    if (has(text, "sim swap", "sim-swapped")) {
      return {
        id: "TELECOM_SIM_SWAP_FRAUD",
        sector: "TELECOM",
        description: "SIM swap fraud leading to bank loss.",
      };
    }
    return {
      id: "TELECOM_GENERAL",
      sector: "TELECOM",
      description: "General telecom complaint.",
    };
  }

  // Bank deductions
  if (has(text, "guarantee trust bank", "gtb", "gt bank", "bank", "deduction", "debit", "charges")) {
    return {
      id: "BANK_UNAUTHORISED_DEDUCTION",
      sector: "BANKING",
      description: "Unauthorised deductions or repeated charges.",
    };
  }

  // Pension not paid to widow
  if (has(text, "pension", "ptad", "pencom") && has(text, "husband", "died", "death", "widow")) {
    return {
      id: "PENSION_DEATH_BENEFIT_DELAY",
      sector: "PENSIONS",
      description: "Non-payment of death benefits / pension to next of kin.",
    };
  }

  // Salary not paid / labour
  if (has(text, "salary", "sack", "threatened to sack", "three months", "3 months")) {
    return {
      id: "LABOUR_UNPAID_SALARY",
      sector: "LABOUR",
      description: "Employer refusing to pay salary.",
    };
  }

  // Landlord issues
  if (has(text, "landlord", "tenancy", "rent") || has(text, "entered my apartment", "removed the front door")) {
    return {
      id: "HOUSING_LANDLORD_HARASSMENT",
      sector: "HOUSING",
      description: "Landlord harassment / illegal eviction.",
    };
  }

  // DStv example
  if (has(text, "dstv", "multichoice")) {
    return {
      id: "DSTV_UNAUTHORISED_CHARGES",
      sector: "MEDIA",
      description: "Unauthorised charges on DStv account.",
    };
  }

  // Hospital negligence (Maitama labour case)
  if (has(text, "hospital", "doctor", "labour", "labour ward", "unattended", "neglect")) {
    return {
      id: "HEALTH_NEGLIGENCE",
      sector: "HEALTH",
      description: "Hospital negligence / non-attendance.",
    };
  }

  // Police extortion (SARS case)
  if (has(text, "sars", "police", "beating me", "threatening me", "extortion", "collected")) {
    return {
      id: "POLICE_BRUTALITY_EXTORTION",
      sector: "POLICE",
      description: "Police / SARS extortion and brutality.",
    };
  }

  // Immigration dismissal
  if (has(text, "immigration", "dismissed", "without query", "without panel")) {
    return {
      id: "IMMIGRATION_DISMISSAL_DUE_PROCESS",
      sector: "IMMIGRATION",
      description: "Dismissal without due process.",
    };
  }

  // Fallback generic Nigeria admin injustice
  return {
    id: "GENERIC_ADMIN_INJUSTICE",
    sector: "GENERAL",
    description: "Generic administrative injustice.",
  };
}

// ---------- Routing Layer ----------

function buildRouting(classification, country = "Nigeria") {
  const c = classification.id;

  // base object
  const routing = {
    primary: [],
    through: [],
    cc: [],
  };

  const addPrimary = (inst) => routing.primary.push(INSTITUTIONS[inst]);
  const addThrough = (inst) => routing.through.push(INSTITUTIONS[inst]);
  const addCC = (inst) => routing.cc.push(INSTITUTIONS[inst]);

  switch (c) {
    case "POWER_NON_INSTALLATION_METER":
    case "POWER_GENERAL":
      addPrimary("AEDC");
      addThrough("NERC");
      addCC("PCC");
      break;

    case "TELECOM_SIM_SWAP_FRAUD":
      addPrimary("MTN");
      addThrough("NCC");
      addCC("CBN");
      addCC("FCCPC");
      addCC("PCC");
      break;

    case "TELECOM_GENERAL":
      addPrimary("MTN");
      addThrough("NCC");
      addCC("PCC");
      break;

    case "BANK_UNAUTHORISED_DEDUCTION":
      addPrimary("GTB");
      addThrough("CBN");
      addCC("FCCPC");
      addCC("PCC");
      break;

    case "PENSION_DEATH_BENEFIT_DELAY":
      addPrimary("PTAD");
      addThrough("PENCOM");
      addCC("PCC");
      break;

    case "LABOUR_UNPAID_SALARY":
      // Send to Industrial Court via Labour Ministry
      addPrimary("NICN");
      addThrough("LABOUR_MIN");
      addCC("NHRC");
      addCC("PCC");
      break;

    case "HOUSING_LANDLORD_HARASSMENT":
      addPrimary("HOUSING_MIN");
      addCC("NHRC");
      addCC("FCCPC");
      addCC("PCC");
      break;

    case "DSTV_UNAUTHORISED_CHARGES":
      addPrimary("DSTV");
      addThrough("NCC"); // via broadcast regulator logic you can refine later
      addCC("FCCPC");
      addCC("PCC");
      break;

    case "HEALTH_NEGLIGENCE":
      addPrimary("HEALTH_MIN");
      addCC("NHRC");
      addCC("FCCPC");
      addCC("PCC");
      break;

    case "POLICE_BRUTALITY_EXTORTION":
      addPrimary("POLICE_IGP");
      addThrough("PSC");
      addCC("NHRC");
      addCC("PCC");
      break;

    case "IMMIGRATION_DISMISSAL_DUE_PROCESS":
      addPrimary("POLICE_IGP"); // you may later add dedicated NIS + Interior Ministry
      addCC("NHRC");
      addCC("PCC");
      break;

    case "POLITICAL_DETENTION_ICONIC":
      addPrimary("US_PRESIDENT");

      addCC("US_CONGRESS");
      addCC("UK_PARLIAMENT");
      addCC("EU_PARLIAMENT");
      addCC("UN_HR");
      addCC("AU");
      addCC("ECOWAS");
      addCC("COMMONWEALTH");
      addCC("NHRC");
      addCC("PCC");
      break;

    default:
      // generic: just PCC + NHRC
      addPrimary("PCC");
      addCC("NHRC");
  }

  return routing;
}

// ---------- Petition Body Builder Layer ----------

function buildPetitionBody({ complainant, story, classification, routing }) {
  const {
    fullName,
    email,
    phone,
    address,
    dateString = new Date().toLocaleDateString("en-NG", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
  } = complainant || {};

  const primary = routing.primary[0]; // main addressee

  // Subject
  let subject = "COMPLAINT";
  switch (classification.id) {
    case "POWER_NON_INSTALLATION_METER":
      subject = "COMPLAINT ABOUT NON-INSTALLATION OF PREPAID METER";
      break;
    case "BANK_UNAUTHORISED_DEDUCTION":
      subject = "COMPLAINT ABOUT UNAUTHORISED DEDUCTIONS FROM MY BANK ACCOUNT";
      break;
    case "TELECOM_SIM_SWAP_FRAUD":
      subject = "COMPLAINT ABOUT SIM SWAP FRAUD AND UNAUTHORISED WITHDRAWALS";
      break;
    case "DS TV_UNAUTHORISED_CHARGES":
    case "DSTV_UNAUTHORISED_CHARGES":
      subject = "COMPLAINT ABOUT UNAUTHORISED CHARGES ON MY DSTV ACCOUNT";
      break;
    case "LABOUR_UNPAID_SALARY":
      subject = "COMPLAINT ABOUT NON-PAYMENT OF SALARY";
      break;
    case "HOUSING_LANDLORD_HARASSMENT":
      subject = "COMPLAINT ABOUT UNLAWFUL ENTRY AND HARASSMENT BY LANDLORD";
      break;
    case "HEALTH_NEGLIGENCE":
      subject = "COMPLAINT ABOUT MEDICAL NEGLIGENCE";
      break;
    case "PENSION_DEATH_BENEFIT_DELAY":
      subject = "COMPLAINT ABOUT NON-PAYMENT OF PENSION / DEATH BENEFITS";
      break;
    case "POLICE_BRUTALITY_EXTORTION":
      subject = "COMPLAINT ABOUT POLICE BRUTALITY AND EXTORTION";
      break;
    case "POLITICAL_DETENTION_ICONIC":
      subject = "APPEAL FOR INTERVENTION IN POLITICAL DETENTION CASE";
      break;
  }

  // Format routing text
  const formatParty = (inst) =>
    inst ? `${inst.label}\n${inst.address}` : "";

  const throughBlock =
    routing.through.length > 0
      ? "Through:\n" +
        routing.through.map(formatParty).join("\n\n") +
        "\n\n"
      : "";

  const ccBlock =
    routing.cc.length > 0
      ? "CC:\n" + routing.cc.map(formatParty).join("\n\n") + "\n\n"
      : "";

  const header = `${fullName || ""}\n${email ? "Email: " + email + "\n" : ""}${
    phone ? "Phone: " + phone + "\n" : ""
  }${address ? address + "\n" : ""}${dateString}\n\n${formatParty(primary)}\n\n${throughBlock}${ccBlock}RE: ${subject}\n\n`;

  const intro = `I, ${fullName ||
    "the undersigned"}, respectfully write to lodge a formal complaint regarding the following matter:\n\n`;

  const facts = `FACTS OF THE CASE\n${story.trim()}\n\n`;

  const request = `RELIEFS SOUGHT\nIn view of the above, I humbly request that your esteemed office:\n` +
    `1. Investigate this complaint promptly and thoroughly.\n` +
    `2. Ensure that my rights and legitimate interests are protected in line with applicable laws and regulations.\n` +
    `3. Direct the appropriate authorities or parties to remedy the injustice described above.\n\n`;

  const closing =
    "I shall be grateful for your kind and urgent intervention in this matter.\n\n" +
    "Yours faithfully,\n\n" +
    `${fullName || ""}\n`;

  return header + intro + facts + request + closing;
}

// ---------- Main exposed API ----------

/**
 * generatePetitionA8
 * @param {object} input
 *  - story: string
 *  - complainant: { fullName, email, phone, address, dateString }
 *  - country: string
 *
 * Returns:
 *  {
 *    classification,
 *    routing,
 *    petitionText
 *  }
 */
function generatePetitionA8(input) {
  const { story, complainant, country } = input;

  if (!story || story.trim().length < 10) {
    throw new Error("Story text is too short or missing.");
  }

  const classification = classifyCase(story, country);
  const routing = buildRouting(classification, country);
  const petitionText = buildPetitionBody({
    complainant,
    story,
    classification,
    routing,
  });

  return {
    classification,
    routing,
    petitionText,
  };
}

module.exports = {
  generatePetitionA8,
  classifyCase,
  buildRouting,
  buildPetitionBody,
  INSTITUTIONS,
};

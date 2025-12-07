// a8Engine.js
"use strict";

/**
 * JUSTICEBOT A8 ENGINE – WORLD BRAIN v2
 * -------------------------------------
 * - Uses institutions.json as the main "world directory"
 * - Classifies the complaint (bank, police, electricity, etc.)
 * - Detects state (Delta, Kogi, etc.) when possible
 * - Builds routing: primaryInstitution, throughInstitution, ccList
 * - Uses OpenAI ONLY to write the petition text (no JSON parsing)
 */

const OpenAI = require("openai");

// ---------------------------------------------
// OPENAI CLIENT
// ---------------------------------------------
let openai = null;
try {
  if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.log("[A8] OpenAI client initialised (World Brain v2)");
  } else {
    console.warn("[A8] OPENAI_API_KEY not set – A8 will use fallback petition only.");
  }
} catch (err) {
  console.error("[A8] Error initialising OpenAI client:", err);
  openai = null;
}

// ---------------------------------------------
// Helpers: text, safe getters
// ---------------------------------------------
function norm(text) {
  return (text || "").toLowerCase();
}

function has(text, ...needles) {
  const t = norm(text);
  return needles.some((n) => t.includes(n.toLowerCase()));
}

function get(obj, path, def = null) {
  try {
    return path.split(".").reduce((o, k) => (o && o[k] !== undefined ? o[k] : null), obj) ?? def;
  } catch {
    return def;
  }
}

function cloneInstitution(i) {
  if (!i || typeof i.org !== "string") return null;
  return {
    org: i.org || "",
    title: i.title || "",
    address: i.address || "",
    email: i.email || "",
    phone: i.phone || ""
  };
}

// Remove duplicates (by org name)
function dedupeInstitutions(list) {
  const seen = new Set();
  const out = [];
  for (const inst of list) {
    if (!inst || !inst.org) continue;
    const key = inst.org.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(inst);
    }
  }
  return out;
}

// Build routing summary string
function buildRoutingSummary(primary, through, ccList) {
  const parts = [];
  if (primary && primary.org) parts.push(`Primary: ${primary.org}`);
  if (through && through.org) parts.push(`Through: ${through.org}`);
  if (Array.isArray(ccList) && ccList.length) {
    parts.push(
      "CC: " +
        ccList
          .filter((c) => c && c.org)
          .map((c) => c.org)
          .join("; ")
    );
  }
  return parts.length ? parts.join(" | ") : null;
}

// ---------------------------------------------
// STATE DETECTION – basic starter
// ---------------------------------------------
function detectState(description) {
  const t = norm(description);

  // NOTE: This is a starter map. You can expand it over time.
  const map = [
    { state: "delta", keywords: ["warri", "asaba", "sapele", "ughelli", "okwa"] },
    { state: "edo", keywords: ["benin city", "benin-city", "benin ", "ekpoma", "igbinedion", "ubiaja"] },
    { state: "kogi", keywords: ["lokoja", "okene", "kogi", "kabba", "dekin"] },
    { state: "lagos", keywords: ["lagos", "ikeja", "oshodi", "ajah", "lekki", "ikorodu"] },
    { state: "abuja_fct", keywords: ["abuja", "maitama", "gwarinpa", "kubwa", "garki", "wuse"] },
    { state: "rivers", keywords: ["port harcourt", "ph", "obio akpor", "eleme"] },
    { state: "oyo", keywords: ["ibadan", "oyo town"] },
    { state: "kaduna", keywords: ["kaduna", "zaria"] },
    { state: "kano", keywords: ["kano", "tarauni", "dawanau"] },
    { state: "anambra", keywords: ["awka", "onitsha", "nnewi"] },
    { state: "enugu", keywords: ["enugu"] },
    { state: "imo", keywords: ["owerri", "imo"] }
  ];

  for (const entry of map) {
    if (has(t, ...entry.keywords)) return entry.state;
  }

  // Fallback – check for direct state name keyword
  const stateNames = {
    abia: "abia",
    adamawa: "adamawa",
    akwa_ibom: "akwa ibom",
    anambra: "anambra",
    bauchi: "bauchi",
    bayelsa: "bayelsa",
    benue: "benue",
    borno: "borno",
    cross_river: "cross river",
    delta: "delta",
    ebonyi: "ebonyi",
    edo: "edo",
    ekiti: "ekiti",
    enugu: "enugu",
    gombe: "gombe",
    imo: "imo",
    jigawa: "jigawa",
    kaduna: "kaduna",
    kano: "kano",
    katsina: "katsina",
    kebbi: "kebbi",
    kogi: "kogi",
    kwara: "kwara",
    lagos: "lagos",
    nasarawa: "nasarawa",
    niger: "niger",
    ogun: "ogun",
    ondo: "ondo",
    osun: "osun",
    oyo: "oyo",
    plateau: "plateau",
    rivers: "rivers",
    sokoto: "sokoto",
    taraba: "taraba",
    yobe: "yobe",
    zamfara: "zamfara"
  };

  for (const [key, label] of Object.entries(stateNames)) {
    if (t.includes(label)) {
      return key;
    }
  }

  // FCT special
  if (has(t, "fct", "f.c.t")) return "abuja_fct";

  return null;
}

// ---------------------------------------------
// CLASSIFICATION – what type of complaint is this?
// ---------------------------------------------
function classifyCase(description) {
  const text = norm(description);

  // Political / iconic detention (e.g. Nnamdi Kanu)
  if (has(text, "nnamdi kanu", "mazi nnamdi")) {
    return {
      id: "POLITICAL_DETENTION_ICONIC",
      sector: "HUMAN_RIGHTS",
      internationalAdvocacy: true
    };
  }

  // Electricity
  if (has(text, "electricity", "light", "disco", "power", "meter", "prepaid", "token", "overbilling", "over billing")) {
    if (has(text, "meter", "prepaid meter", "no install", "not install", "has refused", "paid for meter")) {
      return {
        id: "POWER_NON_INSTALLATION_METER",
        sector: "POWER",
        internationalAdvocacy: false
      };
    }
    return {
      id: "POWER_GENERAL",
      sector: "POWER",
      internationalAdvocacy: false
    };
  }

  // Bank
  if (has(text, "gtbank", "guaranty trust", "gtb", "bank", "account number", "unauthorized deduction", "illegal deduction", "excess charges", "atm card", "card")) {
    return {
      id: "BANK_UNAUTHORISED_DEDUCTION",
      sector: "BANKING",
      internationalAdvocacy: false
    };
  }

  // Telecom / SIM
  if (has(text, "mtn", "glo", "airtel", "9mobile", "etisalat", "sim swap", "network", "data bundle", "data plan", "call rate")) {
    if (has(text, "sim swap", "sim-swapped", "fraud", "bank debit", "otp", "one time password")) {
      return {
        id: "TELECOM_SIM_SWAP_FRAUD",
        sector: "TELECOM",
        internationalAdvocacy: false
      };
    }
    return {
      id: "TELECOM_GENERAL",
      sector: "TELECOM",
      internationalAdvocacy: false
    };
  }

  // Police / SARS / brutality
  if (has(text, "police", "sars", "fsars", "officer", "checkpoint", "beating", "torture", "extortion", "collected", "gun")) {
    return {
      id: "POLICE_BRUTALITY_EXTORTION",
      sector: "POLICE",
      internationalAdvocacy: false
    };
  }

  // Labour / salary
  if (has(text, "salary", "sack", "threatened to sack", "3 months", "three months", "not paid", "outstanding salary", "termination", "dismissal")) {
    return {
      id: "LABOUR_UNPAID_SALARY",
      sector: "LABOUR",
      internationalAdvocacy: false
    };
  }

  // Landlord / tenancy
  if (has(text, "landlord", "tenancy", "tenant", "rent", "quit notice", "eviction", "removed the front door", "changed the lock")) {
    return {
      id: "HOUSING_LANDLORD_HARASSMENT",
      sector: "HOUSING",
      internationalAdvocacy: false
    };
  }

  // Medical negligence
  if (has(text, "hospital", "clinic", "doctor", "nurse", "labour ward", "delivery", "operation", "surgery", "neglect", "left unattended")) {
    return {
      id: "HEALTH_NEGLIGENCE",
      sector: "HEALTH",
      internationalAdvocacy: false
    };
  }

  // Pension / death benefit
  if (has(text, "pension", "ptad", "pencom", "gratuity", "death benefits", "next of kin", "widow", "retiree")) {
    return {
      id: "PENSION_DEATH_BENEFIT_DELAY",
      sector: "PENSIONS",
      internationalAdvocacy: false
    };
  }

  // General human-rights / long detention / torture / discrimination
  if (
    has(
      text,
      "human rights",
      "torture",
      "inhuman",
      "degrading treatment",
      "extra judicial",
      "extrajudicial",
      "illegal detention",
      "unlawful detention",
      "threat to life",
      "harassment",
      "arbitrary arrest",
      "political persecution",
      "ethnic cleansing"
    )
  ) {
    return {
      id: "GENERAL_HUMAN_RIGHTS",
      sector: "HUMAN_RIGHTS",
      internationalAdvocacy: true
    };
  }

  // Fallback – generic administrative injustice in Nigeria
  return {
    id: "GENERIC_ADMIN_INJUSTICE",
    sector: "GENERAL",
    internationalAdvocacy: false
  };
}

// ---------------------------------------------
// ROUTING – build primary / through / cc from institutions.json
// ---------------------------------------------
function buildRouting(classification, description, institutionsJson) {
  const national = get(institutionsJson, "national", {}) || {};
  const states = get(institutionsJson, "states", {}) || {};
  const discos = get(institutionsJson, "discos", {}) || {};
  const international = get(institutionsJson, "international", {}) || {};
  const ngos = get(institutionsJson, "ngos", {}) || {};
  const privateSector = get(institutionsJson, "private_sector", {}) || {};

  const stateKey = detectState(description);
  const stateBlock = stateKey ? states[stateKey] : null;

  const routing = {
    primary: null,
    through: null,
    cc: []
  };

  const addPrimary = (inst) => {
    const c = cloneInstitution(inst);
    if (c && !routing.primary) routing.primary = c;
  };

  const addThrough = (inst) => {
    const c = cloneInstitution(inst);
    if (c && !routing.through) routing.through = c;
  };

  const addCC = (inst) => {
    const c = cloneInstitution(inst);
    if (c) routing.cc.push(c);
  };

  // Shortcuts
  const PCC = cloneInstitution(national.PCC);
  const NHRC = cloneInstitution(national.NHRC);
  const CBN_CPD = cloneInstitution(national.CBN_CPD);
  const FCCPC = cloneInstitution(national.FCCPC);
  const NERC = cloneInstitution(national.NERC);
  const NCC = cloneInstitution(national.NCC);
  const IGP = cloneInstitution(national.POLICE_IGP);
  const PSC = cloneInstitution(national.PSC);
  const PENCOM = cloneInstitution(national.PENCOM);
  const PTAD = cloneInstitution(national.PTAD);

  const discosList = discos || {};
  const banks = get(privateSector, "banks", {}) || {};
  const telcos = get(privateSector, "telecom", {}) || {};
  const media = get(privateSector, "media", {}) || {};

  const GTBANK = cloneInstitution(banks.GTBANK);
  const MTN = cloneInstitution(telcos.MTN);
  const DSTV = cloneInstitution(media.DSTV);

  // International
  const UN_HRC = cloneInstitution(international.UN_HRC);
  const UN_WG_AD = cloneInstitution(international.UN_WORKING_GROUP_AD);
  const AU = cloneInstitution(international.AU_COMMISSION);
  const ECOWAS = cloneInstitution(international.ECOWAS_COMMISSION);
  const EU_DROI = cloneInstitution(international.EU_PARLIAMENT_DROI);
  const UK_JCHR = cloneInstitution(international.UK_PARLIAMENT_JCHR);
  const US_HFAC = cloneInstitution(international.US_CONGRESS_HFAC);
  const US_SFR = cloneInstitution(international.US_SENATE_SFR);
  const CW_SECRETARIAT = cloneInstitution(international.COMMONWEALTH_SECRETARIAT);

  // NGOs
  const AMNESTY_NG = cloneInstitution(ngos.AMNESTY_INTL_NG);
  const HRW = cloneInstitution(ngos.HRW_GLOBAL);

  const id = classification.id;

  // ---- POWER / ELECTRICITY ----
  if (id === "POWER_NON_INSTALLATION_METER" || id === "POWER_GENERAL") {
    // Pick DISCO by state
    let chosenDisco = null;
    if (stateKey && Object.keys(discosList).length) {
      const stateNameForSearch = stateKey.replace("_", " ");
      for (const key of Object.keys(discosList)) {
        const d = discosList[key];
        if (!d || !Array.isArray(d.regions)) continue;
        const found = d.regions.some((r) =>
          norm(r).includes(norm(stateNameForSearch)) || norm(stateNameForSearch).includes(norm(r))
        );
        if (found) {
          chosenDisco = d;
          break;
        }
      }
    }

    // Fallback – AEDC if nothing else
    if (!chosenDisco && discosList.AEDC) {
      chosenDisco = discosList.AEDC;
    }

    if (chosenDisco) addPrimary(chosenDisco);
    if (NERC) addThrough(NERC);

    if (PCC) addCC(PCC);
    if (NHRC) addCC(NHRC);
  }

  // ---- BANKING ----
  else if (id === "BANK_UNAUTHORISED_DEDUCTION") {
    // If GTBank appears, make GTBANK the primary
    if (has(description, "gtbank", "gtb", "guaranty trust")) {
      if (GTBANK) addPrimary(GTBANK);
    }

    // If still no primary, still route through CBN
    if (!routing.primary && CBN_CPD) {
      addPrimary(CBN_CPD);
    } else if (CBN_CPD) {
      addThrough(CBN_CPD);
    }

    if (FCCPC) addCC(FCCPC);
    if (PCC) addCC(PCC);
    if (NHRC) addCC(NHRC);
  }

  // ---- TELECOM ----
  else if (id === "TELECOM_SIM_SWAP_FRAUD" || id === "TELECOM_GENERAL") {
    if (has(description, "mtn")) {
      if (MTN) addPrimary(MTN);
    }
    if (!routing.primary && MTN) addPrimary(MTN); // fallback to MTN as default example

    if (NCC) addThrough(NCC);
    if (CBN_CPD && id === "TELECOM_SIM_SWAP_FRAUD") addCC(CBN_CPD);
    if (FCCPC) addCC(FCCPC);
    if (PCC) addCC(PCC);
    if (NHRC) addCC(NHRC);
  }

  // ---- POLICE ----
  else if (id === "POLICE_BRUTALITY_EXTORTION") {
    // Primary = State Police Command if we know the state
    if (stateBlock && stateBlock.police_command) {
      addPrimary(stateBlock.police_command);
    } else if (IGP) {
      addPrimary(IGP);
    }

    if (PSC) addThrough(PSC);

    if (PCC) addCC(PCC);
    if (NHRC) addCC(NHRC);

    if (stateBlock && stateBlock.pcc) addCC(stateBlock.pcc);
    if (stateBlock && stateBlock.nhrc) addCC(stateBlock.nhrc);
    if (stateBlock && stateBlock.governor) addCC(stateBlock.governor);
    if (stateBlock && stateBlock.attorney_general) addCC(stateBlock.attorney_general);
  }

  // ---- LABOUR ----
  else if (id === "LABOUR_UNPAID_SALARY") {
    // No dedicated labour institution in JSON yet, so use PCC + NHRC + Governor + AG
    if (stateBlock && stateBlock.attorney_general) {
      addPrimary(stateBlock.attorney_general);
    } else if (PCC) {
      addPrimary(PCC);
    }

    if (PCC && !routing.primary) addPrimary(PCC);
    if (NHRC) addCC(NHRC);

    if (stateBlock && stateBlock.governor) addCC(stateBlock.governor);
    if (PCC) addCC(PCC);
  }

  // ---- HOUSING / LANDLORD ----
  else if (id === "HOUSING_LANDLORD_HARASSMENT") {
    if (stateBlock && stateBlock.attorney_general) {
      addPrimary(stateBlock.attorney_general);
    } else if (PCC) {
      addPrimary(PCC);
    }

    if (stateBlock && stateBlock.governor) addCC(stateBlock.governor);
    if (NHRC) addCC(NHRC);
    if (PCC) addCC(PCC);
  }

  // ---- HEALTH ----
  else if (id === "HEALTH_NEGLIGENCE") {
    if (PCC) addPrimary(PCC);
    if (NHRC) addCC(NHRC);
  }

  // ---- PENSIONS ----
  else if (id === "PENSION_DEATH_BENEFIT_DELAY") {
    if (PTAD) addPrimary(PTAD);
    if (PENCOM) addThrough(PENCOM);
    if (PCC) addCC(PCC);
    if (NHRC) addCC(NHRC);
  }

  // ---- HUMAN RIGHTS / POLITICAL DETENTION ----
  else if (id === "POLITICAL_DETENTION_ICONIC" || id === "GENERAL_HUMAN_RIGHTS") {
    // Primary – NHRC or UNHRC depending
    if (NHRC) addPrimary(NHRC);
    if (UN_HRC) addThrough(UN_HRC);

    // Strong international CC
    if (UN_WG_AD) addCC(UN_WG_AD);
    if (AU) addCC(AU);
    if (ECOWAS) addCC(ECOWAS);
    if (EU_DROI) addCC(EU_DROI);
    if (UK_JCHR) addCC(UK_JCHR);
    if (US_HFAC) addCC(US_HFAC);
    if (US_SFR) addCC(US_SFR);
    if (CW_SECRETARIAT) addCC(CW_SECRETARIAT);

    // NGOs
    if (AMNESTY_NG) addCC(AMNESTY_NG);
    if (HRW) addCC(HRW);

    if (PCC) addCC(PCC);
  }

  // ---- GENERIC ----
  else if (id === "GENERIC_ADMIN_INJUSTICE") {
    if (PCC) addPrimary(PCC);
    if (NHRC) addCC(NHRC);
  }

  // Fallback – if still no primary, default to PCC
  if (!routing.primary && PCC) {
    addPrimary(PCC);
  }

  // Ensure cc is deduped and doesn't duplicate primary/through
  routing.cc = dedupeInstitutions(
    routing.cc.filter(
      (inst) =>
        inst &&
        (!routing.primary || inst.org.toLowerCase() !== routing.primary.org.toLowerCase()) &&
        (!routing.through || inst.org.toLowerCase() !== routing.through.org.toLowerCase())
    )
  );

  return routing;
}

// ---------------------------------------------
// PETITION BUILDER – uses OpenAI to write the letter
// ---------------------------------------------
async function buildPetitionWithOpenAI({ complainant, description, classification, routing }) {
  if (!openai) {
    throw new Error("OpenAI not available");
  }

  const {
    fullName = "",
    email = "",
    phone = "",
    address = "",
    dateString = new Date().toLocaleDateString("en-NG", {
      day: "numeric",
      month: "long",
      year: "numeric"
    })
  } = complainant || {};

  const primary = routing.primary || {};
  const through = routing.through || null;
  const ccList = routing.cc || [];

  const routingSummary = buildRoutingSummary(primary, through, ccList);

  // Subject suggestion based on classification
  let subject = "FORMAL COMPLAINT / PETITION";
  switch (classification.id) {
    case "POWER_NON_INSTALLATION_METER":
      subject = "COMPLAINT ABOUT NON-INSTALLATION OF PREPAID METER";
      break;
    case "POWER_GENERAL":
      subject = "COMPLAINT ABOUT ELECTRICITY SUPPLY / BILLING";
      break;
    case "BANK_UNAUTHORISED_DEDUCTION":
      subject = "COMPLAINT ABOUT UNAUTHORISED / ILLEGAL DEDUCTIONS FROM MY BANK ACCOUNT";
      break;
    case "TELECOM_SIM_SWAP_FRAUD":
      subject = "COMPLAINT ABOUT SIM SWAP FRAUD AND UNAUTHORISED WITHDRAWALS";
      break;
    case "TELECOM_GENERAL":
      subject = "COMPLAINT ABOUT TELECOMMUNICATIONS SERVICE FAILURE / UNFAIR PRACTICES";
      break;
    case "POLICE_BRUTALITY_EXTORTION":
      subject = "COMPLAINT ABOUT POLICE BRUTALITY AND EXTORTION";
      break;
    case "LABOUR_UNPAID_SALARY":
      subject = "COMPLAINT ABOUT NON-PAYMENT OF SALARY / UNFAIR LABOUR PRACTICES";
      break;
    case "HOUSING_LANDLORD_HARASSMENT":
      subject = "COMPLAINT ABOUT LANDLORD HARASSMENT / ILLEGAL EVICTION";
      break;
    case "HEALTH_NEGLIGENCE":
      subject = "COMPLAINT ABOUT MEDICAL NEGLIGENCE";
      break;
    case "PENSION_DEATH_BENEFIT_DELAY":
      subject = "COMPLAINT ABOUT NON-PAYMENT OF PENSION / DEATH BENEFITS";
      break;
    case "POLITICAL_DETENTION_ICONIC":
      subject = "APPEAL FOR INTERVENTION IN POLITICAL DETENTION CASE";
      break;
    case "GENERAL_HUMAN_RIGHTS":
      subject = "PETITION ON HUMAN RIGHTS VIOLATIONS";
      break;
  }

  const systemPrompt = `
You are a Senior Advocate-level Nigerian/international petition-drafting lawyer.

Your job:
- Use the routing information (primary, through, CC) EXACTLY as given.
- Do NOT invent new institutions or addresses.
- Do NOT use placeholders like [Your Name] or [Address].
- If a field is empty (email, address, title), simply omit that line.
- Tone: firm, respectful, precise, professional.

Structure the petition as follows:

1) Complainant details at the top (name, address if given, email, phone, date).
2) Primary institution block (title + org + address).
3) "Through:" block if a through institution exists.
4) "CC:" block listing each CC institution on its own line (title + org + address where available).
5) Subject line starting with "RE: ..."
6) Opening paragraph:
   - Introduce the complainant.
   - State clearly the purpose of the petition.
7) Facts of the case:
   - Organise the complaint description clearly, with dates, amounts, account numbers etc. ONLY if present in the description.
   - No new facts not contained or reasonably implied in the description.
8) Legal / rights basis (brief, not overlong), where relevant:
   - For banks: mention CBN Consumer Protection Framework, Guide to Bank Charges (if clearly a bank issue).
   - For telecom: mention NCC consumer protection.
   - For electricity: mention NERC customer rights, etc.
   - For human rights: mention Nigerian Constitution, African Charter, ICCPR, etc., as appropriate.
9) Reliefs sought:
   - A numbered list (1., 2., 3., ...) of clear requests (investigation, refund, sanctions, policy change, etc.).
10) Closing paragraph: respectful but firm reminder of urgency.
11) Closing:
   - "Yours faithfully,"
   - Complainant's name and optional contact details.

Output: ONE clean, plain-text letter that can be printed or emailed as-is.
`;

  const ccBlockText = ccList
    .map((c) => {
      const bits = [];
      if (c.title) bits.push(c.title);
      bits.push(c.org);
      if (c.address) bits.push(c.address);
      return bits.join("\n");
    })
    .join("\n\n");

  const primaryBlock = [
    primary.title || "",
    primary.org || "",
    primary.address || ""
  ]
    .filter(Boolean)
    .join("\n");

  const throughBlock = through
    ? [
        through.title || "",
        through.org || "",
        through.address || ""
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  const complainantBlock = [
    fullName || "",
    address || "",
    email ? `Email: ${email}` : "",
    phone ? `Phone: ${phone}` : "",
    dateString
  ]
    .filter(Boolean)
    .join("\n");

  const userPrompt = `
COMPLAINANT DETAILS:
${complainantBlock}

PRIMARY INSTITUTION:
${primaryBlock || "NONE"}

THROUGH INSTITUTION (if any):
${throughBlock || "NONE"}

CC INSTITUTIONS (if any):
${ccBlockText || "NONE"}

ROUTING SUMMARY (for your understanding, not for output):
${routingSummary || "N/A"}

SUBJECT LINE (you must start with RE:):
RE: ${subject}

COMPLAINT DESCRIPTION (raw from user – organise this into facts):
${description}

Write the full petition letter now, following the structure and rules.
`;

  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.25,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]
  });

  const text = resp.choices?.[0]?.message?.content || "";
  if (!text.trim()) {
    throw new Error("OpenAI returned empty petition text");
  }

  return text.trim();
}

// ---------------------------------------------
// FALLBACK PETITION – no AI
// ---------------------------------------------
function buildFallbackPetition(complainant, description, routing, classification) {
  const {
    fullName = "",
    email = "",
    phone = "",
    address = "",
    dateString = new Date().toLocaleDateString("en-NG", {
      day: "numeric",
      month: "long",
      year: "numeric"
    })
  } = complainant || {};

  const primary = routing.primary || {};
  const through = routing.through || null;
  const ccList = routing.cc || [];

  let subject = "FORMAL COMPLAINT / PETITION";
  switch (classification.id) {
    case "POWER_NON_INSTALLATION_METER":
      subject = "COMPLAINT ABOUT NON-INSTALLATION OF PREPAID METER";
      break;
    case "POWER_GENERAL":
      subject = "COMPLAINT ABOUT ELECTRICITY SUPPLY / BILLING";
      break;
    case "BANK_UNAUTHORISED_DEDUCTION":
      subject = "COMPLAINT ABOUT UNAUTHORISED / ILLEGAL DEDUCTIONS FROM MY BANK ACCOUNT";
      break;
    case "TELECOM_SIM_SWAP_FRAUD":
      subject = "COMPLAINT ABOUT SIM SWAP FRAUD AND UNAUTHORISED WITHDRAWALS";
      break;
    case "TELECOM_GENERAL":
      subject = "COMPLAINT ABOUT TELECOMMUNICATIONS SERVICE FAILURE / UNFAIR PRACTICES";
      break;
    case "POLICE_BRUTALITY_EXTORTION":
      subject = "COMPLAINT ABOUT POLICE BRUTALITY AND EXTORTION";
      break;
    case "LABOUR_UNPAID_SALARY":
      subject = "COMPLAINT ABOUT NON-PAYMENT OF SALARY / UNFAIR LABOUR PRACTICES";
      break;
    case "HOUSING_LANDLORD_HARASSMENT":
      subject = "COMPLAINT ABOUT LANDLORD HARASSMENT / ILLEGAL EVICTION";
      break;
    case "HEALTH_NEGLIGENCE":
      subject = "COMPLAINT ABOUT MEDICAL NEGLIGENCE";
      break;
    case "PENSION_DEATH_BENEFIT_DELAY":
      subject = "COMPLAINT ABOUT NON-PAYMENT OF PENSION / DEATH BENEFITS";
      break;
    case "POLITICAL_DETENTION_ICONIC":
      subject = "APPEAL FOR INTERVENTION IN POLITICAL DETENTION CASE";
      break;
    case "GENERAL_HUMAN_RIGHTS":
      subject = "PETITION ON HUMAN RIGHTS VIOLATIONS";
      break;
  }

  const primaryBlock = [
    primary.title || "",
    primary.org || "",
    primary.address || ""
  ]
    .filter(Boolean)
    .join("\n");

  const throughBlock = through
    ? "Through:\n" +
      [through.title || "", through.org || "", through.address || ""]
        .filter(Boolean)
        .join("\n")
    : "";

  const ccBlock = ccList.length
    ? "CC:\n" +
      ccList
        .map((c) =>
          [c.title || "", c.org || "", c.address || ""]
            .filter(Boolean)
            .join("\n")
        )
        .join("\n\n")
    : "";

  let text = "";
  text +=
    [fullName || "", address || "", email ? "Email: " + email : "", phone ? "Phone: " + phone : "", dateString]
      .filter(Boolean)
      .join("\n") + "\n\n";

  if (primaryBlock) text += primaryBlock + "\n\n";
  if (throughBlock) text += throughBlock + "\n\n";
  if (ccBlock) text += ccBlock + "\n\n";

  text += `RE: ${subject}\n\n`;
  text += "Dear Sir/Madam,\n\n";
  text += "I respectfully write to lodge a formal complaint as follows:\n\n";
  text += description.trim() + "\n\n";
  text += "I kindly request your urgent intervention to investigate this matter and ensure that justice is done.\n\n";
  text += "Yours faithfully,\n\n";
  text += (fullName || "The Complainant") + "\n";
  if (phone) text += phone + "\n";
  if (email) text += email + "\n";

  return text;
}

// ---------------------------------------------
// MAIN EXPORTED FUNCTION
// ---------------------------------------------
/**
 * generatePetitionA8
 * @param {object} args
 *  - description: string
 *  - complainant: { fullName, email, phone, address }
 *  - institutionsJson: object (from institutions.json)
 *
 * Returns:
 *  {
 *    petitionText: string,
 *    primaryInstitution: object | null,
 *    throughInstitution: object | null,
 *    ccList: object[],
 *    routingSummary: string | null
 *  }
 */
async function generatePetitionA8(args) {
  const { description, complainant, institutionsJson } = args || {};

  if (!description || typeof description !== "string" || description.trim().length < 10) {
    throw new Error("Description is missing or too short for A8");
  }

  const classification = classifyCase(description);
  const routing = buildRouting(classification, description, institutionsJson || {});
  const routingSummary = buildRoutingSummary(routing.primary, routing.through, routing.cc);

  let petitionText = "";
  try {
    petitionText = await buildPetitionWithOpenAI({
      complainant,
      description,
      classification,
      routing
    });
  } catch (err) {
    console.error("[A8] OpenAI petition build failed, using fallback:", err.message);
    petitionText = buildFallbackPetition(complainant, description, routing, classification);
  }

  return {
    petitionText,
    primaryInstitution: routing.primary,
    throughInstitution: routing.through,
    ccList: routing.cc,
    routingSummary
  };
}

module.exports = {
  generatePetitionA8,
  // Expose some bits for future debugging if needed
  classifyCase,
  buildRouting
};

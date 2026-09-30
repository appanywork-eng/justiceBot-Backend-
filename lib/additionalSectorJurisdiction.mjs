import {
  PENCOM_COMPLAINTS,
  PTAD_COMPLAINTS,
  NAICOM_COMPLAINTS,
  FCT_DEVELOPMENT_CONTROL,
  LASBCA_COMPLAINTS,
} from "./nigeriaAdditionalSectorRegistry.mjs";

function clean(value, maxLength = 10000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalize(value) {
  return clean(value).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function includesAny(text, terms) {
  const source = ` ${normalize(text)} `;
  return terms.some((term) => source.includes(` ${normalize(term)} `));
}

function contact(authority) {
  return {
    contactEmails: [...authority.contact.emails],
    contactPhoneNumbers: [...authority.contact.phone_numbers],
    contactAddress: authority.contact.address,
    submissionUrl: authority.contact.submission_url || authority.contact.website,
    sourceUrls: [...authority.verification.source_urls],
  };
}

export function resolvePensionRouting(context = {}) {
  const text = `${context.institutionName || ""} ${context.complaint || ""}`;
  const ptadMatter = includesAny(text, [
    "ptad", "defined benefit", "old pension scheme", "federal pensioner", "pension verification",
    "retired before june 2007", "retired before 2007",
  ]);

  const authority = ptadMatter ? PTAD_COMPLAINTS : PENCOM_COMPLAINTS;

  return {
    matched: true,
    sector: "pensions",
    caseType: ptadMatter ? "defined_benefit_pension_complaint" : "contributory_pension_complaint",
    jurisdiction: "national_pension_regulation",
    routeKey: authority.key,
    primaryInstitution: authority.name,
    ccInstitutions: [],
    deliveryMethod: "verified_email_or_official_complaint_form",
    emailRoutingExpected: true,
    documentPurpose: ptadMatter
      ? "Complaint concerning federal defined-benefit pension administration"
      : "Pension complaint or request for regulatory intervention",
    routingNote: ptadMatter
      ? "Provide pension verification details, retirement records and previous PTAD references where available."
      : "Identify the employer and PFA, state the affected contribution or benefit period, and attach RSA statements and prior complaint references where available.",
    ...contact(authority),
  };
}

export function resolveInsuranceRouting(context = {}) {
  const text = `${context.institutionName || ""} ${context.complaint || ""}`;
  const healthInsurance = includesAny(text, ["nhia", "hmo", "health insurance", "health maintenance organisation", "health maintenance organization"]);

  if (healthInsurance) {
    return {
      matched: false,
      sector: "insurance",
      reason: "health_insurance_belongs_to_health_sector",
      suggestedSector: "health",
    };
  }

  return {
    matched: true,
    sector: "insurance",
    caseType: "insurance_policy_or_claim_complaint",
    jurisdiction: "national_insurance_regulation",
    routeKey: NAICOM_COMPLAINTS.key,
    primaryInstitution: NAICOM_COMPLAINTS.name,
    ccInstitutions: [],
    deliveryMethod: "verified_email_or_official_complaint_portal",
    emailRoutingExpected: true,
    documentPurpose: "Insurance policy, premium, insurer-conduct or claim-settlement complaint",
    routingNote: "Name the insurer or intermediary, policy number, claim number, loss date, amount and prior complaint reference where available. Do not include card PINs, passwords or unrelated financial credentials.",
    ...contact(NAICOM_COMPLAINTS),
  };
}

export function resolveUrbanPlanningRouting(context = {}) {
  const text = `${context.institutionName || ""} ${context.issueLocation || ""} ${context.complaint || ""}`;
  const lagosMatter = includesAny(text, ["lagos", "lasbca", "laspppa"]);
  const fctMatter = includesAny(text, ["abuja", "fct", "ammc", "development control"]);

  if (!lagosMatter && !fctMatter) {
    const namedAuthority = clean(context.institutionName, 300);
    return {
      matched: true,
      sector: "urban_planning",
      caseType: "state_urban_planning_or_building_control",
      jurisdiction: "state_or_local_physical_planning",
      routeKey: "state_planning_authority_physical_filing",
      primaryInstitution: namedAuthority || "Relevant State or Local Physical Planning Authority",
      ccInstitutions: ["Public Complaints Commission (PCC)"],
      deliveryMethod: "official_directory_or_physical_filing",
      emailRoutingExpected: false,
      documentPurpose: "Urban-planning, development-permit or building-control complaint",
      routingNote: "The responsible authority depends on the state and local planning area. Use the authority's verified official directory or registry; no unverified email address will be guessed.",
      contactEmails: [],
      contactPhoneNumbers: [],
      contactAddress: "",
      submissionUrl: "",
      sourceUrls: [],
    };
  }

  const authority = lagosMatter ? LASBCA_COMPLAINTS : FCT_DEVELOPMENT_CONTROL;
  return {
    matched: true,
    sector: "urban_planning",
    caseType: lagosMatter ? "lagos_building_control" : "fct_development_control",
    jurisdiction: lagosMatter ? "lagos_state" : "federal_capital_territory",
    routeKey: authority.key,
    primaryInstitution: authority.name,
    ccInstitutions: [],
    deliveryMethod: authority.contact.emails.length > 0
      ? "verified_email_or_official_portal"
      : "official_portal_or_physical_filing",
    emailRoutingExpected: authority.contact.emails.length > 0,
    documentPurpose: "Development-control, building-permit, enforcement or unsafe-structure complaint",
    routingNote: "State the exact site address, planning or permit reference, nature of the violation, safety risk, previous reports and available photographs. Alleged corruption is routed separately to the appropriate anti-corruption authority.",
    ...contact(authority),
  };
}

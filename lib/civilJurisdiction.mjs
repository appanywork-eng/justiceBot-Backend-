const STRONG_TENANCY_PATTERNS = [
  /\blandlord\b/i,
  /\btenant\b/i,
  /\btenancy\b/i,
  /\bquit notice\b/i,
  /\beviction notice\b/i,
  /\brent increase\b/i,
  /\bhouse rent\b/i,
  /\brent dispute\b/i,
  /\brent arrears\b/i,
  /\brented apartment\b/i,
  /\brented house\b/i,
  /\blease agreement\b/i,
  /\bproperty manager\b/i,
];

const HOUSING_PATTERN =
  /\b(house|home|apartment|flat|property|premises|landlord|tenant|tenancy|lease)\b/i;

const RENT_PATTERN =
  /\b(rent|rental|eviction|tenancy|lease)\b/i;

const FCT_PATTERNS = [
  /\bfct\b/i,
  /\babuja\b/i,
  /\bkubwa\b/i,
  /\bgwarinpa\b/i,
  /\bgarki\b/i,
  /\bwuse\b/i,
  /\bmaitama\b/i,
  /\basokoro\b/i,
  /\bjabi\b/i,
  /\bapo\b/i,
  /\blugbe\b/i,
  /\bkuje\b/i,
  /\bbwari\b/i,
  /\bgwagwalada\b/i,
  /\bnyanya\b/i,
  /\bjikwoyi\b/i,
];

const LAGOS_PATTERNS = [
  /\blagos\b/i,
  /\bikeja\b/i,
  /\blekki\b/i,
  /\bajah\b/i,
  /\bsurulere\b/i,
  /\byaba\b/i,
  /\bikorodu\b/i,
  /\bepe\b/i,
  /\bbadagry\b/i,
  /\balimosho\b/i,
  /\bagege\b/i,
  /\beti[\s-]?osa\b/i,
  /\bapapa\b/i,
  /\boshodi\b/i,
];

function clean(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesAny(text, patterns) {
  return patterns.some(
    (pattern) => pattern.test(text)
  );
}

export function isLandlordTenantDispute(
  complaint
) {
  const text = clean(complaint);

  if (!text) {
    return false;
  }

  if (
    matchesAny(
      text,
      STRONG_TENANCY_PATTERNS
    )
  ) {
    return true;
  }

  return (
    RENT_PATTERN.test(text) &&
    HOUSING_PATTERN.test(text)
  );
}

export function detectCivilJurisdiction({
  disputeLocation = "",
  complaint = "",
  petitionerAddress = "",
} = {}) {
  const explicit =
    clean(disputeLocation);

  if (
    explicit &&
    matchesAny(
      explicit,
      FCT_PATTERNS
    )
  ) {
    return {
      jurisdiction: "fct",
      source:
        "dispute_location",
    };
  }

  if (
    explicit &&
    matchesAny(
      explicit,
      LAGOS_PATTERNS
    )
  ) {
    return {
      jurisdiction: "lagos",
      source:
        "dispute_location",
    };
  }

  const complaintText =
    clean(complaint);

  if (
    matchesAny(
      complaintText,
      FCT_PATTERNS
    )
  ) {
    return {
      jurisdiction: "fct",
      source: "complaint",
    };
  }

  if (
    matchesAny(
      complaintText,
      LAGOS_PATTERNS
    )
  ) {
    return {
      jurisdiction: "lagos",
      source: "complaint",
    };
  }

  const address =
    clean(petitionerAddress);

  if (
    matchesAny(
      address,
      FCT_PATTERNS
    )
  ) {
    return {
      jurisdiction: "fct",
      source:
        "petitioner_address",
    };
  }

  if (
    matchesAny(
      address,
      LAGOS_PATTERNS
    )
  ) {
    return {
      jurisdiction: "lagos",
      source:
        "petitioner_address",
    };
  }

  return {
    jurisdiction: "other",
    source:
      explicit
        ? "dispute_location"
        : "unknown",
  };
}

export function resolveCivilRouting({
  complaint = "",
  disputeLocation = "",
  petitionerAddress = "",
} = {}) {
  if (
    !isLandlordTenantDispute(
      complaint
    )
  ) {
    return {
      matched: false,
    };
  }

  const location =
    detectCivilJurisdiction({
      disputeLocation,
      complaint,
      petitionerAddress,
    });

  if (
    location.jurisdiction ===
    "fct"
  ) {
    return {
      matched: true,
      sector:
        "civil_disputes",
      caseType:
        "civil_dispute",
      disputeType:
        "landlord_tenant",
      jurisdiction: "fct",
      jurisdictionSource:
        location.source,
      routeKey: "fct_amdc",
      primaryInstitution:
        "Abuja Multi-Door Court (AMDC)",
      ccInstitutions: [],
      deliveryMethod:
        "physical_filing",
      emailRoutingExpected:
        false,
      documentPurpose:
        "Request for mediation and amicable resolution of a landlord-tenant dispute",
      routingNote:
        "File the request through the Abuja Multi-Door Court Registry in Gudu, Abuja. No verified direct AMDC intake email is currently published.",
    };
  }

  if (
    location.jurisdiction ===
    "lagos"
  ) {
    return {
      matched: true,
      sector:
        "civil_disputes",
      caseType:
        "civil_dispute",
      disputeType:
        "landlord_tenant",
      jurisdiction: "lagos",
      jurisdictionSource:
        location.source,
      routeKey:
        "lagos_cmb",
      primaryInstitution:
        "Citizens' Mediation Bureau (CMB), Lagos State",
      ccInstitutions: [],
      deliveryMethod:
        "email_or_walk_in",
      emailRoutingExpected:
        true,
      documentPurpose:
        "Petition requesting mediation of a landlord-tenant dispute",
      routingNote:
        "The Lagos Citizens' Mediation Bureau officially accepts landlord-tenant disputes through petition, email and walk-in submission.",
    };
  }

  return {
    matched: true,
    sector:
      "civil_disputes",
    caseType:
      "civil_dispute",
    disputeType:
      "landlord_tenant",
    jurisdiction: "other",
    jurisdictionSource:
      location.source,
    routeKey:
      "formal_notice",
    primaryInstitution:
      "The Landlord or Property Manager",
    ccInstitutions: [],
    deliveryMethod:
      "personal_delivery",
    emailRoutingExpected:
      false,
    documentPurpose:
      "Formal notice and request for amicable resolution of a landlord-tenant dispute",
    routingNote:
      "No verified jurisdiction-specific mediation contact was selected. Deliver the formal notice to the landlord or property manager and obtain legal advice before court proceedings.",
  };
}

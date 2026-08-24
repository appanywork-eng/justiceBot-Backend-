/*
 * PetitionDesk nationwide sector policy.
 *
 * Every active sector must:
 * - have a registered jurisdiction resolver;
 * - use organisation-aware sector detection;
 * - use complaint-stage consistency protection;
 * - refuse unverified direct contact details;
 * - retain safe portal or physical-filing guidance
 *   when no verified direct email is available.
 */

export const NATIONAL_SECTOR_POLICIES =
  Object.freeze([
    {
      key:
        "anti_corruption",

      dataFile:
        "anti-corruption.json",

      label:
        "Anti-corruption",

      jurisdictionModel:
        "federal_agency_and_state_referral",

      nationwide:
        true,
    },

    {
      key:
        "aviation",

      dataFile:
        "aviation.json",

      label:
        "Aviation",

      jurisdictionModel:
        "national_federal_regulator",

      nationwide:
        true,
    },

    {
      key:
        "banking",

      dataFile:
        "banking.json",

      label:
        "Banking and finance",

      jurisdictionModel:
        "national_financial_regulator",

      nationwide:
        true,
    },

    {
      key:
        "civil_disputes",

      dataFile:
        "civil_disputes.json",

      label:
        "Civil disputes",

      jurisdictionModel:
        "state_specific_court_and_mediation",

      nationwide:
        true,
    },

    {
      key:
        "diaspora_report",

      dataFile:
        "diaspora_report.json",

      label:
        "Diaspora and consular matters",

      jurisdictionModel:
        "national_and_foreign_mission",

      nationwide:
        true,
    },

    {
      key:
        "education",

      dataFile:
        "education.json",

      label:
        "Education",

      jurisdictionModel:
        "institution_federal_and_state",

      nationwide:
        true,
    },

    {
      key:
        "general",

      dataFile:
        "general.json",

      label:
        "General administrative complaints",

      jurisdictionModel:
        "federal_state_and_local_ombudsman",

      nationwide:
        true,
    },

    {
      key:
        "health",

      dataFile:
        "health.json",

      label:
        "Health and public health insurance",

      jurisdictionModel:
        "provider_federal_and_state",

      nationwide:
        true,
    },

    {
      key:
        "insurance",

      dataFile:
        "insurance.json",

      label:
        "Insurance",

      jurisdictionModel:
        "national_insurance_regulator",

      nationwide:
        true,
    },

    {
      key:
        "international_escalation",

      dataFile:
        "international_escalation.json",

      label:
        "International escalation",

      jurisdictionModel:
        "domestic_exhaustion_and_international",

      nationwide:
        true,
    },

    {
      key:
        "judiciary",

      dataFile:
        "judiciary.json",

      label:
        "Judiciary",

      jurisdictionModel:
        "federal_state_and_court_specific",

      nationwide:
        true,
    },

    {
      key:
        "power",

      dataFile:
        "power.json",

      label:
        "Power and electricity",

      jurisdictionModel:
        "state_and_federal_regulated_market",

      nationwide:
        true,
    },

    {
      key:
        "pensions",

      dataFile:
        "pensions.json",

      label:
        "Pensions and retirement benefits",

      jurisdictionModel:
        "national_pension_regulator_and_defined_benefit_administrator",

      nationwide:
        true,
    },

    {
      key:
        "security",

      dataFile:
        "security.json",

      label:
        "Security and law enforcement",

      jurisdictionModel:
        "federal_service_and_state_command",

      nationwide:
        true,
    },

    {
      key:
        "telecoms",

      dataFile:
        "telecoms.json",

      label:
        "Telecommunications",

      jurisdictionModel:
        "national_communications_regulator",

      nationwide:
        true,
    },

    {
      key:
        "urban_planning",

      dataFile:
        "urban_planning.json",

      label:
        "Urban planning and development control",

      jurisdictionModel:
        "fct_state_and_local_planning_authority",

      nationwide:
        true,
    },
  ]);

export const NATIONAL_SECTOR_KEYS =
  Object.freeze(
    NATIONAL_SECTOR_POLICIES.map(
      policy =>
        policy.key
    )
  );

export const NATIONAL_SECTOR_DATA_FILES =
  Object.freeze(
    NATIONAL_SECTOR_POLICIES.map(
      policy =>
        policy.dataFile
    )
  );

function normalize(
  value
) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function getNationalSectorPolicy(
  sector
) {
  const key =
    normalize(
      sector
    );

  return (
    NATIONAL_SECTOR_POLICIES.find(
      policy =>
        policy.key === key
    ) ||
    null
  );
}

function collectHttpsUrls(
  value,
  output = []
) {
  if (
    typeof value ===
    "string"
  ) {
    const matches =
      value.match(
        /https:\/\/[^\s"'<>]+/gi
      ) || [];

    output.push(
      ...matches
    );

    return output;
  }

  if (
    Array.isArray(value)
  ) {
    for (
      const item
      of value
    ) {
      collectHttpsUrls(
        item,
        output
      );
    }

    return output;
  }

  if (
    value &&
    typeof value ===
      "object"
  ) {
    for (
      const child
      of Object.values(
        value
      )
    ) {
      collectHttpsUrls(
        child,
        output
      );
    }
  }

  return output;
}

function unique(
  values
) {
  return [
    ...new Set(
      values
        .map(
          value =>
            String(value || "")
              .trim()
        )
        .filter(Boolean)
    ),
  ];
}

export function assessInstitutionContactVerification({
  institution = {},
  sectorData = {},
} = {}) {
  const verification =
    institution?.verification &&
    typeof institution.verification ===
      "object"
      ? institution.verification
      : {};

  const status =
    String(
      verification.status ||
      institution.verification_status ||
      (
        institution.verified ===
        true
          ? "verified"
          : ""
      )
    )
      .trim()
      .toLowerCase();

  const rejectedStatus =
    /(unverified|not_verified|pending|unknown|draft|expired|deprecated)/i.test(
      status
    );

  const verifiedStatus =
    !rejectedStatus &&
    (
      /\bverified\b/i.test(
        status
      ) ||
      status.includes(
        "verified_official_source"
      ) ||
      verification.verified ===
        true ||
      institution.verified ===
        true
    );

  const officialSources =
    unique(
      collectHttpsUrls(
        verification
      )
    );

  const hasOfficialSource =
    officialSources.length >
    0;

  const directContactAllowed =
    Boolean(
      verifiedStatus &&
      hasOfficialSource
    );

  return {
    status:
      status ||
      "unverified",

    verifiedStatus,

    hasOfficialSource,

    officialSources,

    directContactAllowed,

    policyRequiresOfficialSources:
      sectorData
        ?.verification_policy
        ?.official_sources_only !==
      false,

    reason:
      directContactAllowed
        ? "verified_official_source"
        : !verifiedStatus
        ? "verification_status_missing"
        : "official_source_missing",
  };
}

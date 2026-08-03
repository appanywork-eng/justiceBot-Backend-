import {
  resolvePowerRouting,
  resolveTelecomRouting,
  resolveBankingRouting,
  resolveAviationRouting,
} from "../lib/regulatedSectorJurisdiction.mjs";

import {
  resolveHealthRouting,
  resolveEducationRouting,
  resolveSecurityRouting,
  resolveJudiciaryRouting,
} from "../lib/publicInstitutionJurisdiction.mjs";

import {
  resolveGeneralRouting,
  resolveAntiCorruptionRouting,
  resolveDiasporaRouting,
  resolveInternationalRouting,
} from "../lib/finalSectorJurisdiction.mjs";

import {
  resolveCivilRouting,
} from "../lib/civilJurisdiction.mjs";

const scenarios = [
  {
    name: "POWER — AEDC FIRST STAGE",
    resolver: resolvePowerRouting,
    context: {
      institutionName: "AEDC",
      complaint: "My electricity bill is incorrect.",
      escalationStage: "initial",
      issueLocation: "Abuja",
      country: "Nigeria",
    },
  },
  {
    name: "POWER — FCT NERC ESCALATION",
    resolver: resolvePowerRouting,
    context: {
      institutionName: "AEDC",
      complaint: "I complained to AEDC but the matter remains unresolved.",
      escalationStage: "unresolved",
      priorComplaintReference: "POWER-123",
      issueLocation: "Abuja",
      country: "Nigeria",
    },
  },

  {
    name: "TELECOM — MTN FIRST STAGE",
    resolver: resolveTelecomRouting,
    context: {
      institutionName: "MTN",
      complaint: "My airtime was deducted.",
      escalationStage: "initial",
      country: "Nigeria",
    },
  },
  {
    name: "TELECOM — NCC ESCALATION",
    resolver: resolveTelecomRouting,
    context: {
      institutionName: "MTN",
      complaint: "I complained to MTN but the matter remains unresolved.",
      escalationStage: "unresolved",
      priorComplaintReference: "MTN-123",
      country: "Nigeria",
    },
  },

  {
    name: "BANKING — GTBANK VERIFIED EMAIL",
    resolver: resolveBankingRouting,
    context: {
      institutionName: "GTBank",
      complaint: "I have a disputed transfer.",
      escalationStage: "initial",
      country: "Nigeria",
    },
  },
  {
    name: "BANKING — ACCESS SAFE NO-EMAIL",
    resolver: resolveBankingRouting,
    context: {
      institutionName: "Access Bank",
      complaint: "I have a failed transfer.",
      escalationStage: "initial",
      country: "Nigeria",
    },
  },
  {
    name: "BANKING — CBN ESCALATION",
    resolver: resolveBankingRouting,
    context: {
      institutionName: "GTBank",
      complaint: "I complained to GTBank but the transaction remains unresolved.",
      escalationStage: "unresolved",
      priorComplaintReference: "BANK-123",
      country: "Nigeria",
    },
  },

  {
    name: "AVIATION — AIR PEACE FIRST STAGE",
    resolver: resolveAviationRouting,
    context: {
      institutionName: "Air Peace",
      complaint: "My flight was cancelled.",
      escalationStage: "initial",
      country: "Nigeria",
    },
  },
  {
    name: "AVIATION — NCAA ESCALATION",
    resolver: resolveAviationRouting,
    context: {
      institutionName: "Air Peace",
      complaint: "I complained to Air Peace but my refund remains unresolved.",
      escalationStage: "unresolved",
      priorComplaintReference: "FLIGHT-123",
      country: "Nigeria",
    },
  },
  {
    name: "AVIATION — NSIB SAFETY",
    resolver: resolveAviationRouting,
    context: {
      complaint: "I witnessed an aircraft crash near the airport.",
      country: "Nigeria",
    },
  },

  {
    name: "HEALTH — PROVIDER FIRST",
    resolver: resolveHealthRouting,
    context: {
      institutionName: "National Hospital Abuja",
      complaint: "The hospital delayed my treatment.",
      escalationStage: "initial",
      country: "Nigeria",
    },
  },
  {
    name: "HEALTH — NHIA ESCALATION",
    resolver: resolveHealthRouting,
    context: {
      institutionName: "Example HMO",
      complaint: "My unresolved HMO referral authorisation complaint remains unresolved.",
      escalationStage: "unresolved",
      priorComplaintReference: "HMO-123",
      country: "Nigeria",
    },
  },
  {
    name: "HEALTH — MDCN MISCONDUCT",
    resolver: resolveHealthRouting,
    context: {
      institutionName: "Example Hospital",
      complaint: "I am reporting medical negligence and doctor misconduct.",
      country: "Nigeria",
    },
  },
  {
    name: "HEALTH — NHRC RIGHTS",
    resolver: resolveHealthRouting,
    context: {
      institutionName: "Example Hospital",
      complaint: "The patient was detained over a hospital bill.",
      country: "Nigeria",
    },
  },
  {
    name: "HEALTH — FCCPC CONSUMER",
    resolver: resolveHealthRouting,
    context: {
      institutionName: "Example Hospital",
      complaint: "I complained previously about illegal hospital fees but received no response.",
      escalationStage: "unresolved",
      priorComplaintReference: "HOSP-123",
      country: "Nigeria",
    },
  },

  {
    name: "EDUCATION — JAMB SUPPORT",
    resolver: resolveEducationRouting,
    context: {
      institutionName: "JAMB",
      complaint: "My CAPS admission status has not been corrected.",
      country: "Nigeria",
    },
  },
  {
    name: "EDUCATION — INSTITUTION FIRST",
    resolver: resolveEducationRouting,
    context: {
      institutionName: "University of Abuja",
      complaint: "My transcript has been delayed.",
      escalationStage: "initial",
      country: "Nigeria",
    },
  },
  {
    name: "EDUCATION — NUC ESCALATION",
    resolver: resolveEducationRouting,
    context: {
      institutionName: "University of Abuja",
      complaint: "My university transcript remains delayed after internal complaints.",
      escalationStage: "unresolved",
      priorComplaintReference: "UNI-123",
      country: "Nigeria",
    },
  },

  {
    name: "SECURITY — ACTIVE EMERGENCY",
    resolver: resolveSecurityRouting,
    context: {
      complaint: "I am currently under attack and my life is in immediate danger.",
      country: "Nigeria",
    },
  },
  {
    name: "SECURITY — NHRC RIGHTS",
    resolver: resolveSecurityRouting,
    context: {
      institutionName: "Nigeria Police Force",
      complaint: "Police officers unlawfully detained me without charge and denied access to my lawyer.",
      country: "Nigeria",
    },
  },
  {
    name: "SECURITY — PSC DISCIPLINE",
    resolver: resolveSecurityRouting,
    context: {
      institutionName: "Nigeria Police Force",
      complaint: "Police officers demanded bail money from me at an illegal checkpoint.",
      country: "Nigeria",
    },
  },
  {
    name: "SECURITY — POLICE COMMAND",
    resolver: resolveSecurityRouting,
    context: {
      complaint: "My brother is missing following a kidnapping and I need to report the crime.",
      country: "Nigeria",
    },
  },

  {
    name: "JUDICIARY — NJC MISCONDUCT",
    resolver: resolveJudiciaryRouting,
    context: {
      institutionName: "Federal High Court",
      complaint: "I wish to report judicial misconduct because the judge demanded a bribe.",
      country: "Nigeria",
    },
  },
  {
    name: "JUDICIARY — NHRC JUSTICE RIGHTS",
    resolver: resolveJudiciaryRouting,
    context: {
      institutionName: "Federal High Court",
      complaint: "I remain in unlawful detention after the police ignored the court order.",
      country: "Nigeria",
    },
  },

  {
    name: "ANTI-CORRUPTION — EFCC",
    resolver: resolveAntiCorruptionRouting,
    context: {
      institutionName: "Example Federal Agency",
      complaint: "Public funds were diverted through suspicious transfers and money laundering.",
      country: "Nigeria",
    },
  },
  {
    name: "ANTI-CORRUPTION — ICPC",
    resolver: resolveAntiCorruptionRouting,
    context: {
      institutionName: "Example Government Ministry",
      complaint: "A public officer demanded a bribe and abused the office.",
      country: "Nigeria",
    },
  },

  {
    name: "DIASPORA — MISSION PASSPORT",
    resolver: resolveDiasporaRouting,
    context: {
      issueLocation: "United Kingdom",
      complaint: "My Nigerian passport expired and I need passport renewal abroad.",
      country: "Nigeria",
    },
  },
  {
    name: "DIASPORA — NAPTIP TRAFFICKING",
    resolver: resolveDiasporaRouting,
    context: {
      issueLocation: "Saudi Arabia",
      complaint: "A deceptive recruiter seized my passport and I am being forced to work against my will.",
      country: "Nigeria",
    },
  },

  {
    name: "GENERAL — PCC PUBLIC SERVICE",
    resolver: resolveGeneralRouting,
    context: {
      institutionName: "Example Federal Ministry",
      complaint: "The ministry has delayed my application and refused to respond.",
      country: "Nigeria",
    },
  },

  {
    name: "INTERNATIONAL — DOMESTIC NHRC FIRST",
    resolver: resolveInternationalRouting,
    context: {
      institutionName: "United States Congress",
      complaint: "I suffered arbitrary detention and denial of access to a lawyer.",
      country: "Nigeria",
    },
  },
  {
    name: "INTERNATIONAL — US ADVOCACY",
    resolver: resolveInternationalRouting,
    context: {
      institutionName: "Tom Lantos Human Rights Commission",
      complaint: "My arbitrary detention remains unresolved after domestic complaints.",
      priorComplaintReference: "NHRC-123",
      country: "Nigeria",
    },
  },

  {
    name: "CIVIL — FCT ADR",
    resolver: resolveCivilRouting,
    context: {
      complaint: "My landlord in Kubwa served an eviction notice and I request mediation.",
      disputeLocation: "Kubwa, Abuja",
    },
  },
];

const violations = [];
const warnings = [];

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    String(value || "")
  );
}

function addViolation(
  scenario,
  route,
  message
) {
  violations.push(
    `${scenario} [${route || "NO_ROUTE"}]: ${message}`
  );
}

for (const scenario of scenarios) {
  let decision;

  try {
    decision =
      scenario.resolver(
        scenario.context
      );
  } catch (error) {
    addViolation(
      scenario.name,
      "",
      `resolver threw: ${error.message}`
    );

    continue;
  }

  const route =
    decision?.routeKey ||
    decision?.reason ||
    "UNKNOWN";

  if (
    !decision ||
    decision.matched !== true
  ) {
    addViolation(
      scenario.name,
      route,
      "scenario did not produce a matched route"
    );

    continue;
  }

  const emailExpected =
    decision.emailRoutingExpected;

  const emails =
    decision.contactEmails;

  const sources =
    decision.sourceUrls;

  if (
    typeof emailExpected !==
    "boolean"
  ) {
    addViolation(
      scenario.name,
      route,
      "emailRoutingExpected is not a boolean"
    );
  }

  if (emailExpected === true) {
    if (
      !Array.isArray(emails) ||
      emails.length === 0
    ) {
      addViolation(
        scenario.name,
        route,
        "claims email routing but exposes no verified contactEmails"
      );
    } else {
      const invalidEmails =
        emails.filter(
          email =>
            !validEmail(email)
        );

      if (invalidEmails.length > 0) {
        addViolation(
          scenario.name,
          route,
          `contains invalid email values: ${invalidEmails.join(", ")}`
        );
      }
    }

    if (
      !Array.isArray(sources) ||
      sources.length === 0
    ) {
      addViolation(
        scenario.name,
        route,
        "claims email routing but exposes no official sourceUrls"
      );
    }
  }

  if (emailExpected === false) {
    if (
      Array.isArray(emails) &&
      emails.length > 0
    ) {
      addViolation(
        scenario.name,
        route,
        "email routing is disabled but contactEmails are exposed"
      );
    }

    if (
      emails !== undefined &&
      !Array.isArray(emails)
    ) {
      addViolation(
        scenario.name,
        route,
        "contactEmails exists but is not an array"
      );
    }

    if (emails === undefined) {
      warnings.push(
        `${scenario.name} [${route}]: contactEmails is omitted instead of []`
      );
    }
  }

  const emailCount =
    Array.isArray(emails)
      ? emails.length
      : 0;

  const sourceCount =
    Array.isArray(sources)
      ? sources.length
      : 0;

  console.log(
    `${emailExpected === true ? "EMAIL" : "SAFE "} | ${String(emailCount).padStart(2)} email(s) | ${String(sourceCount).padStart(2)} source(s) | ${scenario.name} | ${route}`
  );
}

console.log();
console.log(
  `SCENARIOS CHECKED: ${scenarios.length}`
);

console.log(
  `CRITICAL FAILURES: ${violations.length}`
);

console.log(
  `METADATA WARNINGS: ${warnings.length}`
);

if (warnings.length > 0) {
  console.log();
  console.log(
    "METADATA WARNINGS"
  );

  for (const warning of warnings) {
    console.log(
      `⚠️ ${warning}`
    );
  }
}

if (violations.length > 0) {
  console.log();
  console.log(
    "CRITICAL CONTRACT FAILURES"
  );

  for (const violation of violations) {
    console.log(
      `❌ ${violation}`
    );
  }

  process.exitCode = 1;
} else {
  console.log();
  console.log(
    "✅ ROUTING CONTACT CONTRACT PASSED"
  );
}

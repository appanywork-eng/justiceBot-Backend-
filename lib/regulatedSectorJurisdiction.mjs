import {
  NIGERIAN_POWER_PROVIDERS,
  NERC_NATIONAL_COMPLAINTS,
  NERC_ABUJA_FORUM,
  TRANSITIONED_STATE_REGULATORS,
} from "./nigeriaPowerRegistry.mjs";
import {
  NCC_TELECOM_ESCALATION,
  NIGERIAN_TELECOM_PROVIDERS,
} from "./nigeriaTelecomRegistry.mjs";
import {
  NCAA_AVIATION_ESCALATION,
  NSIB_AVIATION_SAFETY,
  NIGERIAN_AVIATION_PROVIDERS,
} from "./nigeriaAviationRegistry.mjs";

import {
  NIGERIAN_BANKING_PROVIDERS,
} from "./nigeriaBankingRegistry.mjs";

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clean(value, max = 300) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function aliasHit(text, alias) {
  const source =
    normalize(text);

  const target =
    normalize(alias);

  if (!source || !target) {
    return false;
  }

  if (
    target.length <= 4 &&
    !target.includes(" ")
  ) {
    return source
      .split(" ")
      .includes(target);
  }

  return (
    ` ${source} `
      .includes(
        ` ${target} `
      )
  );
}

function isNigeria(context) {
  const country =
    normalize(
      context?.country ||
        "Nigeria"
    );

  return (
    !country ||
    country === "nigeria" ||
    country.includes(
      "federal republic of nigeria"
    )
  );
}

const ESCALATION_STAGES =
  new Set([
    "provider contacted",
    "provider_contacted",
    "unresolved",
    "escalation",
    "escalate",
    "appeal",
    "regulator",
  ]);

const INITIAL_STAGES =
  new Set([
    "initial",
    "first contact",
    "first_contact",
    "not contacted",
    "not_contacted",
    "new complaint",
    "new_complaint",
  ]);

function hasPriorProviderComplaint(
  context
) {
  const stage =
    normalize(
      context?.escalationStage
    );

  if (
    ESCALATION_STAGES.has(
      stage
    )
  ) {
    return true;
  }

  if (
    INITIAL_STAGES.has(
      stage
    )
  ) {
    return false;
  }

  if (
    clean(
      context
        ?.priorComplaintReference,
      150
    )
  ) {
    return true;
  }

  const complaint =
    normalize(
      context?.complaint
    );

  const negative =
    /\b(have not|has not|had not|not yet|never)\s+(complained|reported|contacted|written|lodged)\b/i;

  if (
    negative.test(
      complaint
    )
  ) {
    return false;
  }

  const positivePatterns = [
    /\balready complained\b/i,
    /\bcomplained to\b/i,
    /\breported to\b/i,
    /\bcontacted customer care\b/i,
    /\bcontacted the bank\b/i,
    /\bcontacted the airline\b/i,
    /\bcontacted the operator\b/i,
    /\bcomplaint reference\b/i,
    /\bcomplaint ticket\b/i,
    /\bticket number\b/i,
    /\btracking number\b/i,
    /\breference number\b/i,
    /\bunresolved complaint\b/i,
    /\bfailed to resolve\b/i,
    /\brefused to resolve\b/i,
    /\bno response\b/i,
    /\bwithout response\b/i,
    /\bafter two weeks\b/i,
    /\bafter 2 weeks\b/i,
    /\bafter 15 working days\b/i,
    /\bdissatisfied with the response\b/i,
  ];

  return positivePatterns.some(
    (pattern) =>
      pattern.test(
        complaint
      )
  );
}

function isRegulatorLike(
  value
) {
  const text =
    normalize(value);

  if (!text) {
    return false;
  }

  const regulatorSignals = [
    "central bank",
    "cbn",
    "nigerian communications commission",
    "ncc",
    "nigerian civil aviation authority",
    "ncaa",
    "nigerian electricity regulatory commission",
    "nerc",
    "state electricity regulatory",
    "regulatory commission",
    "consumer protection department",
    "fccpc",
    "servicom",
    "federal ministry",
    "ndic",
  ];

  return regulatorSignals.some(
    (signal) =>
      aliasHit(
        text,
        signal
      )
  );
}

function findProvider(
  context,
  providers,
  {
    allowProvidedName = true,
  } = {}
) {
  const supplied =
    clean(
      context
        ?.institutionName,
      300
    );

  const complaint =
    clean(
      context?.complaint,
      10000
    );

  for (const provider of providers) {
    const aliases = [
      provider.name,
      ...(
        provider.aliases ||
        []
      ),
    ];

    if (
      aliases.some(
        (alias) =>
          aliasHit(
            supplied,
            alias
          )
      )
    ) {
      return provider.name;
    }
  }

  for (const provider of providers) {
    const aliases = [
      provider.name,
      ...(
        provider.aliases ||
        []
      ),
    ];

    if (
      aliases.some(
        (alias) =>
          aliasHit(
            complaint,
            alias
          )
      )
    ) {
      return provider.name;
    }
  }

  if (
    allowProvidedName &&
    supplied.length >= 2 &&
    !isRegulatorLike(
      supplied
    )
  ) {
    return supplied;
  }

  return "";
}

const POWER_PROVIDERS =
  NIGERIAN_POWER_PROVIDERS;

const TELECOM_PROVIDERS =
  NIGERIAN_TELECOM_PROVIDERS;

const BANK_PROVIDERS =
  NIGERIAN_BANKING_PROVIDERS;

const AVIATION_PROVIDERS =
  NIGERIAN_AVIATION_PROVIDERS;

const STATE_PATTERNS = [
  {
    key: "fct",
    aliases: [
      "FCT",
      "Abuja",
      "Federal Capital Territory",
    ],
  },
  {
    key: "abia",
    aliases: [
      "Abia",
      "Umuahia",
      "Aba",
    ],
  },
  {
    key: "anambra",
    aliases: [
      "Anambra",
      "Awka",
      "Onitsha",
      "Nnewi",
    ],
  },
  {
    key: "bayelsa",
    aliases: [
      "Bayelsa",
      "Yenagoa",
    ],
  },
  {
    key: "edo",
    aliases: [
      "Edo",
      "Benin City",
      "Auchi",
    ],
  },
  {
    key: "ekiti",
    aliases: [
      "Ekiti",
      "Ado Ekiti",
    ],
  },
  {
    key: "enugu",
    aliases: [
      "Enugu",
      "Nsukka",
    ],
  },
  {
    key: "gombe",
    aliases: [
      "Gombe",
    ],
  },
  {
    key: "imo",
    aliases: [
      "Imo",
      "Owerri",
    ],
  },
  {
    key: "kogi",
    aliases: [
      "Kogi",
      "Lokoja",
    ],
  },
  {
    key: "lagos",
    aliases: [
      "Lagos",
      "Ikeja",
      "Lekki",
      "Epe",
      "Badagry",
      "Ikorodu",
    ],
  },
  {
    key: "nasarawa",
    aliases: [
      "Nasarawa",
      "Lafia",
      "Keffi",
    ],
  },
  {
    key: "niger",
    aliases: [
      "Niger State",
      "Minna",
      "Suleja",
    ],
  },
  {
    key: "ogun",
    aliases: [
      "Ogun",
      "Abeokuta",
      "Ota",
    ],
  },
  {
    key: "ondo",
    aliases: [
      "Ondo",
      "Akure",
    ],
  },
  {
    key: "oyo",
    aliases: [
      "Oyo",
      "Ibadan",
      "Ogbomosho",
    ],
  },
  {
    key: "plateau",
    aliases: [
      "Plateau",
      "Jos",
    ],
  },
];

const STATE_REGULATORS =
  TRANSITIONED_STATE_REGULATORS;

function detectState(
  location
) {
  for (
    const entry
    of STATE_PATTERNS
  ) {
    if (
      entry.aliases.some(
        (alias) =>
          aliasHit(
            location,
            alias
          )
      )
    ) {
      return entry.key;
    }
  }

  return "";
}

function unmatched(
  reason
) {
  return {
    matched: false,
    reason,
  };
}

function providerFirstDecision({
  sector,
  provider,
  routeKey,
  purpose,
  note,
}) {
  return {
    matched: true,
    sector,
    caseType:
      "service_delivery",
    jurisdiction:
      "national_regulated_service",
    routeKey,
    primaryInstitution:
      provider,
    ccInstitutions: [],
    deliveryMethod:
      "email_or_provider_complaint_channel",
    emailRoutingExpected:
      true,
    documentPurpose:
      purpose,
    routingNote:
      note,
  };
}

function powerAuthorityChannel(
  authority
) {
  const contact =
    authority?.contact || {};

  const verification =
    authority?.verification || {};

  return {
    deliveryMethod:
      verification
        .direct_email_verified
        ? "verified_email_or_physical_filing"
        : authority
            ?.dynamic_route
          ? "official_directory_or_physical_filing"
          : "official_regulator_channel",

    emailRoutingExpected:
      Boolean(
        verification
          .direct_email_verified
      ),

    submissionUrl:
      contact.complaint_ticket ||
      contact.complaint_guidance ||
      contact.website ||
      contact.forum_directory ||
      contact.official_directory ||
      "",

    contactEmails:
      Array.isArray(
        contact.emails
      )
        ? contact.emails
        : [],

    contactPhoneNumbers:
      Array.isArray(
        contact.phone_numbers
      )
        ? contact.phone_numbers
        : [],

    contactAddress:
      contact.address || "",

    sourceUrls:
      Array.isArray(
        verification.source_urls
      )
        ? verification.source_urls
        : [],
  };
}

export function resolvePowerRouting(
  context = {}
) {
  if (!isNigeria(context)) {
    return unmatched(
      "country_not_supported"
    );
  }

  const provider =
    findProvider(
      context,
      POWER_PROVIDERS
    );

  const escalated =
    hasPriorProviderComplaint(
      context
    );

  const state =
    detectState(
      context.issueLocation ||
      context.petitionerAddress
    );

  if (!escalated) {
    if (!provider) {
      return unmatched(
        "electricity_provider_required"
      );
    }

    return providerFirstDecision({
      sector: "power",
      provider,
      routeKey:
        "power_provider_first",
      purpose:
        "Electricity customer complaint to the responsible distribution company",
      note:
        "Submit the complaint first to the Customer Complaints Unit of the electricity provider and retain its written acknowledgement or reference number.",
    });
  }

  const stateRegulator =
    STATE_REGULATORS[state];

  if (stateRegulator) {
    return {
      matched: true,
      sector: "power",
      caseType:
        "service_delivery",
      jurisdiction:
        "state_electricity_market",
      jurisdictionCode:
        state,
      routeKey:
        "state_electricity_regulator",
      primaryInstitution:
        stateRegulator.name,
      ccInstitutions:
        provider
          ? [provider]
          : [],
      ...powerAuthorityChannel(
        stateRegulator
      ),

      documentPurpose:
        "Escalation of an unresolved electricity-service complaint to the state electricity regulator",

      routingNote:
        stateRegulator
          .dynamic_route
          ? "The state has transitioned to intrastate electricity regulation. Resolve the current filing channel through the official NERC SERC directory or the regulator's official website before submission."
          : "The state has transitioned to intrastate electricity regulation. Escalate the unresolved provider complaint through the verified state-regulator channel rather than a NERC Forum office.",
    };
  }

  if (state === "fct") {
    return {
      matched: true,
      sector: "power",
      caseType:
        "service_delivery",
      jurisdiction:
        "nerc_consumer_forum",
      jurisdictionCode:
        "fct",
      routeKey:
        "nerc_abuja_forum",
      primaryInstitution:
        NERC_ABUJA_FORUM.name,

      ccInstitutions:
        provider
          ? [provider]
          : [],

      ...powerAuthorityChannel(
        NERC_ABUJA_FORUM
      ),

      documentPurpose:
        "Escalation of an unresolved electricity-service complaint to the NERC Abuja Forum",

      routingNote:
        "Use the verified NERC Abuja Forum channel only after the electricity provider has failed to resolve the written complaint satisfactorily.",
    };
  }

  return {
    matched: true,
    sector: "power",
    caseType:
      "service_delivery",
    jurisdiction:
      "federal_electricity_market",
    routeKey:
      "nerc_forum_or_ticket",
    primaryInstitution:
      NERC_NATIONAL_COMPLAINTS.name,

    ccInstitutions:
      provider
        ? [provider]
        : [],

    ...powerAuthorityChannel(
      NERC_NATIONAL_COMPLAINTS
    ),

    deliveryMethod:
      "official_ticket_or_consumer_forum",

    emailRoutingExpected:
      false,

    documentPurpose:
      "Escalation of an unresolved electricity-service complaint through the applicable NERC redress channel",

    routingNote:
      "Use the appropriate NERC Consumer Forum or official complaint-ticket channel after first complaining in writing to the responsible electricity provider.",
  };
}

function findTelecomProviderRecord(
  context
) {
  const sources = [
    clean(
      context?.institutionName,
      300
    ),

    clean(
      context?.complaint,
      10000
    ),
  ];

  for (
    const source
    of sources
  ) {
    for (
      const provider
      of TELECOM_PROVIDERS
    ) {
      const aliases = [
        provider.name,
        ...(
          provider.aliases ||
          []
        ),
      ];

      if (
        aliases.some(
          alias =>
            aliasHit(
              source,
              alias
            )
        )
      ) {
        return provider;
      }
    }
  }

  return null;
}

function telecomContactMetadata(
  authority,
  {
    portalOnly = false,
  } = {}
) {
  const contact =
    authority?.contact || {};

  const verification =
    authority?.verification || {};

  const verified =
    verification.status ===
      "VERIFIED_OFFICIAL_SOURCE";

  const emails =
    Array.isArray(
      contact.emails
    )
      ? [...contact.emails]
      : [];

  const phones =
    Array.isArray(
      contact.phones
    )
      ? [...contact.phones]
      : [];

  const whatsapp =
    Array.isArray(
      contact.whatsapp
    )
      ? [...contact.whatsapp]
      : [];

  const emailAllowed =
    verified &&
    !portalOnly &&
    emails.length > 0;

  return {
    deliveryMethod:
      portalOnly
        ? "official_consumer_complaint_portal"
        : emailAllowed
          ? "verified_email_or_provider_complaint_channel"
          : "official_provider_channel_resolution_required",

    emailRoutingExpected:
      emailAllowed,

    submissionUrl:
      contact.complaint_portal ||
      contact.complaint_management_system ||
      contact.website ||
      "",

    contactEmails:
      emailAllowed
        ? emails
        : [],

    contactPhoneNumbers:
      phones,

    contactWhatsApp:
      whatsapp,

    contactAddress:
      contact.address || "",

    sourceUrls:
      Array.isArray(
        verification.source_urls
      )
        ? [...verification.source_urls]
        : [],
  };
}

export function resolveTelecomRouting(
  context = {}
) {
  if (!isNigeria(context)) {
    return unmatched(
      "country_not_supported"
    );
  }

  const providerRecord =
    findTelecomProviderRecord(
      context
    );

  const providerName =
    providerRecord?.name ||
    findProvider(
      context,
      TELECOM_PROVIDERS
    );

  const escalated =
    hasPriorProviderComplaint(
      context
    );

  if (!escalated) {
    if (!providerName) {
      return unmatched(
        "telecom_provider_required"
      );
    }

    if (!providerRecord) {
      return {
        matched: true,

        sector:
          "telecoms",

        caseType:
          "service_delivery",

        jurisdiction:
          "national_telecommunications_service",

        routeKey:
          "telecom_provider_first_unverified_channel",

        primaryInstitution:
          providerName,

        ccInstitutions: [],

        deliveryMethod:
          "official_provider_channel_resolution_required",

        emailRoutingExpected:
          false,

        submissionUrl: "",

        contactEmails: [],

        contactPhoneNumbers: [],

        contactWhatsApp: [],

        contactAddress: "",

        sourceUrls: [],

        documentPurpose:
          "Telecommunications consumer complaint to the responsible service provider",

        routingNote:
          "Confirm the provider's complaint channel through its official website. Do not use a guessed email address, and retain the resulting complaint ticket or reference.",
      };
    }

    return {
      matched: true,

      sector:
        "telecoms",

      caseType:
        "service_delivery",

      jurisdiction:
        "national_telecommunications_service",

      routeKey:
        "telecom_provider_first",

      primaryInstitution:
        providerRecord.name,

      ccInstitutions: [],

      ...telecomContactMetadata(
        providerRecord
      ),

      documentPurpose:
        "Telecommunications consumer complaint to the responsible service provider",

      routingNote:
        "Submit the complaint through the verified operator channel and retain its complaint ticket or reference for any regulatory escalation.",
    };
  }

  return {
    matched: true,

    sector:
      "telecoms",

    caseType:
      "service_delivery",

    jurisdiction:
      "national_telecommunications_regulator",

    routeKey:
      "ncc_consumer_portal",

    primaryInstitution:
      NCC_TELECOM_ESCALATION.name,

    ccInstitutions:
      providerName
        ? [providerName]
        : [],

    ...telecomContactMetadata(
      NCC_TELECOM_ESCALATION,
      {
        portalOnly: true,
      }
    ),

    documentPurpose:
      "Escalation of an unresolved telecommunications consumer complaint to the NCC",

    routingNote:
      "Submit through the official NCC consumer-complaint portal and include the operator complaint ticket or reference. The NCC route does not use an invented complaint email.",
  };
}

export function resolveBankingRouting(
  context = {}
) {
  if (!isNigeria(context)) {
    return unmatched(
      "country_not_supported"
    );
  }

  const provider =
    findProvider(
      context,
      BANK_PROVIDERS
    );

  const escalated =
    hasPriorProviderComplaint(
      context
    );

  if (!escalated) {
    if (!provider) {
      return unmatched(
        "financial_institution_required"
      );
    }

    return providerFirstDecision({
      sector: "banking",
      provider,
      routeKey:
        "bank_provider_first",
      purpose:
        "Formal consumer complaint to the responsible bank or regulated financial institution",
      note:
        "Submit the complaint to the financial institution first and retain its complaint reference and supporting evidence.",
    });
  }

  return {
    matched: true,
    sector: "banking",
    caseType:
      "service_delivery",
    jurisdiction:
      "national_financial_regulator",
    routeKey:
      "cbn_consumer_protection",
    primaryInstitution:
      "Central Bank of Nigeria (CBN)",
    ccInstitutions:
      provider
        ? [provider]
        : [],
    deliveryMethod:
      "verified_email_or_complaints_portal",
    emailRoutingExpected:
      true,
    documentPurpose:
      "Escalation of an unresolved financial-institution complaint to the CBN Consumer Protection Department",
    routingNote:
      "Escalate after first lodging the complaint with the financial institution. Include its complaint reference and evidence of the earlier complaint.",
    sourceUrls: [
      "https://www.cbn.gov.ng/FinInc/FinLit/LodgeComplaint.html",
      "https://complaintsportal.cbn.gov.ng/"
    ],
  };
}

function findAviationProviderRecord(
  context
) {
  const sources = [
    clean(
      context?.institutionName,
      300
    ),

    clean(
      context?.complaint,
      10000
    ),
  ];

  for (
    const source
    of sources
  ) {
    for (
      const provider
      of AVIATION_PROVIDERS
    ) {
      const aliases = [
        provider.name,
        ...(
          provider.aliases ||
          []
        ),
      ];

      if (
        aliases.some(
          alias =>
            aliasHit(
              source,
              alias
            )
        )
      ) {
        return provider;
      }
    }
  }

  return null;
}

function aviationAuthorityMetadata(
  authority,
  {
    safetyRoute = false,
  } = {}
) {
  const contact =
    authority?.contact || {};

  const verification =
    authority?.verification || {};

  const verified =
    verification.status ===
      "VERIFIED_OFFICIAL_SOURCE";

  const emails =
    Array.isArray(
      contact.emails
    )
      ? [...contact.emails]
      : [];

  const phones =
    Array.isArray(
      contact.phones
    )
      ? [...contact.phones]
      : [];

  const emergencyPhones =
    Array.isArray(
      contact.emergency_phones
    )
      ? [...contact.emergency_phones]
      : [];

  return {
    deliveryMethod:
      safetyRoute
        ? "emergency_line_and_secure_reporting_portal"
        : emails.length > 0
          ? "verified_email_or_official_complaint_portal"
          : "official_aviation_complaint_channel",

    emailRoutingExpected:
      verified &&
      emails.length > 0,

    submissionUrl:
      safetyRoute
        ? (
            contact.reporting_portal ||
            contact.reporting_guidelines ||
            contact.website ||
            ""
          )
        : (
            contact.complaint_portal ||
            contact.complaint_form ||
            contact.website ||
            ""
          ),

    contactEmails:
      verified
        ? emails
        : [],

    contactPhoneNumbers:
      phones,

    contactEmergencyPhoneNumbers:
      emergencyPhones,

    contactAddress:
      contact.address || "",

    sourceUrls:
      Array.isArray(
        verification.source_urls
      )
        ? [...verification.source_urls]
        : [],
  };
}

function isAviationSafetyOccurrence(
  context = {}
) {
  const text =
    normalize(
      [
        context.complaint,
        context.institutionName,
      ]
        .filter(Boolean)
        .join(" ")
    );

  const strongSafetyPatterns = [
    /\b(aircraft|plane|helicopter) crash\b/i,
    /\baviation accident\b/i,
    /\baircraft accident\b/i,
    /\bserious aviation incident\b/i,
    /\bserious aircraft incident\b/i,
    /\brunway excursion\b/i,
    /\brunway incursion\b/i,
    /\bmid air collision\b/i,
    /\bmidair collision\b/i,
    /\baircraft collision\b/i,
    /\baircraft fire\b/i,
    /\bfire on board\b/i,
    /\bemergency landing\b/i,
    /\bforced landing\b/i,
    /\bmissing aircraft\b/i,
    /\bfatal aviation occurrence\b/i,
    /\bserious injury on board\b/i,
    /\bengine failure in flight\b/i,
  ];

  return strongSafetyPatterns.some(
    pattern =>
      pattern.test(
        text
      )
  );
}

export function resolveAviationRouting(
  context = {}
) {
  if (!isNigeria(context)) {
    return unmatched(
      "country_not_supported"
    );
  }

  if (
    isAviationSafetyOccurrence(
      context
    )
  ) {
    return {
      matched: true,

      sector:
        "aviation",

      caseType:
        "aviation_safety",

      jurisdiction:
        "national_transport_safety_investigation",

      routeKey:
        "nsib_accident_or_serious_incident",

      primaryInstitution:
        NSIB_AVIATION_SAFETY.name,

      ccInstitutions: [],

      ...aviationAuthorityMetadata(
        NSIB_AVIATION_SAFETY,
        {
          safetyRoute: true,
        }
      ),

      documentPurpose:
        "Immediate notification of an aviation accident or serious incident to the Nigerian Safety Investigation Bureau",

      routingNote:
        "Report accidents and serious incidents to NSIB without delay. Where there is an active emergency, contact emergency services and the published NSIB emergency lines before completing a written report.",
    };
  }

  const providerRecord =
    findAviationProviderRecord(
      context
    );

  const providerName =
    providerRecord?.name ||
    findProvider(
      context,
      AVIATION_PROVIDERS
    );

  const escalated =
    hasPriorProviderComplaint(
      context
    );

  if (!escalated) {
    if (!providerName) {
      return unmatched(
        "aviation_provider_required"
      );
    }

    if (!providerRecord) {
      return {
        matched: true,

        sector:
          "aviation",

        caseType:
          "service_delivery",

        jurisdiction:
          "national_aviation_service",

        routeKey:
          "aviation_provider_first",

        primaryInstitution:
          providerName,

        ccInstitutions: [],

        deliveryMethod:
          "official_provider_channel_resolution_required",

        emailRoutingExpected:
          false,

        submissionUrl: "",

        contactEmails: [],

        contactPhoneNumbers: [],

        contactEmergencyPhoneNumbers: [],

        contactAddress: "",

        sourceUrls: [],

        documentPurpose:
          "Passenger or aviation-service complaint to the responsible airline or service provider",

        routingNote:
          "Confirm the airline's complaint channel through its official website. Do not use a guessed email address, and retain the response or complaint reference.",
      };
    }

    return {
      matched: true,

      sector:
        "aviation",

      caseType:
        "service_delivery",

      jurisdiction:
        "national_aviation_service",

      routeKey:
        "aviation_provider_first",

      primaryInstitution:
        providerRecord.name,

      ccInstitutions: [],

      ...aviationAuthorityMetadata(
        providerRecord
      ),

      documentPurpose:
        "Passenger or aviation-service complaint to the responsible airline or service provider",

      routingNote:
        "Submit the complaint first through the airline's verified complaint channel and retain its response or complaint reference.",
    };
  }

  return {
    matched: true,

    sector:
      "aviation",

    caseType:
      "service_delivery",

    jurisdiction:
      "national_civil_aviation_regulator",

    routeKey:
      "ncaa_consumer_protection",

    primaryInstitution:
      NCAA_AVIATION_ESCALATION.name,

    ccInstitutions:
      providerName
        ? [providerName]
        : [],

    ...aviationAuthorityMetadata(
      NCAA_AVIATION_ESCALATION
    ),

    documentPurpose:
      "Escalation of an unresolved aviation consumer complaint to NCAA Consumer Protection",

    routingNote:
      "Escalate after giving the airline or service provider an opportunity to resolve the complaint. Include the provider complaint reference, ticket, baggage tag, correspondence and other relevant evidence.",
  };
}


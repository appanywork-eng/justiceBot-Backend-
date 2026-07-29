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

const POWER_PROVIDERS = [
  {
    name:
      "Abuja Electricity Distribution Plc (AEDC)",
    aliases: [
      "AEDC",
      "Abuja Electricity",
      "Abuja DisCo",
    ],
  },
  {
    name:
      "Eko Electricity Distribution Company (EKEDC)",
    aliases: [
      "EKEDC",
      "Eko DisCo",
      "Eko Electric",
    ],
  },
  {
    name:
      "Ikeja Electric Plc (IE)",
    aliases: [
      "Ikeja Electric",
      "Ikeja DisCo",
    ],
  },
  {
    name:
      "Benin Electricity Distribution Plc (BEDC)",
    aliases: [
      "BEDC",
      "Benin Electric",
      "Benin DisCo",
    ],
  },
  {
    name:
      "Ibadan Electricity Distribution Company (IBEDC)",
    aliases: [
      "IBEDC",
      "Ibadan DisCo",
    ],
  },
  {
    name:
      "Jos Electricity Distribution Plc (JED Plc)",
    aliases: [
      "JED",
      "JED Plc",
      "Jos DisCo",
    ],
  },
  {
    name:
      "Kaduna Electric",
    aliases: [
      "KAEDCO",
      "Kaduna DisCo",
    ],
  },
  {
    name:
      "Kano Electricity Distribution Company (KEDCO)",
    aliases: [
      "KEDCO",
      "Kano DisCo",
    ],
  },
  {
    name:
      "Yola Electricity Distribution Company (YEDC)",
    aliases: [
      "YEDC",
      "Yola DisCo",
    ],
  },
  {
    name:
      "Enugu Electricity Distribution Company (EEDC)",
    aliases: [
      "EEDC",
      "Enugu DisCo",
    ],
  },
  {
    name:
      "Port Harcourt Electricity Distribution Plc (PHED)",
    aliases: [
      "PHED",
      "PHEDC",
      "Port Harcourt DisCo",
    ],
  },
];

const TELECOM_PROVIDERS = [
  {
    name: "MTN Nigeria",
    aliases: [
      "MTN",
      "MTNNG",
    ],
  },
  {
    name: "Globacom (Glo)",
    aliases: [
      "Glo",
      "Globacom",
    ],
  },
  {
    name: "Airtel Nigeria",
    aliases: [
      "Airtel",
      "Airtel NG",
    ],
  },
  {
    name: "9mobile",
    aliases: [
      "9 mobile",
      "Etisalat Nigeria",
    ],
  },
];

const BANK_PROVIDERS = [
  {
    name:
      "Guaranty Trust Bank PLC",
    aliases: [
      "GTBank",
      "GTB",
      "Guaranty Trust Bank",
    ],
  },
  {
    name:
      "Access Bank PLC",
    aliases: [
      "Access Bank",
    ],
  },
  {
    name:
      "First Bank of Nigeria Limited",
    aliases: [
      "FirstBank",
      "First Bank",
    ],
  },
  {
    name:
      "United Bank for Africa PLC",
    aliases: [
      "UBA",
    ],
  },
  {
    name:
      "Zenith Bank PLC",
    aliases: [
      "Zenith Bank",
    ],
  },
  {
    name:
      "Fidelity Bank PLC",
    aliases: [
      "Fidelity Bank",
    ],
  },
  {
    name:
      "First City Monument Bank PLC",
    aliases: [
      "FCMB",
    ],
  },
  {
    name:
      "Stanbic IBTC Bank PLC",
    aliases: [
      "Stanbic IBTC",
      "Stanbic",
    ],
  },
  {
    name:
      "Sterling Bank PLC",
    aliases: [
      "Sterling Bank",
    ],
  },
  {
    name:
      "Wema Bank PLC",
    aliases: [
      "Wema Bank",
    ],
  },
  {
    name:
      "Polaris Bank Limited",
    aliases: [
      "Polaris Bank",
    ],
  },
  {
    name:
      "Union Bank of Nigeria PLC",
    aliases: [
      "Union Bank",
    ],
  },
  {
    name: "PalmPay",
    aliases: [
      "Palm Pay",
    ],
  },
  {
    name: "Paga",
    aliases: [
      "myPaga",
    ],
  },
];

const AVIATION_PROVIDERS = [
  {
    name: "Air Peace",
    aliases: [
      "Air Peace Airline",
      "Air Peace Airlines",
    ],
  },
  {
    name: "Arik Air",
    aliases: [
      "Arik",
    ],
  },
  {
    name: "Ibom Air",
    aliases: [
      "IbomAir",
      "Ibom Airlines",
    ],
  },
  {
    name: "Dana Air",
    aliases: [
      "Dana",
      "Dana Airlines",
    ],
  },
  {
    name:
      "Nigerian Aviation Handling Company (NAHCO Aviance)",
    aliases: [
      "NAHCO",
      "NAHCO Aviance",
    ],
  },
  {
    name:
      "Skyway Aviation Handling Company (SAHCO PLC)",
    aliases: [
      "SAHCO",
      "SAHCO PLC",
    ],
  },
];

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

const STATE_REGULATORS = {
  abia: {
    name:
      "Abia State Electricity Regulatory Authority",
    emailAvailable: true,
  },
  anambra: {
    name:
      "Anambra State Electricity Regulatory Commission",
    emailAvailable: true,
  },
  bayelsa: {
    name:
      "Bayelsa State Electricity Regulatory Authority",
    emailAvailable: true,
  },
  edo: {
    name:
      "Edo State Electricity Regulatory Commission",
    emailAvailable: false,
  },
  ekiti: {
    name:
      "Ekiti State Electricity Regulatory Bureau",
    emailAvailable: false,
  },
  enugu: {
    name:
      "Enugu State Electricity Regulatory Commission",
    emailAvailable: true,
  },
  gombe: {
    name:
      "Gombe State Electricity Regulatory Commission",
    emailAvailable: true,
  },
  imo: {
    name:
      "Imo State Electricity Regulatory Commission",
    emailAvailable: false,
  },
  kogi: {
    name:
      "Kogi State Electricity Regulatory Commission",
    emailAvailable: true,
  },
  lagos: {
    name:
      "Lagos State Electricity Regulatory Commission",
    emailAvailable: true,
  },
  nasarawa: {
    name:
      "Nasarawa State Electricity Regulatory Commission",
    emailAvailable: false,
  },
  niger: {
    name:
      "Niger State Electricity Regulatory Commission",
    emailAvailable: true,
  },
  ogun: {
    name:
      "Ogun State Electricity Regulatory Commission",
    emailAvailable: false,
  },
  ondo: {
    name:
      "Ondo State Electricity Regulatory Bureau",
    emailAvailable: true,
  },
  oyo: {
    name:
      "Oyo State Electricity Regulatory Commission",
    emailAvailable: false,
  },
  plateau: {
    name:
      "Plateau State Electricity Regulatory Commission",
    emailAvailable: false,
  },
};

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
      deliveryMethod:
        stateRegulator
          .emailAvailable
          ? "verified_email_or_physical_filing"
          : "official_directory_or_physical_filing",
      emailRoutingExpected:
        stateRegulator
          .emailAvailable,
      documentPurpose:
        "Escalation of an unresolved electricity-service complaint to the state electricity regulator",
      routingNote:
        "The state has transitioned to intrastate electricity regulation. Escalate an unresolved provider complaint to the state regulator rather than a NERC Forum office.",
      sourceUrls: [
        "https://nerc.gov.ng/resources/sercs/",
        "https://nerc.gov.ng/media/the-transition-to-state-electricity-regulation-key-takeaways-the-new-serc-directory/"
      ],
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
        "NERC Abuja Forum",
      ccInstitutions:
        provider
          ? [provider]
          : [],
      deliveryMethod:
        "verified_email_or_physical_filing",
      emailRoutingExpected:
        true,
      documentPurpose:
        "Escalation of an unresolved electricity-service complaint to the NERC Abuja Forum",
      routingNote:
        "Use the NERC Abuja Forum after the electricity provider has failed to resolve the written complaint satisfactorily.",
      sourceUrls: [
        "https://nerc.gov.ng/forum-offices/",
        "https://nerc.gov.ng/need-help/services/how-to-file-a-complaint/"
      ],
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
      "Nigerian Electricity Regulatory Commission (NERC)",
    ccInstitutions:
      provider
        ? [provider]
        : [],
    deliveryMethod:
      "official_ticket_or_consumer_forum",
    emailRoutingExpected:
      false,
    documentPurpose:
      "Escalation of an unresolved electricity-service complaint through the applicable NERC redress channel",
    routingNote:
      "Use the nearest NERC Consumer Forum or the official NERC complaint-ticket channel after first complaining in writing to the provider.",
    sourceUrls: [
      "https://nerc.gov.ng/need-help/services/how-to-file-a-complaint/",
      "https://nerc.gov.ng/forum-offices/"
    ],
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

  const provider =
    findProvider(
      context,
      TELECOM_PROVIDERS
    );

  const escalated =
    hasPriorProviderComplaint(
      context
    );

  if (!escalated) {
    if (!provider) {
      return unmatched(
        "telecom_provider_required"
      );
    }

    return providerFirstDecision({
      sector: "telecoms",
      provider,
      routeKey:
        "telecom_provider_first",
      purpose:
        "Telecommunications consumer complaint to the responsible service provider",
      note:
        "Submit the complaint to the operator first and retain its complaint ticket or reference for any regulatory escalation.",
    });
  }

  return {
    matched: true,
    sector: "telecoms",
    caseType:
      "service_delivery",
    jurisdiction:
      "national_telecommunications_regulator",
    routeKey:
      "ncc_consumer_portal",
    primaryInstitution:
      "Nigerian Communications Commission (NCC)",
    ccInstitutions:
      provider
        ? [provider]
        : [],
    deliveryMethod:
      "official_consumer_complaint_portal",
    emailRoutingExpected:
      false,
    documentPurpose:
      "Escalation of an unresolved telecommunications consumer complaint to the NCC",
    routingNote:
      "Submit the complaint through the NCC official consumer-complaint form and include the operator's complaint ticket or reference where available.",
    sourceUrls: [
      "https://consumer.ncc.gov.ng/consumer-complaints/complaint-form",
      "https://ncc-ccms.ncc.gov.ng/login"
    ],
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

export function resolveAviationRouting(
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
      AVIATION_PROVIDERS
    );

  const escalated =
    hasPriorProviderComplaint(
      context
    );

  if (!escalated) {
    if (!provider) {
      return unmatched(
        "aviation_provider_required"
      );
    }

    return providerFirstDecision({
      sector: "aviation",
      provider,
      routeKey:
        "aviation_provider_first",
      purpose:
        "Passenger or aviation-service complaint to the responsible airline or service provider",
      note:
        "Submit the complaint first to the airline or aviation service provider's Customer Affairs Unit and retain its response or complaint reference.",
    });
  }

  return {
    matched: true,
    sector: "aviation",
    caseType:
      "service_delivery",
    jurisdiction:
      "national_civil_aviation_regulator",
    routeKey:
      "ncaa_consumer_protection",
    primaryInstitution:
      "Nigerian Civil Aviation Authority (NCAA)",
    ccInstitutions:
      provider
        ? [provider]
        : [],
    deliveryMethod:
      "verified_email_or_consumer_portal",
    emailRoutingExpected:
      true,
    documentPurpose:
      "Escalation of an unresolved aviation consumer complaint to NCAA Consumer Protection",
    routingNote:
      "Escalate after giving the airline or service provider an opportunity to resolve the complaint. Attach tickets, baggage tags, correspondence and other relevant evidence.",
    sourceUrls: [
      "https://cpd.ncaa.gov.ng/",
      "https://ncaa.gov.ng/report-forms/complaint-form/"
    ],
  };
}

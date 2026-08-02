import {
  EFCC_FINANCIAL_CRIME_REPORTING,
  ICPC_CORRUPTION_PETITIONS,
  CCB_CODE_OF_CONDUCT_PETITIONS,
  BPP_PROCUREMENT_PETITIONS,
  NIGERIAN_ANTI_CORRUPTION_AUTHORITIES,
} from "./nigeriaAntiCorruptionRegistry.mjs";

import {
  NIGERIAN_DIPLOMATIC_MISSION_DIRECTORY,
  MFA_CONSULAR_SERVICES,
  NIDCOM_DIASPORA_SUPPORT,
  NIS_PASSPORT_SUPPORT,
  NAPTIP_TRAFFICKING_REPORT,
} from "./nigeriaDiasporaRegistry.mjs";

function clean(
  value,
  maxLength = 500
) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalize(value) {
  return clean(
    value,
    10000
  )
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function aliasHit(
  text,
  alias
) {
  const source =
    normalize(text);

  const target =
    normalize(alias);

  if (
    !source ||
    !target
  ) {
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

function includesAny(
  text,
  terms
) {
  return terms.some(
    (term) =>
      aliasHit(
        text,
        term
      )
  );
}

function uniqueNames(
  values
) {
  return [
    ...new Set(
      values
        .map(
          (value) =>
            clean(
              value,
              300
            )
        )
        .filter(Boolean)
    ),
  ];
}

function unmatched(reason) {
  return {
    matched: false,
    reason,
  };
}

function isEscalated(
  context
) {
  const stage =
    normalize(
      context
        ?.escalationStage
    );

  if (
    [
      "unresolved",
      "escalation",
      "escalate",
      "appeal",
      "provider contacted",
      "provider_contacted",
      "regulator",
    ].includes(stage)
  ) {
    return true;
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

  return includesAny(
    context?.complaint,
    [
      "already complained",
      "complained to",
      "reported to",
      "complaint reference",
      "ticket number",
      "tracking number",
      "reference number",
      "failed to resolve",
      "refused to resolve",
      "remains unresolved",
      "unresolved complaint",
      "no response",
      "ignored my complaint",
      "without response",
    ]
  );
}

function domesticRemediesExhausted(
  context
) {
  const text =
    normalize(
      context?.complaint
    );

  return includesAny(
    text,
    [
      "exhausted domestic remedies",
      "all domestic remedies have been exhausted",
      "final domestic decision",
      "supreme court final decision",
      "court of appeal final decision",
      "domestic remedies are unavailable",
      "domestic remedies are ineffective",
      "domestic remedies are unduly prolonged",
      "local remedies are unavailable",
      "local remedies are ineffective",
      "local remedies are unduly prolonged",
    ]
  );
}

function hasActiveEmergency(
  text
) {
  return includesAny(
    text,
    [
      "currently under attack",
      "attack is ongoing",
      "being attacked right now",
      "currently being kidnapped",
      "kidnapping is ongoing",
      "life is in immediate danger",
      "immediate threat to life",
      "currently trapped",
      "active shooter",
    ]
  );
}

function hasHumanRightsIssue(
  text
) {
  return includesAny(
    text,
    [
      "unlawful detention",
      "arbitrary detention",
      "political detention",
      "torture",
      "forced disappearance",
      "enforced disappearance",
      "extrajudicial killing",
      "freedom of expression",
      "media repression",
      "attack on journalists",
      "suppression of protesters",
      "religious persecution",
      "ethnic persecution",
      "fair hearing denied",
      "access to lawyer denied",
      "systematic rights violation",
      "human rights violation",
    ]
  );
}

/* ======================================================
   GENERAL PUBLIC COMPLAINTS
====================================================== */

export function resolveGeneralRouting(
  context = {}
) {
  const text =
    normalize(
      [
        context.institutionName,
        context.complaint,
      ].join(" ")
    );

  const cc = [];

  const rightsIssue =
    hasHumanRightsIssue(
      text
    );

  const publicServiceIssue =
    includesAny(
      text,
      [
        "federal ministry",
        "state ministry",
        "government agency",
        "government department",
        "public authority",
        "public office",
        "civil service",
        "public servant",
        "local government",
        "administrative delay",
        "refusal to act",
        "failure to respond",
        "application delay",
        "certificate delay",
        "approval delay",
        "pension delay",
        "salary delay",
        "benefit delay",
        "service delivery",
      ]
    );

  const consumerIssue =
    includesAny(
      text,
      [
        "consumer complaint",
        "poor service",
        "unfair charge",
        "illegal charge",
        "refund refused",
        "service not delivered",
        "defective service",
        "company refused",
        "business refused",
        "vendor refused",
        "merchant refused",
      ]
    );

  if (rightsIssue) {
    cc.push(
      "National Human Rights Commission (NHRC)"
    );
  }

  if (publicServiceIssue) {
    cc.push(
      "SERVICOM"
    );
  }

  if (consumerIssue) {
    cc.push(
      "Federal Competition and Consumer Protection Commission (FCCPC)"
    );
  }

  return {
    matched: true,
    sector: "general",
    caseType:
      rightsIssue
        ? "human_rights"
        : publicServiceIssue
        ? "administrative_delay"
        : "general_complaint",
    jurisdiction:
      "nigerian_ombudsman",
    routeKey:
      "pcc_general_complaint",
    primaryInstitution:
      "Public Complaints Commission (PCC)",
    ccInstitutions:
      uniqueNames(cc),
    deliveryMethod:
      "verified_email_or_physical_filing",
    emailRoutingExpected:
      true,
    documentPurpose:
      "General administrative or public complaint requesting investigation and appropriate redress",
    routingNote:
      "PCC is the primary general-complaint route. SERVICOM, NHRC and FCCPC are included only where the facts raise their specific public-service, human-rights or consumer-protection mandates.",
    submissionUrl:
      "https://pcc.gov.ng/procedures-for-lodging-complaints/",
    sourceUrls: [
      "https://pcc.gov.ng/contact-us/",
      "https://pcc.gov.ng/procedures-for-lodging-complaints/",
    ],
  };
}

/* ======================================================
   ANTI-CORRUPTION
====================================================== */

const ANTI_CORRUPTION_AUTHORITY_BY_NAME =
  new Map(
    NIGERIAN_ANTI_CORRUPTION_AUTHORITIES.map(
      authority => [
        authority.name,
        authority,
      ]
    )
  );


function antiCorruptionDecision({
  routeKey,
  primaryInstitution,
  ccInstitutions = [],
  purpose,
  note,
  submissionUrl,
}) {
  const authority =
    ANTI_CORRUPTION_AUTHORITY_BY_NAME.get(
      primaryInstitution
    );

  return {
    matched: true,
    sector:
      "anti_corruption",
    caseType:
      "corruption_allegation",
    jurisdiction:
      "national_anti_corruption",
    routeKey,
    primaryInstitution,
    ccInstitutions:
      uniqueNames(
        ccInstitutions
      ),
    deliveryMethod:
      "verified_email_or_official_portal",
    emailRoutingExpected:
      true,
    documentPurpose:
      purpose,
    routingNote:
      note,
    submissionUrl,
    sourceUrls:
      authority
        ?.verification
        ?.source_urls || [],
  };
}

export function resolveAntiCorruptionRouting(
  context = {}
) {
  const text =
    normalize(
      [
        context.institutionName,
        context.complaint,
      ].join(" ")
    );

  if (
    hasActiveEmergency(
      text
    )
  ) {
    return {
      matched: true,
      sector:
        "anti_corruption",
      caseType:
        "active_emergency",
      jurisdiction:
        "immediate_protection",
      routeKey:
        "whistleblower_immediate_danger",
      primaryInstitution:
        "The Nearest Police Station or Appropriate Protection Authority",
      ccInstitutions: [],
      deliveryMethod:
        "immediate_emergency_report",
      emailRoutingExpected:
        false,
      blockGeneration:
        true,
      userMessage:
        "This complaint appears to describe an immediate threat to life or safety. Do not rely on an ordinary petition for emergency protection. Contact the nearest police station or appropriate emergency authority, move to a safer location where possible, and preserve evidence only when it is safe.",
      documentPurpose:
        "Immediate safety and protection reporting",
      routingNote:
        "PetitionDesk is not an emergency-response service.",
    };
  }

  const procurementIssue =
    includesAny(
      text,
      [
        "procurement fraud",
        "contract inflation",
        "over invoicing",
        "bid rigging",
        "contract splitting",
        "inflated contract",
        "inflated variation",
        "double payment",
        "tender manipulation",
        "procurement irregularity",
        "due process violation",
      ]
    );

  const assetOrConductIssue =
    includesAny(
      text,
      [
        "asset declaration",
        "false asset declaration",
        "undeclared asset",
        "conflict of interest",
        "public officer code of conduct",
        "abuse of official position",
        "foreign bank account by public officer",
        "prohibited gift",
      ]
    );

  const financialCrime =
    includesAny(
      text,
      [
        "money laundering",
        "diversion of funds",
        "diversion of public funds",
        "diverted funds",
        "diverted public funds",
        "funds were diverted",
        "public funds were diverted",
        "misappropriation of funds",
        "misappropriated funds",
        "embezzlement",
        "payroll fraud",
        "ghost workers",
        "pension fraud",
        "fraudulent transfer",
        "fraudulent transfers",
        "suspicious transfer",
        "suspicious transfers",
        "proceeds of crime",
        "financial fraud",
        "cyber fraud",
        "scam",
        "fake company",
        "fake companies",
        "forged invoice",
        "forged invoices",
      ]
    );

  const briberyOrPublicCorruption =
    includesAny(
      text,
      [
        "bribe",
        "bribery",
        "kickback",
        "gratification",
        "extortion by public officer",
        "abuse of office",
        "corrupt public officer",
        "corruption in ministry",
        "corruption in agency",
        "nepotism",
        "favouritism",
        "favoritism",
        "illegal deduction by official",
      ]
    );

  const publicInstitution =
    includesAny(
      text,
      [
        "ministry",
        "government agency",
        "government department",
        "public officer",
        "civil servant",
        "local government",
        "state government",
        "federal government",
        "public institution",
        "mda",
      ]
    );

  const maladministration =
    includesAny(
      text,
      [
        "ignored the complaint",
        "refused to investigate",
        "refusal to act",
        "administrative cover up",
        "administrative cover-up",
        "failed to respond",
        "complaint was suppressed",
      ]
    );

  const retaliation =
    includesAny(
      text,
      [
        "retaliation",
        "threatened after reporting",
        "victimised for reporting",
        "victimized for reporting",
        "dismissed for whistleblowing",
        "harassed for reporting",
      ]
    );

  const commonCc = [];

  if (maladministration) {
    commonCc.push(
      "Public Complaints Commission (PCC)"
    );
  }

  if (retaliation) {
    commonCc.push(
      "National Human Rights Commission (NHRC)"
    );
  }

  if (assetOrConductIssue) {
    return antiCorruptionDecision({
      routeKey:
        "ccb_code_of_conduct_petition",
      primaryInstitution:
        CCB_CODE_OF_CONDUCT_PETITIONS.name,
      ccInstitutions:
        [
          ...(briberyOrPublicCorruption
            ? [
                "Independent Corrupt Practices and Other Related Offences Commission (ICPC)",
              ]
            : []),
          ...commonCc,
        ],
      purpose:
        "Petition concerning an alleged breach of the Code of Conduct by a public officer",
      note:
        "Identify the public officer, designation, office address, alleged breach and supporting evidence. Do not state an allegation as proven fact. Do not copy the alleged subject where doing so may compromise an inquiry or endanger a reporter.",
      submissionUrl:
        CCB_CODE_OF_CONDUCT_PETITIONS
          .contact
          .petition_guidelines,
    });
  }

  if (financialCrime) {
    return antiCorruptionDecision({
      routeKey:
        "efcc_economic_financial_crime",
      primaryInstitution:
        EFCC_FINANCIAL_CRIME_REPORTING.name,
      ccInstitutions: [
        ...(publicInstitution
          ? [
              "Independent Corrupt Practices and Other Related Offences Commission (ICPC)",
            ]
          : []),
        ...(procurementIssue
          ? [
              "Bureau of Public Procurement (BPP)",
            ]
          : []),
        ...commonCc,
      ],
      purpose:
        "Evidence-based report of suspected economic or financial crime",
      note:
        "Provide a factual chronology, persons and entities involved, amounts, transaction references and supporting records. Avoid publishing account credentials, passwords or unnecessary personal financial data.",
      submissionUrl:
        EFCC_FINANCIAL_CRIME_REPORTING
          .contact
          .eagle_eye_report,
    });
  }

  if (briberyOrPublicCorruption) {
    return antiCorruptionDecision({
      routeKey:
        "icpc_corrupt_practices_petition",
      primaryInstitution:
        ICPC_CORRUPTION_PETITIONS.name,
      ccInstitutions: [
        ...(procurementIssue
          ? [
              "Bureau of Public Procurement (BPP)",
            ]
          : []),
        ...commonCc,
      ],
      purpose:
        "Petition concerning alleged bribery, abuse of office or corrupt practices",
      note:
        "State the date, place, persons involved and facts supporting the allegation. ICPC warns that false petitions may attract legal consequences, so distinguish allegations from established facts.",
      submissionUrl:
        ICPC_CORRUPTION_PETITIONS
          .contact
          .petition_form,
    });
  }

  if (procurementIssue) {
    return antiCorruptionDecision({
      routeKey:
        "bpp_procurement_petition",
      primaryInstitution:
        BPP_PROCUREMENT_PETITIONS.name,
      ccInstitutions:
        commonCc,
      purpose:
        "Procurement complaint or petition concerning due process and public-contract compliance",
      note:
        "Identify the procuring entity, procurement stage, project or contract, dates, alleged irregularity and supporting procurement documents.",
      submissionUrl:
        BPP_PROCUREMENT_PETITIONS
          .contact
          .petition_portal,
    });
  }

  return unmatched(
    "anti_corruption_issue_type_required"
  );
}

/* ======================================================
   DIASPORA REPORTING
====================================================== */

function diasporaLocation(
  context
) {
  return clean(
    context.issueLocation ||
      context.country ||
      "the country concerned",
    300
  );
}

function missionName(
  context
) {
  const supplied =
    clean(
      context.institutionName,
      300
    );

  if (
    includesAny(
      supplied,
      [
        "embassy of nigeria",
        "nigeria embassy",
        "nigerian embassy",
        "nigeria high commission",
        "nigerian high commission",
        "consulate of nigeria",
        "nigerian consulate",
        "nigerian mission",
      ]
    )
  ) {
    return supplied;
  }

  return (
    NIGERIAN_DIPLOMATIC_MISSION_DIRECTORY.name
  );
}

export function resolveDiasporaRouting(
  context = {}
) {
  const text =
    normalize(
      [
        context.institutionName,
        context.issueLocation,
        context.complaint,
      ].join(" ")
    );

  const location =
    diasporaLocation(
      context
    );

  const mission =
    missionName(
      context
    );

  if (
    hasActiveEmergency(
      text
    )
  ) {
    return {
      matched: true,
      sector:
        "diaspora_report",
      caseType:
        "active_emergency",
      jurisdiction:
        "host_country_emergency",
      jurisdictionCode:
        location,
      routeKey:
        "diaspora_immediate_emergency",
      primaryInstitution:
        "The Relevant Host-Country Emergency Service",
      ccInstitutions: [
        mission,
      ],
      deliveryMethod:
        "immediate_emergency_and_consular_contact",
      emailRoutingExpected:
        false,
      blockGeneration:
        true,
      userMessage:
        "This appears to describe an active emergency abroad. Contact the relevant host-country emergency service immediately and then contact the nearest Nigerian embassy, high commission or consulate. Do not delay urgent assistance while preparing a petition.",
      documentPurpose:
        "Immediate emergency and consular assistance",
      routingNote:
        "Use the Ministry of Foreign Affairs diplomatic-mission directory to locate the Nigerian mission responsible for the country concerned.",
      submissionUrl:
        NIGERIAN_DIPLOMATIC_MISSION_DIRECTORY.contact.mission_directory,
    };
  }

  const trafficking =
    includesAny(
      text,
      [
        "human trafficking",
        "trafficked",
        "forced labour",
        "forced labor",
        "passport seized by employer",
        "recruitment exploitation",
        "domestic servitude",
        "sexual exploitation",
        "labour recruiter",
        "labor recruiter",
        "deceptive recruiter",
        "deceptive recruitment",
        "recruitment deception",
        "seized my passport",
        "confiscated my passport",
        "passport seized by employer",
        "forced to work",
        "forced to work against my will",
        "forced labour",
        "forced labor",
        "labour exploitation",
        "labor exploitation",
        "held against my will",
      ]
    );

  const passportIssue =
    includesAny(
      text,
      [
        "passport",
        "emergency travel certificate",
        "emergency travel document",
        "lost travel document",
        "passport renewal",
        "passport appointment",
        "passport application",
        "passport payment",
        "biometric appointment",
      ]
    );

  const welfareIssue =
    includesAny(
      text,
      [
        "stranded abroad",
        "consular assistance",
        "detained abroad",
        "arrested abroad",
        "deported",
        "deportation",
        "employer abuse",
        "wage withheld abroad",
        "medical emergency abroad",
        "evacuation",
        "missing nigerian abroad",
        "death abroad",
        "body repatriation",
        "legal assistance abroad",
        "xenophobic attack",
      ]
    );

  if (trafficking) {
    return {
      matched: true,
      sector:
        "diaspora_report",
      caseType:
        "human_trafficking",
      jurisdiction:
        "cross_border_protection",
      jurisdictionCode:
        location,
      routeKey:
        "naptip_diaspora_trafficking",
      primaryInstitution:
        NAPTIP_TRAFFICKING_REPORT.name,
      ccInstitutions: [
        mission,
        NIDCOM_DIASPORA_SUPPORT.name,
        MFA_CONSULAR_SERVICES.name,
      ],
      deliveryMethod:
        "verified_email_hotline_and_consular_contact",
      emailRoutingExpected:
        true,
      documentPurpose:
        "Report of suspected trafficking, forced labour or exploitation involving a Nigerian abroad",
      routingNote:
        "Contact local emergency or police services where safe, the nearest Nigerian mission and NAPTIP. Avoid alerting suspected traffickers where doing so may increase danger.",
      submissionUrl:
        NAPTIP_TRAFFICKING_REPORT.contact.incident_reporting,
      sourceUrls: [
        NIGERIAN_DIPLOMATIC_MISSION_DIRECTORY.contact.mission_directory,
        NAPTIP_TRAFFICKING_REPORT.contact.incident_reporting,
      ],
    };
  }

  if (passportIssue) {
    if (
      !isEscalated(
        context
      )
    ) {
      return {
        matched: true,
        sector:
          "diaspora_report",
        caseType:
          "consular_service",
        jurisdiction:
          "country_specific_consular",
        jurisdictionCode:
          location,
        routeKey:
          "nearest_nigerian_mission_passport",
        primaryInstitution:
          mission,
        ccInstitutions: [],
        deliveryMethod:
          "official_mission_directory_and_consular_filing",
        emailRoutingExpected:
          false,
        documentPurpose:
          "Request for passport or consular assistance from the Nigerian mission responsible for the applicant's location",
        routingNote:
          "Nigerians abroad ordinarily submit passport applications and related documents at the nearest Nigerian embassy, high commission or consulate.",
        submissionUrl:
          NIGERIAN_DIPLOMATIC_MISSION_DIRECTORY.contact.mission_directory,
        sourceUrls: [
          NIS_PASSPORT_SUPPORT.contact.passport_information,
          NIGERIAN_DIPLOMATIC_MISSION_DIRECTORY.contact.mission_directory,
        ],
      };
    }

    return {
      matched: true,
      sector:
        "diaspora_report",
      caseType:
        "service_delivery",
      jurisdiction:
        "national_immigration_service",
      jurisdictionCode:
        location,
      routeKey:
        "nis_diaspora_passport_escalation",
      primaryInstitution:
        NIS_PASSPORT_SUPPORT.name,
      ccInstitutions: [
        mission,
        NIDCOM_DIASPORA_SUPPORT.name,
      ],
      deliveryMethod:
        "verified_email_or_official_support_channel",
      emailRoutingExpected:
        true,
      documentPurpose:
        "Escalation of an unresolved passport or immigration-service complaint by a Nigerian abroad",
      routingNote:
        "Include the application ID, payment reference, mission or passport office, appointment details and the previous complaint reference. Never include passwords or one-time codes.",
      submissionUrl:
        NIS_PASSPORT_SUPPORT.contact.contact_page,
    };
  }

  if (
    welfareIssue ||
    context.institutionName
  ) {
    return {
      matched: true,
      sector:
        "diaspora_report",
      caseType:
        "consular_welfare",
      jurisdiction:
        "country_specific_consular",
      jurisdictionCode:
        location,
      routeKey:
        "nigerian_mission_consular_welfare",
      primaryInstitution:
        mission,
      ccInstitutions: [
        NIDCOM_DIASPORA_SUPPORT.name,
      ],
      deliveryMethod:
        "official_mission_directory_and_consular_contact",
      emailRoutingExpected:
        false,
      documentPurpose:
        "Request for consular, welfare or protection assistance for a Nigerian abroad",
      routingNote:
        "Contact the relevant host-country authority where appropriate and locate the Nigerian mission responsible for the country through the official diplomatic-mission directory.",
      submissionUrl:
        NIGERIAN_DIPLOMATIC_MISSION_DIRECTORY.contact.mission_directory,
      sourceUrls: [
        MFA_CONSULAR_SERVICES.contact.consular_services,
        NIDCOM_DIASPORA_SUPPORT.contact.contact_page,
      ],
    };
  }

  return {
    matched: true,
    sector:
      "diaspora_report",
    caseType:
      "diaspora_welfare",
    jurisdiction:
      "national_diaspora_coordination",
    jurisdictionCode:
      location,
    routeKey:
      "nidcom_diaspora_report",
    primaryInstitution:
      NIDCOM_DIASPORA_SUPPORT.name,
    ccInstitutions: [
      MFA_CONSULAR_SERVICES.name,
    ],
    deliveryMethod:
      "verified_email_or_contact_form",
    emailRoutingExpected:
      true,
    documentPurpose:
      "Diaspora welfare, coordination or assistance report",
    routingNote:
      "State the country, city, Nigerian mission contacted, persons involved, dates and assistance requested.",
    submissionUrl:
      NIDCOM_DIASPORA_SUPPORT.contact.contact_page,
  };
}

/* ======================================================
   INTERNATIONAL ESCALATION
====================================================== */

function internationalTarget(
  text
) {
  if (
    includesAny(
      text,
      [
        "international criminal court",
        "icc",
        "office of the prosecutor",
        "otplink",
      ]
    )
  ) {
    return "icc";
  }

  if (
    includesAny(
      text,
      [
        "ecowas court",
        "community court of justice",
      ]
    )
  ) {
    return "ecowas_court";
  }

  if (
    includesAny(
      text,
      [
        "african commission on human and peoples rights",
        "african commission",
        "achpr",
      ]
    )
  ) {
    return "achpr";
  }

  if (
    includesAny(
      text,
      [
        "treaty body",
        "human rights committee",
        "committee against torture",
        "cedaw committee",
        "committee on enforced disappearances",
        "un individual complaint",
      ]
    )
  ) {
    return "un_treaty_body";
  }

  if (
    includesAny(
      text,
      [
        "united nations",
        "ohchr",
        "special procedures",
        "special rapporteur",
        "working group on arbitrary detention",
      ]
    )
  ) {
    return "un_special_procedures";
  }

  if (
    includesAny(
      text,
      [
        "united states congress",
        "us congress",
        "u s congress",
        "us senate",
        "tom lantos",
      ]
    )
  ) {
    return "united_states";
  }

  if (
    includesAny(
      text,
      [
        "uk parliament",
        "british parliament",
        "foreign affairs committee",
        "fcdo",
      ]
    )
  ) {
    return "united_kingdom";
  }

  if (
    includesAny(
      text,
      [
        "european parliament",
        "european union",
        "eu parliament",
        "droi",
        "eeas",
      ]
    )
  ) {
    return "european_union";
  }

  if (
    includesAny(
      text,
      [
        "parliament of canada",
        "canadian parliament",
        "global affairs canada",
        "faae",
      ]
    )
  ) {
    return "canada";
  }

  return "";
}

function domesticFinalRoute(
  context,
  rightsIssue
) {
  return {
    matched: true,
    sector:
      "international_escalation",
    caseType:
      rightsIssue
        ? "human_rights"
        : "domestic_final_escalation",
    jurisdiction:
      "nigeria_domestic_final",
    routeKey:
      rightsIssue
        ? "domestic_nhrc_before_international"
        : "domestic_fmoj_before_international",
    primaryInstitution:
      rightsIssue
        ? "National Human Rights Commission (NHRC)"
        : "Federal Ministry of Justice (FMOJ)",
    ccInstitutions:
      rightsIssue
        ? [
            "Federal Ministry of Justice (FMOJ)",
          ]
        : [],
    deliveryMethod:
      "verified_email_or_physical_filing",
    emailRoutingExpected:
      true,
    documentPurpose:
      "Final domestic escalation before any international advocacy or complaint procedure",
    routingNote:
      "International bodies have different mandates and admissibility rules. Complete the relevant domestic process first unless the selected mechanism expressly permits urgent submissions without exhaustion.",
  };
}

export function resolveInternationalRouting(
  context = {}
) {
  const text =
    normalize(
      [
        context.institutionName,
        context.complaint,
      ].join(" ")
    );

  if (
    hasActiveEmergency(
      text
    )
  ) {
    return {
      matched: true,
      sector:
        "international_escalation",
      caseType:
        "active_emergency",
      jurisdiction:
        "immediate_protection",
      routeKey:
        "international_immediate_danger",
      primaryInstitution:
        "The Appropriate Local Emergency or Protection Authority",
      ccInstitutions: [],
      deliveryMethod:
        "immediate_emergency_report",
      emailRoutingExpected:
        false,
      blockGeneration:
        true,
      userMessage:
        "This appears to describe an immediate threat to life or safety. Do not wait for an international petition. Contact the relevant local emergency or protection authority and a trusted legal or human-rights organisation immediately.",
      documentPurpose:
        "Immediate protection rather than delayed international correspondence",
    };
  }

  const target =
    internationalTarget(
      text
    );

  const rightsIssue =
    hasHumanRightsIssue(
      text
    );

  const atrocityCrime =
    includesAny(
      text,
      [
        "war crime",
        "war crimes",
        "crime against humanity",
        "crimes against humanity",
        "genocide",
        "aggression crime",
        "widespread or systematic attack against civilians",
        "widespread systematic attack against civilians",
        "mass deportation",
        "extermination",
      ]
    );

  const exhausted =
    domesticRemediesExhausted(
      context
    );

  const escalated =
    isEscalated(
      context
    );

  if (target === "icc") {
    if (!atrocityCrime) {
      return {
        matched: true,
        sector:
          "international_escalation",
        caseType:
          "international_eligibility_review",
        jurisdiction:
          "icc_jurisdiction_screening",
        routeKey:
          "icc_jurisdiction_not_established",
        primaryInstitution:
          "A Qualified International Criminal Law Practitioner",
        ccInstitutions: [],
        deliveryMethod:
          "legal_eligibility_review",
        emailRoutingExpected:
          false,
        blockGeneration:
          true,
        userMessage:
          "The International Criminal Court does not handle ordinary injustice, administrative delay, private disputes or appeals. ICC information must concern alleged genocide, crimes against humanity, war crimes or aggression within the Court's jurisdiction. Obtain a proper jurisdiction assessment before submission.",
        documentPurpose:
          "ICC jurisdiction and evidence assessment",
        sourceUrls: [
          "https://otplink.icc-cpi.int/faqs",
        ],
      };
    }

    return {
      matched: true,
      sector:
        "international_escalation",
      caseType:
        "international_criminal_information",
      jurisdiction:
        "international_criminal_court",
      routeKey:
        "icc_otp_link",
      primaryInstitution:
        "International Criminal Court (ICC) — Office of the Prosecutor",
      ccInstitutions: [],
      deliveryMethod:
        "official_secure_submission_portal",
      emailRoutingExpected:
        false,
      documentPurpose:
        "Structured information submission concerning alleged Rome Statute crimes",
      routingNote:
        "Submit through OTPLink. The ICC states that alleged crimes information sent outside its designated Article 15 procedure may not be reviewed or acknowledged. Do not send original documents.",
      submissionUrl:
        "https://otplink.icc-cpi.int/submissions",
      sourceUrls: [
        "https://otplink.icc-cpi.int/faqs",
      ],
    };
  }

  if (target === "ecowas_court") {
    return {
      matched: true,
      sector:
        "international_escalation",
      caseType:
        "regional_court_process",
      jurisdiction:
        "ecowas_community_court",
      routeKey:
        "ecowas_court_formal_application",
      primaryInstitution:
        "Community Court of Justice, ECOWAS",
      ccInstitutions: [],
      deliveryMethod:
        "formal_court_application_to_registry",
      emailRoutingExpected:
        false,
      blockGeneration:
        true,
      userMessage:
        "An ECOWAS Court case is commenced through a formal written application to the Court Registry, not by sending an ordinary advocacy email. The application must identify the applicant and respondent, state the relevant facts and set out the relief sought. Obtain legal assistance before filing.",
      documentPurpose:
        "Preparation of a formal ECOWAS Court application",
      submissionUrl:
        "https://courtecowas.org/legal-resources/court-rules/",
    };
  }

  if (target === "achpr") {
    if (!exhausted) {
      return {
        matched: true,
        sector:
          "international_escalation",
        caseType:
          "regional_admissibility_review",
        jurisdiction:
          "african_human_rights_system",
        routeKey:
          "achpr_domestic_remedies_review",
        primaryInstitution:
          "A Qualified Human Rights Practitioner",
        ccInstitutions: [],
        deliveryMethod:
          "admissibility_and_remedies_review",
        emailRoutingExpected:
          false,
        blockGeneration:
          true,
        userMessage:
          "A communication to the African Commission ordinarily requires exhaustion of available local remedies unless those remedies are unavailable, ineffective or unduly prolonged. Document the domestic proceedings and obtain an admissibility review before filing.",
        documentPurpose:
          "African Commission admissibility assessment",
        sourceUrls: [
          "https://achpr.au.int/en/guidelines-submitting-complaints",
        ],
      };
    }

    return {
      matched: true,
      sector:
        "international_escalation",
      caseType:
        "regional_human_rights_communication",
      jurisdiction:
        "african_human_rights_system",
      routeKey:
        "achpr_non_state_communication",
      primaryInstitution:
        "African Commission on Human and Peoples' Rights (ACHPR)",
      ccInstitutions: [],
      deliveryMethod:
        "official_non_state_complaint_form",
      emailRoutingExpected:
        false,
      documentPurpose:
        "Non-State communication alleging violations of the African Charter",
      routingNote:
        "Use the Commission's prescribed complaint form, provide admissibility information and supporting documents, and avoid insulting or abusive language.",
      submissionUrl:
        "https://achpr.au.int/index.php/en/other-documents/non-state-inter-state-communication-procedure",
    };
  }

  if (target === "un_treaty_body") {
    if (!exhausted) {
      return {
        matched: true,
        sector:
          "international_escalation",
        caseType:
          "treaty_body_admissibility_review",
        jurisdiction:
          "un_treaty_body",
        routeKey:
          "un_treaty_body_domestic_remedies_required",
        primaryInstitution:
          "A Qualified International Human Rights Practitioner",
        ccInstitutions: [],
        deliveryMethod:
          "treaty_eligibility_and_admissibility_review",
        emailRoutingExpected:
          false,
        blockGeneration:
          true,
        userMessage:
          "UN treaty-body complaints generally require exhaustion of available domestic remedies and are available only where the State has accepted the relevant individual-complaint procedure. Nigeria's acceptance differs by treaty. Confirm both treaty eligibility and domestic-remedy requirements before submitting.",
        documentPurpose:
          "Treaty-body jurisdiction and admissibility assessment",
        sourceUrls: [
          "https://complaints.ohchr.org/",
          "https://tbinternet.ohchr.org/_layouts/15/TreatyBodyExternal/Treaty.aspx?CountryID=127&Lang=en",
        ],
      };
    }

    return {
      matched: true,
      sector:
        "international_escalation",
      caseType:
        "treaty_body_individual_complaint",
      jurisdiction:
        "un_treaty_body",
      routeKey:
        "ohchr_treaty_body_portal",
      primaryInstitution:
        "OHCHR Treaty Body Individual Communications Portal",
      ccInstitutions: [],
      deliveryMethod:
        "official_human_rights_complaints_portal",
      emailRoutingExpected:
        false,
      documentPurpose:
        "Preparation of a potentially admissible UN treaty-body individual communication",
      routingNote:
        "Confirm that Nigeria has accepted the relevant treaty's individual-complaint procedure and provide evidence concerning domestic remedies, timelines and any parallel international proceedings.",
      submissionUrl:
        "https://complaints.ohchr.org/",
    };
  }

  if (
    target ===
      "un_special_procedures" ||
    (
      !target &&
      rightsIssue &&
      (
        escalated ||
        includesAny(
          text,
          [
            "ongoing violation",
            "urgent appeal",
            "risk of recurrence",
            "continuing detention",
            "continuing disappearance",
          ]
        )
      )
    )
  ) {
    return {
      matched: true,
      sector:
        "international_escalation",
      caseType:
        "international_human_rights_communication",
      jurisdiction:
        "un_special_procedures",
      routeKey:
        "ohchr_special_procedures",
      primaryInstitution:
        "United Nations Special Procedures of the Human Rights Council",
      ccInstitutions: [],
      deliveryMethod:
        "official_secure_submission_portal",
      emailRoutingExpected:
        false,
      documentPurpose:
        "Credible and detailed submission concerning an alleged past, ongoing or potential human-rights violation",
      routingNote:
        "Special Procedures may consider individual or group allegations and do not require exhaustion of domestic remedies. The submission must be factual, credible, detailed, non-abusive and not based exclusively on media reports.",
      submissionUrl:
        "https://spsubmission.ohchr.org/",
    };
  }

  const advocacyBodies = {
    united_states:
      "United States Congressional Foreign-Policy and Human-Rights Bodies",

    united_kingdom:
      "United Kingdom Parliamentary and Foreign-Policy Bodies",

    european_union:
      "European Union Parliamentary and Diplomatic Bodies",

    canada:
      "Canadian Parliamentary and Foreign-Policy Bodies",
  };

  if (
    target &&
    advocacyBodies[target]
  ) {
    if (!escalated) {
      return domesticFinalRoute(
        context,
        rightsIssue
      );
    }

    return {
      matched: true,
      sector:
        "international_escalation",
      caseType:
        "international_advocacy",
      jurisdiction:
        "diplomatic_and_legislative_advocacy",
      routeKey:
        `international_advocacy_${target}`,
      primaryInstitution:
        advocacyBodies[target],
      ccInstitutions: [],
      deliveryMethod:
        "official_public_correspondence_channel",
      emailRoutingExpected:
        false,
      documentPurpose:
        "Evidence-based diplomatic or legislative advocacy correspondence",
      routingNote:
        "This is an advocacy route, not a court, appeal or enforceable legal remedy. Use only official current correspondence channels and clearly state the domestic steps already taken.",
    };
  }

  if (
    !target &&
    atrocityCrime
  ) {
    return {
      matched: true,
      sector:
        "international_escalation",
      caseType:
        "international_eligibility_review",
      jurisdiction:
        "international_criminal_law",
      routeKey:
        "icc_target_confirmation_required",
      primaryInstitution:
        "A Qualified International Criminal Law Practitioner",
      ccInstitutions: [],
      deliveryMethod:
        "jurisdiction_and_evidence_review",
      emailRoutingExpected:
        false,
      blockGeneration:
        true,
      userMessage:
        "The allegations may use terminology associated with international crimes, but ICC jurisdiction cannot be assumed from keywords alone. Confirm the alleged conduct, context, location, dates, perpetrators and jurisdiction before preparing an OTPLink submission.",
      documentPurpose:
        "International-criminal-law jurisdiction assessment",
    };
  }

  return domesticFinalRoute(
    context,
    rightsIssue
  );
}

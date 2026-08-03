import {
  NHIA_HEALTH_INSURANCE_ESCALATION,
  NHRC_HEALTH_RIGHTS,
} from "./nigeriaHealthRegistry.mjs";

import {
  JAMB_EDUCATION_SUPPORT,
  NECO_EDUCATION_COMPLAINTS,
  WAEC_NIGERIA_COMPLAINTS,
  NUC_UNIVERSITY_GRIEVANCE,
  NBTE_TECHNICAL_EDUCATION_COMPLAINTS,
  NCCE_TEACHER_EDUCATION_COMPLAINTS,
  UBEC_BASIC_EDUCATION_COMPLAINTS,
  NIGERIAN_EDUCATION_AUTHORITIES,
} from "./nigeriaEducationRegistry.mjs";

import {
  NPF_NATIONAL_AND_STATE_COMMANDS,
  PSC_POLICE_DISCIPLINE,
  NHRC_SECURITY_RIGHTS_COMPLAINTS,
  NCOS_COMPLAINT_RESPONSE,
  NSCDC_INCIDENT_REPORTING,
  NIS_SERVICOM_COMPLAINTS,
  NIGERIAN_ARMY_CALL_CENTRE,
  NIGERIAN_NAVY_CONTACT,
  NIGERIAN_AIR_FORCE_OMBUDSMAN,
} from "./nigeriaSecurityRegistry.mjs";

import {
  NJC_JUDICIAL_DISCIPLINE,
  NHRC_JUSTICE_CHAIN_COMPLAINTS,
  PCC_COURT_ADMINISTRATION_COMPLAINTS,
  SUPREME_COURT_ADMINISTRATION,
  COURT_OF_APPEAL_ADMINISTRATION,
  FEDERAL_HIGH_COURT_ADMINISTRATION,
  NATIONAL_INDUSTRIAL_COURT_ADMINISTRATION,
  FCT_HIGH_COURT_ADMINISTRATION,
  LPDC_LEGAL_PRACTITIONER_DISCIPLINE,
  RELEVANT_STATE_JUDICIARY,
} from "./nigeriaJudiciaryRegistry.mjs";

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

function isNigeria(
  context
) {
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
      "provider contacted",
      "provider_contacted",
      "escalation",
      "escalate",
      "appeal",
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

  const complaint =
    normalize(
      context?.complaint
    );

  return includesAny(
    complaint,
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
      "without response",
      "dissatisfied with the response",
    ]
  );
}

function unmatched(reason) {
  return {
    matched: false,
    reason,
  };
}

function uniqueNames(values) {
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

function suppliedInstitution(
  context,
  excludedTerms = []
) {
  const institution =
    clean(
      context
        ?.institutionName,
      300
    );

  if (!institution) {
    return "";
  }

  if (
    includesAny(
      institution,
      excludedTerms
    )
  ) {
    return "";
  }

  return institution;
}

function providerFirst({
  sector,
  provider,
  routeKey,
  purpose,
  note,
  caseType =
    "service_delivery",
}) {
  return {
    matched: true,

    sector,

    caseType,

    jurisdiction:
      "provider_first",

    routeKey,

    primaryInstitution:
      provider,

    ccInstitutions: [],

    deliveryMethod:
      "official_provider_channel_resolution_required",

    emailRoutingExpected:
      false,

    submissionUrl: "",

    contactEmails: [],

    contactPhoneNumbers: [],

    contactAddress: "",

    sourceUrls: [],

    documentPurpose:
      purpose,

    routingNote:
      `${note} Confirm the complaint channel through the institution's official website, office or published support service. Do not use a guessed email address.`,
  };
}

function verifiedAuthorityMetadata(
  authority
) {
  const contact =
    authority?.contact || {};

  const verification =
    authority?.verification || {};

  const emails =
    Array.isArray(
      contact.emails
    )
      ? [...contact.emails]
      : [];

  const emailAllowed =
    verification.status ===
      "VERIFIED_OFFICIAL_SOURCE" &&
    verification
      .direct_email_verified ===
      true &&
    emails.length > 0;

  const phones =
    Array.isArray(
      contact.phones
    )
      ? [...contact.phones]
      : Array.isArray(
          contact.phone_numbers
        )
        ? [...contact.phone_numbers]
        : [];

  return {
    deliveryMethod:
      emailAllowed
        ? "verified_email_or_official_complaint_channel"
        : "official_portal_or_physical_complaint_channel",

    emailRoutingExpected:
      emailAllowed,

    submissionUrl:
      contact.complaint_portal ||
      contact.complaint_form ||
      contact.contact_page ||
      contact.complaint_procedure ||
      contact.servicom ||
      contact.support_page ||
      contact.website ||
      "",

    contactEmails:
      emailAllowed
        ? emails
        : [],

    contactPhoneNumbers:
      phones,

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

/* ======================================================
   HEALTH
====================================================== */

const HEALTH_REGULATOR_TERMS = [
  "National Health Insurance Authority",
  "NHIA",
  "Medical and Dental Council of Nigeria",
  "MDCN",
  "National Human Rights Commission",
  "NHRC",
  "Federal Competition and Consumer Protection Commission",
  "FCCPC",
  "Federal Ministry of Health",
];

export function resolveHealthRouting(
  context = {}
) {
  if (!isNigeria(context)) {
    return unmatched(
      "country_not_supported"
    );
  }

  const text =
    normalize(
      [
        context.institutionName,
        context.complaint,
      ].join(" ")
    );

  const provider =
    suppliedInstitution(
      context,
      HEALTH_REGULATOR_TERMS
    );

  const escalated =
    isEscalated(
      context
    );

  const insuranceIssue =
    includesAny(
      text,
      [
        "HMO",
        "health insurance",
        "NHIA",
        "NHIS",
        "authorization code",
        "authorisation code",
        "referral authorization",
        "referral authorisation",
        "capitation",
        "insurance claim",
        "benefit package",
        "enrollee",
      ]
    );

  const doctorMisconduct =
    includesAny(
      text,
      [
        "doctor misconduct",
        "medical practitioner misconduct",
        "dental surgeon misconduct",
        "dentist misconduct",
        "medical malpractice",
        "medical negligence",
        "surgical negligence",
        "misdiagnosis",
        "wrong diagnosis",
        "unethical doctor",
        "professional misconduct",
      ]
    );

  const quackPractice =
    includesAny(
      text,
      [
        "quack doctor",
        "fake doctor",
        "unlicensed doctor",
        "unregistered doctor",
        "unlicensed hospital",
        "unlicensed medical facility",
        "unapproved hospital",
        "unapproved medical facility",
        "hospital operating illegally",
        "illegal hospital operation",
        "fake medical practitioner",
      ]
    );

  const seriousRightsIssue =
    includesAny(
      text,
      [
        "detained over hospital bill",
        "detained over a hospital bill",
        "detained over medical bill",
        "detained over a medical bill",
        "patient detained",
        "patient was detained",
        "hospital detained patient",
        "held over hospital bill",
        "held over a hospital bill",
        "held because of hospital bill",
        "emergency treatment refused",
        "emergency care refused",
        "refused emergency treatment",
        "refused emergency care",
        "denied emergency treatment",
        "denied emergency care",
        "discrimination in treatment",
        "physical abuse by hospital staff",
        "inhuman treatment",
      ]
    );

  if (insuranceIssue) {
    if (
      !escalated &&
      provider
    ) {
      return providerFirst({
        sector: "health",
        provider,
        routeKey:
          "health_insurance_provider_first",
        purpose:
          "Formal health-insurance complaint to the HMO or healthcare provider",
        note:
          "Submit the complaint first to the relevant HMO or healthcare provider and retain its acknowledgement, reference number and supporting medical records.",
      });
    }

    return {
      matched: true,
      sector: "health",
      caseType:
        "service_delivery",
      jurisdiction:
        "national_health_insurance_regulator",
      routeKey:
        "nhia_insurance_escalation",
      primaryInstitution:
        "National Health Insurance Authority (NHIA)",
      ccInstitutions:
        provider
          ? [provider]
          : [],
      ...verifiedAuthorityMetadata(
        NHIA_HEALTH_INSURANCE_ESCALATION
      ),
      documentPurpose:
        "Escalation of an unresolved health-insurance complaint to NHIA",
      routingNote:
        "Include the HMO or provider complaint reference, evidence of enrolment, referral or authorization records, bills and relevant medical documents.",
      sourceUrls: [
        "https://www.nhia.gov.ng/contact-us/",
        "https://www.nhia.gov.ng/enrollee-charter/",
      ],
    };
  }

  if (
    doctorMisconduct ||
    quackPractice
  ) {
    return {
      matched: true,
      sector: "health",
      caseType:
        "professional_misconduct",
      jurisdiction:
        "medical_professional_discipline",
      routeKey:
        quackPractice
          ? "mdcn_quack_report"
          : "mdcn_practitioner_complaint",
      primaryInstitution:
        "Medical and Dental Council of Nigeria (MDCN)",
      ccInstitutions:
        provider
          ? [provider]
          : [],
      deliveryMethod:
        "official_professional_complaint_portal",
      emailRoutingExpected:
        false,
      documentPurpose:
        quackPractice
          ? "Report of suspected unlicensed medical practice or an unapproved medical facility"
          : "Professional misconduct complaint against a medical practitioner or dental surgeon",
      routingNote:
        quackPractice
          ? "Use MDCN's official reporting channel for suspected quack personnel, schools or hospitals and provide the suspect's identity, address, incident location and supporting evidence."
          : "MDCN's complaint process requires clear particulars and supporting documentation. Its official complaint form also requests a verifying affidavit.",
      sourceUrls: [
        "https://mdcn.gov.ng/",
        "https://mdcn.gov.ng/contact-us",
      ],
    };
  }

  if (seriousRightsIssue) {
    return {
      matched: true,
      sector: "health",
      caseType:
        "human_rights",
      jurisdiction:
        "national_human_rights",
      routeKey:
        "health_rights_nhrc",
      primaryInstitution:
        "National Human Rights Commission (NHRC)",
      ccInstitutions:
        provider
          ? [provider]
          : [],
      ...verifiedAuthorityMetadata(
        NHRC_HEALTH_RIGHTS
      ),
      documentPurpose:
        "Human-rights complaint arising from healthcare treatment or denial of care",
      routingNote:
        "State the institution involved, incident date and location, treatment requested, harm suffered, witnesses and the remedy sought.",
      sourceUrls: [
        "https://www.nigeriarights.gov.ng/index.php/complaint-form",
      ],
    };
  }

  if (provider) {
    if (!escalated) {
      return providerFirst({
        sector: "health",
        provider,
        routeKey:
          "health_provider_first",
        purpose:
          "Formal healthcare-service complaint to the responsible hospital, clinic or healthcare provider",
        note:
          "Submit the complaint first to the healthcare provider's management or patient-relations unit and retain all medical records, bills and correspondence.",
      });
    }

    return {
      matched: true,
      sector: "health",
      caseType:
        "service_delivery",
      jurisdiction:
        "national_consumer_protection",
      routeKey:
        "health_consumer_escalation",
      primaryInstitution:
        "Federal Competition and Consumer Protection Commission (FCCPC)",
      ccInstitutions: [
        provider,
      ],
      deliveryMethod:
        "official_consumer_complaint_portal",
      emailRoutingExpected:
        false,
      documentPurpose:
        "Consumer complaint concerning unresolved healthcare service delivery",
      routingNote:
        "Use this route for unresolved billing, service or consumer-treatment complaints that do not primarily concern professional discipline or health-insurance regulation.",
      sourceUrls: [
        "https://fccpc.gov.ng/consumers/complaint-handling/",
      ],
    };
  }

  return unmatched(
    "health_provider_or_issue_type_required"
  );
}

/* ======================================================
   EDUCATION
====================================================== */

const EDUCATION_REGULATOR_TERMS =
  NIGERIAN_EDUCATION_AUTHORITIES.flatMap(
    authority => [
      authority.name,
      ...(authority.aliases || []),
    ]
  );

export function resolveEducationRouting(
  context = {}
) {
  if (!isNigeria(context)) {
    return unmatched(
      "country_not_supported"
    );
  }

  const text =
    normalize(
      [
        context.institutionName,
        context.complaint,
      ].join(" ")
    );

  const escalated =
    isEscalated(
      context
    );

  if (
    includesAny(
      text,
      [
        "JAMB",
        "Joint Admissions and Matriculation Board",
        "UTME",
        "CAPS admission",
      ]
    )
  ) {
    return {
      matched: true,
      sector: "education",
      caseType:
        "service_delivery",
      jurisdiction:
        "national_admissions_body",
      routeKey:
        "jamb_support_ticket",
      primaryInstitution:
        JAMB_EDUCATION_SUPPORT.name,
      ccInstitutions: [],
      deliveryMethod:
        "official_support_ticket",
      emailRoutingExpected:
        false,
      documentPurpose:
        "JAMB candidate or public support complaint",
      routingNote:
        "Raise a free support ticket through JAMB's Central Online Support System and retain the ticket ID for tracking.",
      sourceUrls: [
        "https://support.jamb.gov.ng/candidate-support/create-candidate-ticket",
        "https://support.jamb.gov.ng/candidate-support/create-general-ticket",
      ],
    };
  }

  if (
    includesAny(
      text,
      [
        "NECO",
        "National Examinations Council",
      ]
    )
  ) {
    return {
      matched: true,
      sector: "education",
      caseType:
        "service_delivery",
      jurisdiction:
        "national_examination_body",
      routeKey:
        "neco_complaint_portal",
      primaryInstitution:
        NECO_EDUCATION_COMPLAINTS.name,
      ccInstitutions: [],
      deliveryMethod:
        "official_support_ticket",
      emailRoutingExpected:
        false,
      documentPurpose:
        "NECO examination or result complaint",
      routingNote:
        "Submit and track the complaint through NECO's official complaints or support-ticket system.",
      sourceUrls: [
        "https://complaints.neco.gov.ng/",
        "https://support.neco.gov.ng/portal/en/home",
      ],
    };
  }

  if (
    includesAny(
      text,
      [
        "WAEC",
        "West African Examinations Council",
        "WASSCE",
      ]
    )
  ) {
    const schoolCandidate =
      includesAny(
        text,
        [
          "school candidate",
          "internal candidate",
          "through my school",
          "school principal",
        ]
      );

    if (schoolCandidate) {
      return {
        matched: true,
        sector: "education",
        caseType:
          "service_delivery",
        jurisdiction:
          "school_candidate_channel",
        routeKey:
          "waec_school_principal",
        primaryInstitution:
          "The Candidate's School Principal or Examination Officer",
        ccInstitutions: [],
        deliveryMethod:
          "submission_through_school",
        emailRoutingExpected:
          false,
        documentPurpose:
          "Request to forward a school candidate's WAEC complaint through the authorised school channel",
        routingNote:
          "WAEC states that school candidates should send complaints through their school principals rather than contacting WAEC directly.",
        sourceUrls: [
          "https://www.waecnigeria.org/faq/",
        ],
      };
    }

    return {
      matched: true,
      sector: "education",
      caseType:
        "service_delivery",
      jurisdiction:
        "national_examination_body",
      routeKey:
        "waec_candidate_channel",
      primaryInstitution:
        WAEC_NIGERIA_COMPLAINTS.name,
      ccInstitutions: [],
      deliveryMethod:
        "official_portal_or_national_office",
      emailRoutingExpected:
        false,
      documentPurpose:
        "WAEC examination, result or candidate-service complaint",
      routingNote:
        "Private candidates may contact WAEC through its published channels. School candidates should normally route complaints through their school principal.",
      sourceUrls: [
        "https://www.waecnigeria.org/faq/",
        "https://www.waecnigeria.org/index.php/national-office",
      ],
    };
  }

  const provider =
    suppliedInstitution(
      context,
      EDUCATION_REGULATOR_TERMS
    );

  if (!provider) {
    return unmatched(
      "education_institution_required"
    );
  }

  if (!escalated) {
    return providerFirst({
      sector: "education",
      provider,
      routeKey:
        "education_institution_first",
      purpose:
        "Formal complaint to the responsible educational institution",
      note:
        "Submit the complaint first to the institution's Registrar, Principal, Student Affairs Unit or other designated grievance channel and retain its acknowledgement.",
    });
  }

  const universityIssue =
    includesAny(
      text,
      [
        "university",
        "vice chancellor",
        "faculty",
        "senate",
        "degree programme",
      ]
    );

  const technicalIssue =
    includesAny(
      text,
      [
        "polytechnic",
        "technical college",
        "TVET",
        "HND",
        "ND programme",
        "college of health",
        "college of nursing",
        "innovation enterprise institution",
      ]
    );

  const teacherEducationIssue =
    includesAny(
      text,
      [
        "college of education",
        "NCE programme",
        "NCE program",
        "teacher education",
        "teacher training college",
        "college of education student",
      ]
    );

  const basicEducationIssue =
    includesAny(
      text,
      [
        "primary school",
        "junior secondary school",
        "basic education",
        "universal basic education",
        "UBE school",
        "SUBEB",
        "State Universal Basic Education Board",
        "public primary school",
      ]
    );

  if (universityIssue) {
    return {
      matched: true,
      sector: "education",
      caseType:
        "service_delivery",
      jurisdiction:
        "university_regulation",
      routeKey:
        "nuc_grievance_escalation",
      primaryInstitution:
        NUC_UNIVERSITY_GRIEVANCE.name,
      ccInstitutions: [
        provider,
      ],
      deliveryMethod:
        "official_grievance_or_physical_filing",
      emailRoutingExpected:
        false,
      documentPurpose:
        "Escalation of an unresolved university-system complaint",
      routingNote:
        "Use this route for matters within NUC's regulatory or service-delivery scope after first using the university's internal grievance procedure. Academic appeals governed solely by university rules should continue through the institution's authorised appeal process.",
      sourceUrls: [
        "https://www.nuc.edu.ng/servicom/",
      ],
    };
  }

  if (teacherEducationIssue) {
    return {
      matched: true,
      sector: "education",
      caseType:
        "service_delivery",
      jurisdiction:
        "teacher_education_regulation",
      routeKey:
        "ncce_complaint_escalation",
      primaryInstitution:
        NCCE_TEACHER_EDUCATION_COMPLAINTS.name,
      ccInstitutions: [
        provider,
      ],
      ...verifiedAuthorityMetadata(
        NCCE_TEACHER_EDUCATION_COMPLAINTS
      ),
      documentPurpose:
        "Escalation of an unresolved complaint involving a college of education or NCE programme",
      routingNote:
        "Use this route after the institution's internal complaint or appeal process has been attempted. Matters involving colleges of education and NCE programmes fall within NCCE's regulatory and service-delivery scope.",
      sourceUrls:
        NCCE_TEACHER_EDUCATION_COMPLAINTS
          .verification
          .source_urls,
    };
  }

  if (basicEducationIssue) {
    return {
      matched: true,
      sector: "education",
      caseType:
        "service_delivery",
      jurisdiction:
        "basic_education_oversight",
      routeKey:
        "ubec_basic_education_channel",
      primaryInstitution:
        UBEC_BASIC_EDUCATION_COMPLAINTS.name,
      ccInstitutions: [
        provider,
      ],
      deliveryMethod:
        "official_servicom_or_contact_channel",
      emailRoutingExpected:
        false,
      documentPurpose:
        "Escalation of an unresolved basic-education service complaint",
      routingNote:
        "The school and responsible State Universal Basic Education Board should ordinarily receive the complaint first. UBEC may be used for unresolved matters within the national basic-education framework.",
      sourceUrls:
        UBEC_BASIC_EDUCATION_COMPLAINTS
          .verification
          .source_urls,
    };
  }

  if (technicalIssue) {
    return {
      matched: true,
      sector: "education",
      caseType:
        "service_delivery",
      jurisdiction:
        "technical_education_regulation",
      routeKey:
        "nbte_complaint_escalation",
      primaryInstitution:
        NBTE_TECHNICAL_EDUCATION_COMPLAINTS.name,
      ccInstitutions: [
        provider,
      ],
      ...verifiedAuthorityMetadata(
        NBTE_TECHNICAL_EDUCATION_COMPLAINTS
      ),
      documentPurpose:
        "Escalation of a complaint involving a technical or vocational institution",
      routingNote:
        "NBTE's Inspection and Investigation Division handles complaints involving illegal institutions, certificate racketeering, management disputes and student disputes within institutions under the Board's purview.",
      sourceUrls: [
        "https://www.nbte.gov.ng/nbte/inspectorate",
      ],
    };
  }

  return {
    matched: true,
    sector: "education",
    caseType:
      "service_delivery",
    jurisdiction:
      "institution_internal_appeal",
    routeKey:
      "education_internal_appeal",
    primaryInstitution:
      provider,
    ccInstitutions: [],
    deliveryMethod:
      "official_institution_channel_resolution_required",

    emailRoutingExpected:
      false,

    submissionUrl: "",

    contactEmails: [],

    contactPhoneNumbers: [],

    contactAddress: "",

    sourceUrls: [],
    documentPurpose:
      "Internal appeal or escalation to the educational institution's governing authority",
    routingNote:
      "Address the complaint to the institution's Registrar, Governing Council, Proprietor, Principal or authorised appeal body, depending on the type of institution.",
  };
}

/* ======================================================
   SECURITY
====================================================== */

const SECURITY_AGENCIES = [
  NPF_NATIONAL_AND_STATE_COMMANDS,
  NCOS_COMPLAINT_RESPONSE,
  NSCDC_INCIDENT_REPORTING,
  NIS_SERVICOM_COMPLAINTS,
  NIGERIAN_ARMY_CALL_CENTRE,
  NIGERIAN_NAVY_CONTACT,
  NIGERIAN_AIR_FORCE_OMBUDSMAN,
].map(
  authority => ({
    name:
      authority.name,

    aliases:
      authority.aliases || [],

    police:
      authority.key ===
      NPF_NATIONAL_AND_STATE_COMMANDS.key,

    authority,
  })
);

function findSecurityAgency(
  context
) {
  const text =
    [
      context.institutionName,
      context.complaint,
    ].join(" ");

  for (
    const agency
    of SECURITY_AGENCIES
  ) {
    if (
      [
        agency.name,
        ...agency.aliases,
      ].some(
        (alias) =>
          aliasHit(
            text,
            alias
          )
      )
    ) {
      return agency;
    }
  }

  const supplied =
    suppliedInstitution(
      context,
      [
        "Police Service Commission",
        "PSC",
        "National Human Rights Commission",
        "NHRC",
      ]
    );

  if (supplied) {
    return {
      name: supplied,
      aliases: [
        supplied,
      ],
      police: false,
    };
  }

  return null;
}

export function resolveSecurityRouting(
  context = {}
) {
  if (!isNigeria(context)) {
    return unmatched(
      "country_not_supported"
    );
  }

  const text =
    normalize(
      [
        context.institutionName,
        context.complaint,
      ].join(" ")
    );

  const agency =
    findSecurityAgency(
      context
    );

  const urgentEmergency =
    includesAny(
      text,
      [
        "being attacked right now",
        "attack is ongoing",
        "currently under attack",
        "immediate danger",
        "life is in immediate danger",
        "kidnapping is ongoing",
        "currently being kidnapped",
        "active shooter",
      ]
    );

  if (urgentEmergency) {
    return {
      matched: true,
      sector: "security",
      caseType:
        "active_emergency",
      jurisdiction:
        "immediate_emergency_response",
      routeKey:
        "active_security_emergency",
      primaryInstitution:
        "The Nearest Police Station or Appropriate Emergency Security Agency",
      ccInstitutions: [],
      deliveryMethod:
        "immediate_emergency_report",
      emailRoutingExpected:
        false,
      blockGeneration:
        true,
      userMessage:
        "This appears to describe an active emergency. Do not rely on a generated petition for immediate protection. Contact the nearest police station or appropriate emergency security agency now, move to a safer location where possible, and preserve evidence only when it is safe to do so.",
      documentPurpose:
        "Immediate emergency reporting rather than delayed petition drafting",
      routingNote:
        "PetitionDesk is not an emergency-response service.",
    };
  }

  const rightsViolation =
    includesAny(
      text,
      [
        "unlawful detention",
        "illegal detention",
        "unlawfully detained",
        "illegally detained",
        "detained without charge",
        "detained without trial",
        "detained without lawful basis",
        "detained beyond the lawful period",
        "police brutality",
        "torture",
        "forced confession",
        "access to lawyer denied",
        "inhuman treatment",
        "extrajudicial killing",
        "forced disappearance",
        "illegal arrest",
        "assault by officer",
        "assaulted by police",
        "assaulted and detained",
        "denial of bail",
        "property seized without",
      ]
    );

  const policeMisconduct =
    includesAny(
      text,
      [
        "police extortion",
        "police bribery",
        "officer demanded money",
        "police misconduct",
        "unprofessional police conduct",
        "police harassment",
        "illegal checkpoint",
        "bail money",
      ]
    );

  const crimeReport =
    includesAny(
      text,
      [
        "kidnapping",
        "armed robbery",
        "terror threat",
        "death threat",
        "missing person",
        "criminal attack",
        "burglary",
      ]
    );

  if (rightsViolation) {
    const cc = [];

    if (agency?.name) {
      cc.push(
        agency.name
      );
    }

    if (agency?.police) {
      cc.push(
        PSC_POLICE_DISCIPLINE.name
      );
    }

    return {
      matched: true,
      sector: "security",
      caseType:
        "human_rights",
      jurisdiction:
        "national_human_rights",
      routeKey:
        "security_rights_nhrc",
      primaryInstitution:
        NHRC_SECURITY_RIGHTS_COMPLAINTS.name,
      ccInstitutions:
        uniqueNames(cc),
      ...verifiedAuthorityMetadata(
        NHRC_SECURITY_RIGHTS_COMPLAINTS
      ),
      documentPurpose:
        "Human-rights complaint concerning alleged abuse by a security or law-enforcement body",
      routingNote:
        "Provide the incident date, location, agency or officers involved, detention location where applicable, witnesses, medical evidence and the remedy sought.",
      sourceUrls: [
        ...NHRC_SECURITY_RIGHTS_COMPLAINTS
          .verification
          .source_urls,
      ],
    };
  }

  if (
    policeMisconduct ||
    agency?.police
  ) {
    return {
      matched: true,
      sector: "security",
      caseType:
        "professional_misconduct",
      jurisdiction:
        "police_discipline",
      routeKey:
        "psc_police_discipline",
      primaryInstitution:
        PSC_POLICE_DISCIPLINE.name,
      ccInstitutions:
        agency?.name
          ? [agency.name]
          : [],
      ...verifiedAuthorityMetadata(
        PSC_POLICE_DISCIPLINE
      ),
      documentPurpose:
        "Police discipline, petition or public complaint",
      routingNote:
        "The Police Service Commission's Police Discipline Department handles appeals, petitions and public complaints concerning police discipline.",
      sourceUrls: [
        ...PSC_POLICE_DISCIPLINE
          .verification
          .source_urls,
      ],
    };
  }

  if (crimeReport) {
    return {
      matched: true,
      sector: "security",
      caseType:
        "crime_report",
      jurisdiction:
        "state_or_local_police_response",
      routeKey:
        "crime_report_nearest_command",
      primaryInstitution:
        NPF_NATIONAL_AND_STATE_COMMANDS.name,
      ccInstitutions: [],
      deliveryMethod:
        "immediate_station_or_command_report",
      emailRoutingExpected:
        false,
      documentPurpose:
        "Formal incident report and request for investigation or protection",
      routingNote:
        "Report the matter promptly to the nearest police station or appropriate State Police Command. Obtain an acknowledgement or incident reference and do not delay urgent reporting while preparing a petition.",
      submissionUrl:
        NPF_NATIONAL_AND_STATE_COMMANDS
          .contact
          .command_directory,
      sourceUrls:
        NPF_NATIONAL_AND_STATE_COMMANDS
          .verification
          .source_urls,
    };
  }

  if (agency?.name) {
    const routed =
      providerFirst({
        sector:
          "security",

        provider:
          agency.name,

        routeKey:
          isEscalated(context)
            ? "security_agency_internal_escalation"
            : "security_agency_first",

        purpose:
          isEscalated(context)
            ? "Escalation to the headquarters or complaints authority of the responsible security agency"
            : "Formal complaint to the responsible security or enforcement agency",

        note:
          isEscalated(context)
            ? "Escalate to the agency's headquarters, inspectorate, SERVICOM or complaints authority and attach the earlier complaint reference."
            : "Submit the complaint first to the responsible agency or command and retain an acknowledgement or reference number.",
      });

    const authority =
      agency.authority;

    return {
      ...routed,

      deliveryMethod:
        authority?.portal_only
          ? "official_portal_or_command_channel"
          : authority
          ? "verified_email_or_official_channel"
          : "agency_headquarters_or_verified_official_channel",

      emailRoutingExpected:
        Boolean(
          authority
            ?.verification
            ?.direct_email_verified &&
          Array.isArray(
            authority
              ?.contact
              ?.emails
          ) &&
          authority
            .contact
            .emails
            .length > 0
        ),

      contactEmails:
        authority
          ?.verification
          ?.direct_email_verified &&
        Array.isArray(
          authority
            ?.contact
            ?.emails
        )
          ? [
              ...authority
                .contact
                .emails,
            ]
          : [],

      contactPhoneNumbers:
        Array.isArray(
          authority
            ?.contact
            ?.phones
        )
          ? [
              ...authority
                .contact
                .phones,
            ]
          : Array.isArray(
              authority
                ?.contact
                ?.phone_numbers
            )
            ? [
                ...authority
                  .contact
                  .phone_numbers,
              ]
            : [],

      contactAddress:
        authority
          ?.contact
          ?.address || "",

      submissionUrl:
        authority
          ?.contact
          ?.contact_page ||
        authority
          ?.contact
          ?.contact_form ||
        authority
          ?.contact
          ?.services_directory ||
        authority
          ?.contact
          ?.website ||
        "",

      sourceUrls:
        authority
          ?.verification
          ?.source_urls || [],
    };
  }

  return unmatched(
    "security_agency_or_issue_type_required"
  );
}

/* ======================================================
   JUDICIARY
====================================================== */

const JUDICIARY_COURT_AUTHORITIES =
  Object.freeze([
    SUPREME_COURT_ADMINISTRATION,
    COURT_OF_APPEAL_ADMINISTRATION,
    FEDERAL_HIGH_COURT_ADMINISTRATION,
    NATIONAL_INDUSTRIAL_COURT_ADMINISTRATION,
    FCT_HIGH_COURT_ADMINISTRATION,
    RELEVANT_STATE_JUDICIARY,
  ]);

function findJudiciaryCourt(
  context
) {
  const text =
    [
      context.institutionName,
      context.complaint,
    ].join(" ");

  for (
    const authority
    of JUDICIARY_COURT_AUTHORITIES
  ) {
    if (
      [
        authority.name,
        ...(authority.aliases || []),
      ].some(
        alias =>
          aliasHit(
            text,
            alias
          )
      )
    ) {
      return {
        name:
          authority.name,

        authority,
      };
    }
  }

  const supplied =
    suppliedInstitution(
      context,
      [
        NJC_JUDICIAL_DISCIPLINE.name,
        "NJC",
        NHRC_JUSTICE_CHAIN_COMPLAINTS.name,
        "NHRC",
        PCC_COURT_ADMINISTRATION_COMPLAINTS.name,
        "PCC",
        LPDC_LEGAL_PRACTITIONER_DISCIPLINE.name,
        "LPDC",
        "Body of Benchers",
      ]
    );

  if (supplied) {
    return {
      name:
        supplied,

      authority:
        null,
    };
  }

  return null;
}

function judiciaryAuthorityChannel(
  authority
) {
  if (!authority) {
    return {
      deliveryMethod:
        "verified_official_or_physical_registry_channel",

      emailRoutingExpected:
        false,

      submissionUrl:
        "",

      sourceUrls:
        [],
    };
  }

  const submissionUrl =
    authority
      ?.contact
      ?.contact_page ||
    authority
      ?.contact
      ?.contact_form ||
    authority
      ?.contact
      ?.litigation_information ||
    authority
      ?.contact
      ?.divisions_directory ||
    authority
      ?.contact
      ?.website ||
    "";

  return {
    deliveryMethod:
      authority
        .physical_filing_required
        ? "official_physical_filing"
        : authority.portal_only
        ? "official_portal_or_physical_registry"
        : "verified_email_or_official_registry_channel",

    emailRoutingExpected:
      Boolean(
        authority
          ?.verification
          ?.direct_email_verified
      ) &&
      !authority.portal_only,

    submissionUrl,

    sourceUrls:
      authority
        ?.verification
        ?.source_urls || [],
  };
}

export function resolveJudiciaryRouting(
  context = {}
) {
  if (!isNigeria(context)) {
    return unmatched(
      "country_not_supported"
    );
  }

  const text =
    normalize(
      [
        context.institutionName,
        context.complaint,
      ].join(" ")
    );

  const courtMatch =
    findJudiciaryCourt(
      context
    );

  const court =
    courtMatch?.name || "";

  const courtAuthority =
    courtMatch?.authority || null;

  const courtChannel =
    judiciaryAuthorityChannel(
      courtAuthority
    );

  const misconduct =
    includesAny(
      text,
      [
        "judicial misconduct",
        "judicial officer misconduct",
        "judge demanded bribe",
        "judicial bribery",
        "judge bribery",
        "judge compromised",
        "bias allegation",
        "judicial conflict of interest",
        "conflict of interest",
        "sexual harassment by judge",
        "sexual harassment by judicial officer",
        "improper ex parte communication",
        "judge communicated privately",
        "corruption by judge",
      ]
    );

  const lawyerMisconduct =
    includesAny(
      text,
      [
        "lawyer misconduct",
        "legal practitioner misconduct",
        "professional misconduct by lawyer",
        "lawyer withheld client money",
        "lawyer misappropriated funds",
        "lawyer stole client money",
        "lawyer abandoned case",
        "lawyer forged court document",
        "lawyer falsified court document",
        "lawyer refused to release case file",
        "lawyer refused to account for money",
      ]
    );

  const meritsChallenge =
    includesAny(
      text,
      [
        "overturn the judgment",
        "reverse the judgment",
        "set aside the judgment",
        "wrong judgment",
        "judgment was wrong",
        "judge interpreted the law wrongly",
        "sentence is too harsh",
        "conviction is wrong",
        "dissatisfied with the judgment",
        "appeal the judgment",
        "appeal the ruling",
        "change the court decision",
      ]
    );

  const registryIssue =
    includesAny(
      text,
      [
        "registry delay",
        "registry delayed",
        "registry has delayed",
        "registry is delaying",
        "court registry delay",
        "registry refusal",
        "registry refused",
        "registry has refused",
        "registry extortion",
        "missing case file",
        "missing my case file",
        "my case file is missing",
        "case file is missing",
        "case file has gone missing",
        "lost case file",
        "lost my case file",
        "registry lost my case file",
        "registry has lost my case file",
        "court registry lost my case file",
        "court registry has lost my case file",
        "case file was lost",
        "case file has been lost",
        "case file missing",
        "record of appeal delay",
        "appeal record not compiled",
        "record not compiled",
        "certified true copy delay",
        "certified true copy delayed",
        "delayed certified true copy",
        "delayed my certified true copy",
        "certified true copy has been delayed",
        "certified true copy not issued",
        "CTC delay",
        "CTC delayed",
        "hearing notice not issued",
        "court process not served",
        "sheriff delay",
        "court staff misconduct",
        "bail bond processing delay",
        "judgment enforcement delay",
        "writ of execution delay",
      ]
    );

  const judicialDelay =
    includesAny(
      text,
      [
        "reserved judgment delayed",
        "reserved judgment is delayed",
        "reserved judgment is still delayed",
        "reserved judgment remains delayed",
        "judgment is still delayed",
        "judgment remains undelivered",
        "judgment not delivered",
        "ruling delayed",
        "ruling is still delayed",
        "reserved ruling",
        "endless adjournment",
        "frequent adjournments",
        "court not sitting",
        "trial delay",
        "undue judicial delay",
        "justice delayed",
      ]
    );

  const justiceRightsIssue =
    includesAny(
      text,
      [
        "unlawful detention",
        "remand without trial",
        "torture",
        "forced confession",
        "access to lawyer denied",
        "police ignored court order",
        "disobedience of court order",
        "refusal to obey court order",
        "fair hearing denied",
        "denial of bail",
      ]
    );

  if (misconduct) {
    return {
      matched: true,
      sector:
        "judiciary",
      caseType:
        "judicial_misconduct",
      jurisdiction:
        "national_judicial_discipline",
      routeKey:
        "njc_judicial_misconduct",
      primaryInstitution:
        NJC_JUDICIAL_DISCIPLINE.name,
      ccInstitutions: [],
      deliveryMethod:
        "physical_filing_with_verifying_affidavit",
      emailRoutingExpected:
        false,
      submissionUrl:
        NJC_JUDICIAL_DISCIPLINE
          .contact
          .discipline_regulations,
      filingAddress:
        NJC_JUDICIAL_DISCIPLINE
          .contact
          .address,
      documentPurpose:
        "Complaint alleging misconduct by a Judicial Officer",
      routingNote:
        "Address the complaint to the Chief Justice of Nigeria and Chairman of the NJC. It must contain specific facts, be signed and be accompanied by a verifying affidavit. File it through an authorised NJC filing location. A disciplinary complaint cannot replace an appeal against a judgment or ruling.",
      sourceUrls:
        NJC_JUDICIAL_DISCIPLINE
          .verification
          .source_urls,
    };
  }

  if (meritsChallenge) {
    return {
      matched: true,
      sector:
        "judiciary",
      caseType:
        "appeal_or_legal_review",
      jurisdiction:
        "appellate_or_review_process",
      routeKey:
        "judicial_decision_appeal_required",
      primaryInstitution:
        "A Qualified Legal Practitioner or the Appropriate Appellate Court",
      ccInstitutions: [],
      deliveryMethod:
        "legal_advice_and_court_process",
      emailRoutingExpected:
        false,
      blockGeneration:
        true,
      userMessage:
        "A disciplinary or administrative petition cannot overturn or vary a court judgment, ruling, conviction or sentence. The appropriate remedy may be an appeal, review or another court procedure subject to strict legal deadlines. Obtain qualified legal advice promptly.",
      documentPurpose:
        "Legal review of possible appeal or court remedies",
      routingNote:
        "NJC disciplinary proceedings do not serve as an appeal against the merits of a judicial decision.",
      sourceUrls:
        NJC_JUDICIAL_DISCIPLINE
          .verification
          .source_urls,
    };
  }

  if (lawyerMisconduct) {
    return {
      matched: true,
      sector:
        "judiciary",
      caseType:
        "legal_practitioner_misconduct",
      jurisdiction:
        "legal_professional_discipline",
      routeKey:
        "lpdc_legal_practitioner_discipline",
      primaryInstitution:
        LPDC_LEGAL_PRACTITIONER_DISCIPLINE.name,
      ccInstitutions: [],
      deliveryMethod:
        "official_physical_disciplinary_filing",
      emailRoutingExpected:
        false,
      submissionUrl:
        LPDC_LEGAL_PRACTITIONER_DISCIPLINE
          .contact
          .contact_page,
      filingAddress:
        LPDC_LEGAL_PRACTITIONER_DISCIPLINE
          .contact
          .address,
      documentPurpose:
        "Professional misconduct complaint against a legal practitioner",
      routingNote:
        "State the lawyer's full name, enrolment or chambers details where known, the instructions given, money or documents involved, dates, previous demands and the remedy sought. Use the authorised LPDC or Body of Benchers disciplinary process.",
      sourceUrls:
        LPDC_LEGAL_PRACTITIONER_DISCIPLINE
          .verification
          .source_urls,
    };
  }

  if (justiceRightsIssue) {
    return {
      matched: true,
      sector:
        "judiciary",
      caseType:
        "human_rights",
      jurisdiction:
        "national_human_rights",
      routeKey:
        "justice_chain_nhrc",
      primaryInstitution:
        NHRC_JUSTICE_CHAIN_COMPLAINTS.name,
      ccInstitutions:
        court
          ? [court]
          : [],
      ...verifiedAuthorityMetadata(
        NHRC_JUSTICE_CHAIN_COMPLAINTS
      ),
      submissionUrl:
        NHRC_JUSTICE_CHAIN_COMPLAINTS
          .contact
          .complaint_form,
      documentPurpose:
        "Human-rights complaint involving the justice or detention chain",
      routingNote:
        "Provide the suit or charge number where available, detention details, relevant court orders, chronology and evidence of the alleged rights violation.",
      sourceUrls:
        NHRC_JUSTICE_CHAIN_COMPLAINTS
          .verification
          .source_urls,
    };
  }

  if (registryIssue) {
    return {
      matched: true,
      sector:
        "judiciary",
      caseType:
        "administrative_delay",
      jurisdiction:
        "court_registry_administration",
      routeKey:
        "court_registry_complaint",
      primaryInstitution:
        court ||
        "The Chief Registrar of the Relevant Court",
      ccInstitutions: [
        PCC_COURT_ADMINISTRATION_COMPLAINTS.name,
      ],
      ...courtChannel,
      documentPurpose:
        "Administrative complaint concerning court registry or court-service failure",
      routingNote:
        "Focus on registry administration, missing files, certified copies, service, record compilation, enforcement processing or other administrative failures. Do not use this route to attack the merits of a pending or decided case.",
    };
  }

  if (judicialDelay) {
    if (
      !isEscalated(
        context
      )
    ) {
      return {
        matched: true,
        sector:
          "judiciary",
        caseType:
          "administrative_delay",
        jurisdiction:
          "head_of_court",
        routeKey:
          "head_of_court_delay_complaint",
        primaryInstitution:
          court ||
          "The Head of the Relevant Court",
        ccInstitutions: [],
        ...courtChannel,
        documentPurpose:
          "Administrative request concerning court delay or case-management failure",
        routingNote:
          "Address the administrative concern to the relevant Head of Court or Chief Registrar without asking the recipient to determine the merits outside lawful court proceedings.",
      };
    }

    return {
      matched: true,
      sector:
        "judiciary",
      caseType:
        "judicial_misconduct",
      jurisdiction:
        "national_judicial_discipline",
      routeKey:
        "njc_delay_escalation",
      primaryInstitution:
        NJC_JUDICIAL_DISCIPLINE.name,
      ccInstitutions:
        court
          ? [court]
          : [],
      deliveryMethod:
        "physical_filing_with_verifying_affidavit",
      emailRoutingExpected:
        false,
      submissionUrl:
        NJC_JUDICIAL_DISCIPLINE
          .contact
          .discipline_regulations,
      filingAddress:
        NJC_JUDICIAL_DISCIPLINE
          .contact
          .address,
      documentPurpose:
        "Escalated complaint alleging serious or continuing failure in the expeditious administration of court business",
      routingNote:
        "Particularise the dates, proceedings, previous administrative complaint and continuing delay. The complaint must comply with NJC filing, signature and verifying-affidavit requirements.",
      sourceUrls:
        NJC_JUDICIAL_DISCIPLINE
          .verification
          .source_urls,
    };
  }

  if (court) {
    return {
      matched: true,
      sector:
        "judiciary",
      caseType:
        "administrative_delay",
      jurisdiction:
        "court_administration",
      routeKey:
        "court_administration_first",
      primaryInstitution:
        court,
      ccInstitutions: [
        PCC_COURT_ADMINISTRATION_COMPLAINTS.name,
      ],
      ...courtChannel,
      documentPurpose:
        "Administrative complaint to the responsible court or court registry",
      routingNote:
        "State the suit number, division, relevant dates, administrative action requested and supporting receipts or correspondence. Avoid asking an administrative recipient to overturn a judicial decision.",
    };
  }

  return unmatched(
    "judiciary_issue_type_or_court_required"
  );
}

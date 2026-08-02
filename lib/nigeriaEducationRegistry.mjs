/*
 * PetitionDesk nationwide Nigerian education registry.
 *
 * Routing principles:
 * - complain to the educational institution first;
 * - use official examination support portals;
 * - escalate university matters to NUC where appropriate;
 * - escalate TVET matters to NBTE;
 * - escalate colleges of education matters to NCCE;
 * - route basic-education matters through the responsible
 *   school, SUBEB or UBEC channel;
 * - never invent complaint emails.
 */

const VERIFIED_ON = "2026-08-02";

function authority({
  key,
  name,
  aliases = [],
  emails = [],
  address = "",
  website = "",
  channels = {},
  sourceUrls = [],
}) {
  return Object.freeze({
    key,
    name,

    aliases: Object.freeze([
      ...new Set([
        name,
        ...aliases,
      ]),
    ]),

    contact: {
      emails: Object.freeze(emails),
      address,
      website,
      ...channels,
    },

    verification: {
      status: "VERIFIED_OFFICIAL_SOURCE",
      verified_on: VERIFIED_ON,
      scope:
        "identity_and_official_complaint_channel",
      direct_email_verified:
        emails.length > 0,
      source_urls:
        Object.freeze(sourceUrls),
    },
  });
}

export const JAMB_EDUCATION_SUPPORT =
  authority({
    key: "jamb_support_ticket",

    name:
      "Joint Admissions and Matriculation Board (JAMB)",

    aliases: [
      "JAMB",
      "Joint Admissions and Matriculation Board",
      "UTME",
      "Unified Tertiary Matriculation Examination",
      "JAMB CAPS",
      "CAPS admission",
    ],

    website:
      "https://www.jamb.gov.ng/",

    channels: {
      candidate_support:
        "https://support.jamb.gov.ng/candidate-support/create-candidate-ticket",

      general_support:
        "https://support.jamb.gov.ng/candidate-support/create-general-ticket",

      ticket_tracking:
        "https://support.jamb.gov.ng/candidate-support/my-tickets",
    },

    sourceUrls: [
      "https://support.jamb.gov.ng/candidate-support/create-candidate-ticket",
      "https://support.jamb.gov.ng/candidate-support/create-general-ticket",
      "https://support.jamb.gov.ng/candidate-support/my-tickets",
    ],
  });

export const NECO_EDUCATION_COMPLAINTS =
  authority({
    key: "neco_complaint_portal",

    name:
      "National Examinations Council (NECO)",

    aliases: [
      "NECO",
      "National Examinations Council",
      "NECO Nigeria",
    ],

    emails: [
      "info@neco.gov.ng",
    ],

    website:
      "https://www.neco.gov.ng/",

    channels: {
      complaint_portal:
        "https://complaints.neco.gov.ng/",
    },

    sourceUrls: [
      "https://complaints.neco.gov.ng/",
    ],
  });

export const WAEC_NIGERIA_COMPLAINTS =
  authority({
    key: "waec_candidate_channel",

    name:
      "West African Examinations Council (WAEC) Nigeria",

    aliases: [
      "WAEC",
      "WAEC Nigeria",
      "West African Examinations Council",
      "WASSCE",
      "WAEC National Office",
    ],

    emails: [
      "cscyaba@waec.org.ng",
      "hnowaecnigeria@waec.org.ng",
    ],

    address:
      "21 Hussey Street, Yaba, Lagos State, Nigeria",

    website:
      "https://www.waecnigeria.org/",

    channels: {
      candidate_guidance:
        "https://www.waecnigeria.org/faq/",

      national_office:
        "https://www.waecnigeria.org/national-office",

      withheld_result_portal:
        "https://waecinternational.org/complaints",
    },

    sourceUrls: [
      "https://www.waecnigeria.org/faq/",
      "https://www.waecnigeria.org/national-office",
      "https://www.waecnigeria.org/article/complaint-portal-candidates-whose-results-were-withheldheld",
    ],
  });

export const NUC_UNIVERSITY_GRIEVANCE =
  authority({
    key: "nuc_grievance_escalation",

    name:
      "National Universities Commission (NUC)",

    aliases: [
      "NUC",
      "National Universities Commission",
      "NUC SERVICOM",
    ],

    emails: [
      "servicom@nuc.edu.ng",
    ],

    address:
      "Aja Nwachukwu House, Plot 430, Aguiyi Ironsi Street, Maitama, Abuja, Nigeria",

    website:
      "https://www.nuc.edu.ng/",

    channels: {
      grievance_guide:
        "https://www.nuc.edu.ng/servicom/",
    },

    sourceUrls: [
      "https://www.nuc.edu.ng/servicom/",
    ],
  });

export const NBTE_TECHNICAL_EDUCATION_COMPLAINTS =
  authority({
    key: "nbte_complaint_escalation",

    name:
      "National Board for Technical Education (NBTE)",

    aliases: [
      "NBTE",
      "National Board for Technical Education",
      "NBTE Inspectorate",
    ],

    emails: [
      "inspectorate@nbte.gov.ng",
      "enquiries@nbte.gov.ng",
    ],

    address:
      "Plot B, Bida Road, Kaduna, Nigeria",

    website:
      "https://www.nbte.gov.ng/",

    channels: {
      inspectorate:
        "https://web.nbte.gov.ng/inspectorate",
    },

    sourceUrls: [
      "https://web.nbte.gov.ng/inspectorate",
      "https://web.nbte.gov.ng/node/122",
    ],
  });

export const NCCE_TEACHER_EDUCATION_COMPLAINTS =
  authority({
    key: "ncce_complaint_escalation",

    name:
      "National Commission for Colleges of Education (NCCE)",

    aliases: [
      "NCCE",
      "National Commission for Colleges of Education",
      "NCCE SERVICOM",
    ],

    emails: [
      "servicom@ncce.gov.ng",
      "info@ncce.gov.ng",
    ],

    address:
      "Plot 829, Cadastral Zone A01, Ralph Shodeinde Street, Garki, Abuja, Nigeria",

    website:
      "https://ncce.gov.ng/",

    channels: {
      servicom:
        "https://ncce.gov.ng/Servicom",
    },

    sourceUrls: [
      "https://ncce.gov.ng/Servicom",
      "https://ncce.gov.ng/",
    ],
  });

export const UBEC_BASIC_EDUCATION_COMPLAINTS =
  authority({
    key: "ubec_basic_education_channel",

    name:
      "Universal Basic Education Commission (UBEC)",

    aliases: [
      "UBEC",
      "Universal Basic Education Commission",
      "Universal Basic Education",
      "SUBEB",
      "State Universal Basic Education Board",
    ],

    address:
      "No. 7 Gwani Street, Wuse Zone 4, Abuja, Nigeria",

    website:
      "https://ubec.gov.ng/",

    channels: {
      contact_page:
        "https://ubec.gov.ng/contact-us/",

      servicom:
        "https://ubec.gov.ng/servicom/",
    },

    sourceUrls: [
      "https://ubec.gov.ng/contact-us/",
      "https://ubec.gov.ng/servicom/",
    ],
  });

export const NIGERIAN_EDUCATION_AUTHORITIES =
  Object.freeze([
    JAMB_EDUCATION_SUPPORT,
    NECO_EDUCATION_COMPLAINTS,
    WAEC_NIGERIA_COMPLAINTS,
    NUC_UNIVERSITY_GRIEVANCE,
    NBTE_TECHNICAL_EDUCATION_COMPLAINTS,
    NCCE_TEACHER_EDUCATION_COMPLAINTS,
    UBEC_BASIC_EDUCATION_COMPLAINTS,
  ]);

const GENERIC_EDUCATION_KEYWORDS = [
  "education",
  "school",
  "primary school",
  "secondary school",
  "university",
  "polytechnic",
  "monotechnic",
  "technical college",
  "college of education",
  "teacher training college",
  "student",
  "pupil",
  "candidate",
  "admission",
  "JAMB",
  "UTME",
  "post UTME",
  "CAPS admission",
  "WAEC",
  "WASSCE",
  "NECO",
  "examination",
  "exam result",
  "result withheld",
  "certificate withheld",
  "certificate delay",
  "transcript delay",
  "school fees",
  "illegal levy",
  "accreditation",
  "unapproved programme",
  "illegal institution",
  "satellite campus",
  "certificate racketeering",
  "lecturer misconduct",
  "lecturer harassment",
  "student affairs",
  "registrar",
  "vice chancellor",
  "principal",
  "proprietor",
  "governing council",
  "NYSC mobilisation",
  "NYSC mobilization",
];

export const NIGERIAN_EDUCATION_DETECTION_KEYWORDS =
  Object.freeze([
    ...new Set([
      ...GENERIC_EDUCATION_KEYWORDS,

      ...NIGERIAN_EDUCATION_AUTHORITIES
        .flatMap(
          authority => [
            authority.name,
            ...authority.aliases,
          ]
        ),
    ]),
  ]);

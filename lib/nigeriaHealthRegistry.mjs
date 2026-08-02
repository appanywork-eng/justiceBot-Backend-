/*
 * PetitionDesk nationwide Nigerian health registry.
 *
 * Routing principles:
 * - complain to the named provider first;
 * - use the correct professional regulator;
 * - escalate insurance complaints to NHIA;
 * - route unsafe medical products to NAFDAC;
 * - route serious healthcare-rights violations to NHRC;
 * - never expose an unverified contact.
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
        "identity_direct_contact_and_complaint_process",
      direct_email_verified:
        emails.length > 0,
      source_urls:
        Object.freeze(sourceUrls),
    },
  });
}

export const NHIA_HEALTH_INSURANCE_ESCALATION =
  authority({
    key: "nhia_insurance_escalation",
    name:
      "National Health Insurance Authority (NHIA)",
    aliases: [
      "NHIA",
      "NHIS",
      "National Health Insurance",
      "National Health Insurance Scheme",
      "National Health Insurance Authority",
    ],
    emails: [
      "info@nhia.gov.ng",
    ],
    address:
      "297 Shehu Yar'adua Way, Utako District, Abuja, Nigeria",
    website:
      "https://www.nhia.gov.ng/",
    channels: {
      contact_page:
        "https://www.nhia.gov.ng/contact-us/",
      enrollee_charter:
        "https://www.nhia.gov.ng/enrollee-charter/",
    },
    sourceUrls: [
      "https://www.nhia.gov.ng/contact-us/",
      "https://www.nhia.gov.ng/enrollee-charter/",
    ],
  });

export const MDCN_MEDICAL_DISCIPLINE =
  authority({
    key: "mdcn_practitioner_complaint",
    name:
      "Medical and Dental Council of Nigeria (MDCN)",
    aliases: [
      "MDCN",
      "Medical and Dental Council",
      "Medical and Dental Council of Nigeria",
      "Doctors Licensing Nigeria",
    ],
    emails: [
      "info@mdcn.gov.ng",
    ],
    address:
      "Plot 1102, Cadastral Zone B11, Off Oladipo Diya Road, Kaura District, Abuja, Nigeria",
    website:
      "https://mdcn.gov.ng/",
    channels: {
      complaint_portal:
        "https://mdcn.gov.ng/contact-us",
    },
    sourceUrls: [
      "https://mdcn.gov.ng/",
      "https://mdcn.gov.ng/contact-us",
    ],
  });

export const NMCN_NURSING_DISCIPLINE =
  authority({
    key: "nmcn_nursing_complaint",
    name:
      "Nursing and Midwifery Council of Nigeria (NMCN)",
    aliases: [
      "NMCN",
      "Nursing and Midwifery Council",
      "Nursing and Midwifery Council of Nigeria",
      "Nurses Licensing Nigeria",
    ],
    emails: [
      "info@nmcn.gov.ng",
    ],
    address:
      "Plot 713, Cadastral Zone, Life Camp, Gwarinpa, Abuja, Nigeria",
    website:
      "https://www.nmcn.gov.ng/",
    channels: {
      support_page:
        "https://myportal.nmcn.gov.ng/faq",
    },
    sourceUrls: [
      "https://myportal.nmcn.gov.ng/faq",
    ],
  });

export const PCN_PHARMACY_DISCIPLINE =
  authority({
    key: "pcn_pharmacy_complaint",
    name:
      "Pharmacy Council of Nigeria (PCN)",
    aliases: [
      "PCN",
      "Pharmacy Council",
      "Pharmacy Council of Nigeria",
      "Pharmacists Council of Nigeria",
      "Pharmacists Licensing Nigeria",
    ],
    emails: [
      "connect@pcn.gov.ng",
    ],
    address:
      "Plot 7/9 Industrial Layout, Idu, Abuja, Nigeria",
    website:
      "https://pcn.gov.ng/",
    channels: {
      contact_page:
        "https://pcn.gov.ng/contact/",
    },
    sourceUrls: [
      "https://pcn.gov.ng/contact/",
      "https://pcn.gov.ng/about-pharmacy-council-nigeria/",
    ],
  });

export const MLSCN_LABORATORY_DISCIPLINE =
  authority({
    key: "mlscn_laboratory_complaint",
    name:
      "Medical Laboratory Science Council of Nigeria (MLSCN)",
    aliases: [
      "MLSCN",
      "Medical Laboratory Science Council",
      "Medical Laboratory Science Council of Nigeria",
      "Lab Licensing Nigeria",
    ],
    emails: [
      "info@mlscn.gov.ng",
    ],
    address:
      "Plot 1166 Mohammed N Umar Lane, Durumi Phase 2, Abuja, Nigeria",
    website:
      "https://mlscn.gov.ng/",
    channels: {
      contact_page:
        "https://web.mlscn.gov.ng/index.php/contact-us/",
    },
    sourceUrls: [
      "https://mlscn.gov.ng/",
      "https://web.mlscn.gov.ng/index.php/contact-us/",
    ],
  });

export const NAFDAC_MEDICAL_PRODUCT_SAFETY =
  authority({
    key: "nafdac_medical_product_report",
    name:
      "National Agency for Food and Drug Administration and Control (NAFDAC)",
    aliases: [
      "NAFDAC",
      "National Agency for Food and Drug Administration and Control",
      "Food and Drug Administration Nigeria",
    ],
    emails: [
      "reforms@nafdac.gov.ng",
      "sf.alert@nafdac.gov.ng",
      "pharmacovigilance@nafdac.gov.ng",
    ],
    address:
      "Plot 2032 Olusegun Obasanjo Way, Zone 7, Wuse, Abuja, Nigeria",
    website:
      "https://nafdac.gov.ng/",
    channels: {
      falsified_product_portal:
        "https://greenbook.nafdac.gov.ng/report/sf",
    },
    sourceUrls: [
      "https://nafdac.gov.ng/about-nafdac/nafdac-laws/",
      "https://greenbook.nafdac.gov.ng/report/sf",
    ],
  });

export const NHRC_HEALTH_RIGHTS =
  authority({
    key: "health_rights_nhrc",
    name:
      "National Human Rights Commission (NHRC)",
    aliases: [
      "NHRC",
      "National Human Rights Commission",
      "National Human Rights Commission Nigeria",
    ],
    emails: [
      "info@nhrc.gov.ng",
    ],
    address:
      "No. 19 Aguiyi Ironsi Street, Maitama, Abuja, Nigeria",
    website:
      "https://www.nigeriarights.gov.ng/",
    channels: {
      complaint_portal:
        "https://www.nigeriarights.gov.ng/index.php/complaint-form",
    },
    sourceUrls: [
      "https://www.nigeriarights.gov.ng/index.php/complaint-form",
      "https://www.nigeriarights.gov.ng/about/nhrc-mandate.html",
    ],
  });

export const FCCPC_HEALTH_CONSUMER_ESCALATION =
  authority({
    key: "health_consumer_escalation",
    name:
      "Federal Competition and Consumer Protection Commission (FCCPC)",
    aliases: [
      "FCCPC",
      "Federal Competition and Consumer Protection Commission",
      "Consumer Protection Commission",
    ],
    emails: [
      "contact@fccpc.gov.ng",
    ],
    address:
      "23 Jimmy Carter Street, Asokoro, Abuja, Nigeria",
    website:
      "https://fccpc.gov.ng/",
    channels: {
      complaint_portal:
        "https://complaints.fccpc.gov.ng/home/login",
      complaint_guide:
        "https://fccpc.gov.ng/consumers/complaint-handling/",
    },
    sourceUrls: [
      "https://fccpc.gov.ng/consumers/complaint-handling/",
      "https://fccpc.gov.ng/about-us/contact/",
      "https://complaints.fccpc.gov.ng/home/login",
    ],
  });

export const NIGERIAN_HEALTH_AUTHORITIES =
  Object.freeze([
    NHIA_HEALTH_INSURANCE_ESCALATION,
    MDCN_MEDICAL_DISCIPLINE,
    NMCN_NURSING_DISCIPLINE,
    PCN_PHARMACY_DISCIPLINE,
    MLSCN_LABORATORY_DISCIPLINE,
    NAFDAC_MEDICAL_PRODUCT_SAFETY,
    NHRC_HEALTH_RIGHTS,
    FCCPC_HEALTH_CONSUMER_ESCALATION,
  ]);

const GENERIC_HEALTH_KEYWORDS = [
  "health",
  "healthcare",
  "hospital",
  "clinic",
  "medical centre",
  "medical center",
  "doctor",
  "dentist",
  "nurse",
  "midwife",
  "pharmacist",
  "pharmacy",
  "laboratory",
  "medical laboratory",
  "HMO",
  "health insurance",
  "NHIA",
  "NHIS",
  "medical negligence",
  "treatment refusal",
  "emergency care refusal",
  "patient detained",
  "hospital bill",
  "counterfeit drug",
  "fake medicine",
  "expired drug",
  "adverse drug reaction",
  "unlicensed doctor",
  "unlicensed hospital",
  "unlicensed pharmacy",
  "unlicensed laboratory",
  "medical report",
  "lab result",
  "ambulance",
  "diagnosis",
  "surgery",
  "prescription",
  "enrollee",
  "capitation",
  "referral authorization",
  "referral authorisation",
];

export const NIGERIAN_HEALTH_DETECTION_KEYWORDS =
  Object.freeze([
    ...new Set([
      ...GENERIC_HEALTH_KEYWORDS,
      ...NIGERIAN_HEALTH_AUTHORITIES
        .flatMap(
          institution => [
            institution.name,
            ...institution.aliases,
          ]
        ),
    ]),
  ]);

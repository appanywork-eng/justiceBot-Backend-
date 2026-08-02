/*
 * PetitionDesk nationwide Nigerian diaspora and consular registry.
 *
 * Routing principles:
 * - use the nearest Nigerian mission for country-specific consular help;
 * - use MFA central consular services where the mission cannot be identified
 *   or the matter requires headquarters escalation;
 * - use NiDCOM for diaspora welfare, stranded-person and institutional support;
 * - use NIS for passport and immigration-service complaints;
 * - use NAPTIP for trafficking, deceptive recruitment and exploitation;
 * - never guess a mission email or expose an unverified contact.
 */

const VERIFIED_ON = "2026-08-02";

function authority({
  key,
  name,
  aliases = [],
  emails = [],
  phoneNumbers = [],
  address = "",
  website = "",
  channels = {},
  sourceUrls = [],
  countrySpecific = false,
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

    country_specific:
      countrySpecific,

    contact: {
      emails:
        Object.freeze(emails),

      phone_numbers:
        Object.freeze(phoneNumbers),

      address,
      website,
      ...channels,
    },

    verification: {
      status:
        "VERIFIED_OFFICIAL_SOURCE",

      verified_on:
        VERIFIED_ON,

      scope:
        "official_identity_and_service_channel",

      direct_email_verified:
        emails.length > 0,

      source_urls:
        Object.freeze(sourceUrls),
    },
  });
}

export const NIGERIAN_DIPLOMATIC_MISSION_DIRECTORY =
  authority({
    key:
      "nearest_nigerian_diplomatic_mission",

    name:
      "The Nearest Nigerian Embassy, High Commission or Consulate",

    aliases: [
      "Nigerian Embassy",
      "Nigeria Embassy",
      "Nigerian High Commission",
      "Nigeria High Commission",
      "Nigerian Consulate",
      "Nigeria Consulate",
      "Nigerian diplomatic mission",
      "nearest Nigerian mission",
      "embassy of Nigeria",
      "consulate of Nigeria",
    ],

    website:
      "https://foreignaffairs.gov.ng/diplomatic-missions/",

    channels: {
      mission_directory:
        "https://foreignaffairs.gov.ng/diplomatic-missions/",
    },

    countrySpecific: true,

    sourceUrls: [
      "https://foreignaffairs.gov.ng/diplomatic-missions/",
      "https://foreignaffairs.gov.ng/services/visas-%26-passports/",
    ],
  });

export const MFA_CONSULAR_SERVICES =
  authority({
    key:
      "mfa_consular_services",

    name:
      "Federal Ministry of Foreign Affairs – Consular and Legal Department",

    aliases: [
      "Ministry of Foreign Affairs",
      "Federal Ministry of Foreign Affairs",
      "MFA Nigeria",
      "Nigeria Foreign Affairs Ministry",
      "Consular and Legal Department",
      "MFA Consular Services",
    ],

    emails: [
      "info@foreignaffairs.gov.ng",
    ],

    phoneNumbers: [
      "+234952365223",
    ],

    address:
      "Tafewa Balewa House, Central Business District, Abuja, Nigeria",

    website:
      "https://foreignaffairs.gov.ng/",

    channels: {
      consular_services:
        "https://foreignaffairs.gov.ng/services/visas-%26-passports/",

      diplomatic_missions:
        "https://foreignaffairs.gov.ng/diplomatic-missions/",

      authentication_platform:
        "https://acs.foreignaffairs.gov.ng/",
    },

    sourceUrls: [
      "https://foreignaffairs.gov.ng/",
      "https://foreignaffairs.gov.ng/services/visas-%26-passports/",
      "https://foreignaffairs.gov.ng/diplomatic-missions/",
      "https://acs.foreignaffairs.gov.ng/",
    ],
  });

export const NIDCOM_DIASPORA_SUPPORT =
  authority({
    key:
      "nidcom_diaspora_support",

    name:
      "Nigerians in Diaspora Commission (NiDCOM)",

    aliases: [
      "NiDCOM",
      "NIDCOM",
      "Nigerians in Diaspora Commission",
      "Diaspora Commission",
      "Nigeria Diaspora Commission",
    ],

    emails: [
      "admin@nidcom.gov.ng",
    ],

    phoneNumbers: [
      "+2347014606361",
      "+23492780553",
    ],

    address:
      "Federal Secretariat, Phase 1, Annex 3, 2nd Floor, Abuja, Nigeria",

    website:
      "https://nidcom.gov.ng/",

    channels: {
      contact_page:
        "https://nidcom.gov.ng/contact-nidcom/",

      diaspora_registry:
        "https://registry.nidcom.gov.ng/",
    },

    sourceUrls: [
      "https://nidcom.gov.ng/",
      "https://nidcom.gov.ng/contact-nidcom/",
      "https://registry.nidcom.gov.ng/",
    ],
  });

export const NIS_PASSPORT_SUPPORT =
  authority({
    key:
      "nis_passport_support",

    name:
      "Nigeria Immigration Service (NIS)",

    aliases: [
      "NIS",
      "Nigeria Immigration Service",
      "Nigerian Immigration Service",
      "Immigration Service",
      "NIS Passport Office",
      "passport immigration",
    ],

    emails: [
      "nis.servicom@nigeriaimmigration.gov.ng",
      "support@immigration.gov.ng",
    ],

    phoneNumbers: [
      "+2349121900655",
      "+2349121556359",
      "+2349121477092",
    ],

    address:
      "Umar Musa Yar'Adua Expressway, Airport Road, Sauka, Abuja, Nigeria",

    website:
      "https://immigration.gov.ng/",

    channels: {
      contact_page:
        "https://immigration.gov.ng/contact/",

      passport_information:
        "https://immigration.gov.ng/passports/",

      passport_application:
        "https://passport.immigration.gov.ng/",
    },

    sourceUrls: [
      "https://immigration.gov.ng/contact/",
      "https://immigration.gov.ng/passports/",
      "https://passport.immigration.gov.ng/",
    ],
  });

export const NAPTIP_TRAFFICKING_REPORT =
  authority({
    key:
      "naptip_trafficking_report",

    name:
      "National Agency for the Prohibition of Trafficking in Persons (NAPTIP)",

    aliases: [
      "NAPTIP",
      "National Agency for the Prohibition of Trafficking in Persons",
      "anti trafficking agency",
      "Nigeria anti trafficking agency",
      "human trafficking agency",
    ],

    emails: [
      "info@naptip.gov.ng",
    ],

    phoneNumbers: [
      "+2347030000203",
      "08002255627847",
    ],

    address:
      "No. 2028 Dalaba Street, Wuse Zone 5, Abuja, Nigeria",

    website:
      "https://naptip.gov.ng/",

    channels: {
      incident_reporting:
        "https://nsod.naptip.gov.ng/",
    },

    sourceUrls: [
      "https://naptip.gov.ng/",
      "https://nsod.naptip.gov.ng/",
    ],
  });

export const NIGERIAN_DIASPORA_AUTHORITIES =
  Object.freeze([
    NIGERIAN_DIPLOMATIC_MISSION_DIRECTORY,
    MFA_CONSULAR_SERVICES,
    NIDCOM_DIASPORA_SUPPORT,
    NIS_PASSPORT_SUPPORT,
    NAPTIP_TRAFFICKING_REPORT,
  ]);

const GENERIC_DIASPORA_KEYWORDS = [
  "Nigerian abroad",
  "Nigerians abroad",
  "Nigerian in diaspora",
  "Nigerians in diaspora",
  "diaspora complaint",
  "consular assistance",
  "consular help",
  "consular emergency",
  "embassy assistance",
  "embassy complaint",
  "high commission assistance",
  "consulate assistance",
  "stranded Nigerian",
  "stranded abroad",
  "stranded overseas",
  "distressed Nigerian abroad",
  "detained abroad",
  "arrested abroad",
  "imprisoned abroad",
  "deportation",
  "immigration detention abroad",
  "legal assistance abroad",
  "hospitalised abroad",
  "hospitalized abroad",
  "death abroad",
  "body repatriation",
  "repatriation of remains",
  "emergency evacuation",
  "evacuation abroad",
  "lost passport abroad",
  "stolen passport abroad",
  "expired passport abroad",
  "passport renewal abroad",
  "passport delay abroad",
  "passport application delay",
  "contactless passport",
  "passport biometric",
  "passport appointment",
  "passport correction",
  "passport data correction",
  "emergency travel certificate",
  "travel document",
  "consular registration",
  "register with Nigerian embassy",
  "foreign employer abuse",
  "migrant worker abuse",
  "salary withheld abroad",
  "passport seized by employer",
  "domestic worker abuse abroad",
  "forced labour abroad",
  "forced labor abroad",
  "deceptive recruitment",
  "recruitment scam abroad",
  "human trafficking",
  "trafficked abroad",
  "sexual exploitation abroad",
  "labour exploitation abroad",
  "labor exploitation abroad",
  "victim of trafficking",
  "return to Nigeria",
  "voluntary return",
  "diaspora welfare",
  "diaspora organisation",
  "diaspora organization",
  "Nigerian mission",
  "diplomatic mission",
];

export const NIGERIAN_DIASPORA_DETECTION_KEYWORDS =
  Object.freeze([
    ...new Set([
      ...GENERIC_DIASPORA_KEYWORDS,

      ...NIGERIAN_DIASPORA_AUTHORITIES
        .flatMap(
          authority => [
            authority.name,
            ...authority.aliases,
          ]
        ),
    ]),
  ]);

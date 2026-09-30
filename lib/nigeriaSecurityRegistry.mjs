/*
 * PetitionDesk nationwide Nigerian security and
 * law-enforcement registry.
 *
 * Safety rules:
 * - active emergencies are not ordinary petitions;
 * - crime reports go first to the nearest responsible command;
 * - police misconduct routes to PSC;
 * - serious rights violations route to NHRC;
 * - agency complaints use only verified official channels;
 * - press, recruitment and guessed emails are excluded.
 */

const VERIFIED_ON =
  "2026-08-02";

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
  portalOnly = false,
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

    portal_only:
      portalOnly,

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

export const NPF_NATIONAL_AND_STATE_COMMANDS =
  authority({
    key:
      "npf_national_and_state_commands",

    name:
      "Nigeria Police Force and the Relevant State Police Command",

    aliases: [
      "Nigeria Police Force",
      "Nigeria Police",
      "Nigerian Police",
      "NPF",
      "Police",
      "State Police Command",
      "Police Command",
      "Police Station",
      "Nearest Police Station",
      "Inspector-General of Police",
      "IGP",
      "Police Complaint Response Unit",
      "Police CRU",
    ],

    address:
      "Louis Edet House, Force Headquarters, Garki, Abuja, Nigeria",

    website:
      "https://police.gov.ng/",

    channels: {
      services_directory:
        "https://police.gov.ng/index.php/all/services",

      command_directory:
        "https://police.gov.ng/contact/display",
    },

    portalOnly: true,

    sourceUrls: [
      "https://police.gov.ng/",
      "https://police.gov.ng/index.php/all/services",
      "https://police.gov.ng/contact/display",
    ],
  });

export const PSC_POLICE_DISCIPLINE =
  authority({
    key:
      "psc_police_discipline",

    name:
      "Police Service Commission (PSC)",

    aliases: [
      "PSC",
      "Police Service Commission",
      "Police Discipline Department",
      "PSC Police Discipline",
    ],

    emails: [
      "info@psc.gov.ng",
    ],

    phoneNumbers: [
      "+2347034072676",
      "+2347034072677",
    ],

    address:
      "Plot 64, Cadastral Zone B16, Sector Centre B, Jabi, Abuja, Nigeria",

    website:
      "https://psc.gov.ng/",

    channels: {
      police_discipline:
        "https://www.psc.gov.ng/police-discipline/",
    },

    sourceUrls: [
      "https://psc.gov.ng/",
      "https://www.psc.gov.ng/police-discipline/",
    ],
  });

export const NHRC_SECURITY_RIGHTS_COMPLAINTS =
  authority({
    key:
      "nhrc_security_rights_complaints",

    name:
      "National Human Rights Commission (NHRC)",

    aliases: [
      "NHRC",
      "National Human Rights Commission",
      "Nigeria Human Rights Commission",
      "Human Rights Commission",
    ],

    emails: [
      "info@nhrc.gov.ng",
    ],

    phoneNumbers: [
      "08006472428",
      "6472",
    ],

    address:
      "No. 19 Aguiyi Ironsi Street, Maitama, Abuja, Nigeria",

    website:
      "https://www.nigeriarights.gov.ng/",

    channels: {
      complaint_form:
        "https://www.nigeriarights.gov.ng/index.php/complaint-form",

      complaint_guidance:
        "https://www.nigeriarights.gov.ng/about/nhrc-mandate.html",
    },

    sourceUrls: [
      "https://www.nigeriarights.gov.ng/index.php/complaint-form",
      "https://www.nigeriarights.gov.ng/about/nhrc-mandate.html",
      "https://www.nigeriarights.gov.ng/contact-us.html",
    ],
  });

export const NCOS_COMPLAINT_RESPONSE =
  authority({
    key:
      "ncos_complaint_response",

    name:
      "Nigerian Correctional Service (NCoS)",

    aliases: [
      "NCoS",
      "Nigerian Correctional Service",
      "Nigeria Correctional Service",
      "Correctional Service",
      "Prison Service",
      "Prison",
      "Custodial Centre",
      "Correctional Centre",
    ],

    emails: [
      "complaintresponsedesk@corrections.gov.ng",
      "info@corrections.gov.ng",
    ],

    phoneNumbers: [
      "+2347087086005",
      "+2349060004598",
      "+2348075050006",
    ],

    address:
      "National Headquarters, Bill Clinton Drive, Airport Road, Abuja, Nigeria",

    website:
      "https://corrections.gov.ng/",

    channels: {
      contact_page:
        "https://corrections.gov.ng/contact",
    },

    sourceUrls: [
      "https://corrections.gov.ng/contact",
      "https://corrections.gov.ng/news/disclaimer-%E2%80%BC%EF%B8%8F?news_id=241",
    ],
  });

export const NSCDC_INCIDENT_REPORTING =
  authority({
    key:
      "nscdc_incident_reporting",

    name:
      "Nigeria Security and Civil Defence Corps (NSCDC)",

    aliases: [
      "NSCDC",
      "Nigeria Security and Civil Defence Corps",
      "Nigerian Security and Civil Defence Corps",
      "Civil Defence",
      "Civil Defence Corps",
    ],

    emails: [
      "defenders@nscdc.gov.ng",
    ],

    phoneNumbers: [
      "199",
      "+23492914164",
    ],

    address:
      "Airport Road, Sauka, Abuja, FCT, Nigeria",

    website:
      "https://nscdc.gov.ng/",

    channels: {
      contact_page:
        "https://nscdc.gov.ng/contact-address/",

      incident_reporting:
        "https://nscdc.gov.ng/report-a-crime-online/",
    },

    sourceUrls: [
      "https://nscdc.gov.ng/",
      "https://nscdc.gov.ng/contact-address/",
      "https://nscdc.gov.ng/report-a-crime-online/",
    ],
  });

export const NIS_SERVICOM_COMPLAINTS =
  authority({
    key:
      "nis_servicom_complaints",

    name:
      "Nigeria Immigration Service (NIS)",

    aliases: [
      "NIS",
      "Nigeria Immigration Service",
      "Nigerian Immigration Service",
      "Immigration Service",
      "Immigration",
      "Border Control",
      "Passport Office",
    ],

    emails: [
      "nis.servicom@nigeriaimmigration.gov.ng",
      "nis.reformchampion@immigration.gov.ng",
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

      service_complaints:
        "https://immigration.gov.ng/contact-us/",
    },

    sourceUrls: [
      "https://immigration.gov.ng/contact/",
      "https://immigration.gov.ng/contact-us/",
    ],
  });

export const NIGERIAN_ARMY_CALL_CENTRE =
  authority({
    key:
      "nigerian_army_call_centre",

    name:
      "Nigerian Army (NA)",

    aliases: [
      "Nigerian Army",
      "Nigeria Army",
      "Army",
      "NA",
      "Army Headquarters",
      "Army Call Centre",
    ],

    emails: [
      "na.callcentre@army.mil.ng",
    ],

    phoneNumbers: [
      "193",
      "070812711985",
      "07041467033",
    ],

    address:
      "Plot 1092 Muhammadu Buhari Way, Area 7, Garki, Abuja, Nigeria",

    website:
      "https://army.mil.ng/",

    channels: {
      contact_page:
        "https://army.mil.ng/contact/",
    },

    sourceUrls: [
      "https://army.mil.ng/",
      "https://army.mil.ng/contact/",
    ],
  });

export const NIGERIAN_NAVY_CONTACT =
  authority({
    key:
      "nigerian_navy_contact",

    name:
      "Nigerian Navy (NN)",

    aliases: [
      "Nigerian Navy",
      "Nigeria Navy",
      "Navy",
      "NN",
      "Naval Headquarters",
    ],

    emails: [
      "navy@navy.mil.ng",
    ],

    address:
      "Armed Forces Complex, Plot 1092 Muhammadu Buhari Way, Area 7, Garki, Abuja, Nigeria",

    website:
      "https://navy.mil.ng/",

    channels: {
      contact_page:
        "https://navy.mil.ng/Contact/",
    },

    sourceUrls: [
      "https://navy.mil.ng/",
      "https://navy.mil.ng/Contact/",
    ],
  });

export const NIGERIAN_AIR_FORCE_OMBUDSMAN =
  authority({
    key:
      "nigerian_air_force_ombudsman",

    name:
      "Nigerian Air Force (NAF)",

    aliases: [
      "Nigerian Air Force",
      "Nigeria Air Force",
      "Air Force",
      "NAF",
      "Air Force Headquarters",
      "NAF Ombudsman",
      "Office of the NAF Ombudsman",
    ],

    address:
      "Nigerian Air Force Headquarters, Ministry of Defence, Area 7, Garki, Abuja, Nigeria",

    website:
      "https://airforce.mil.ng/",

    channels: {
      contact_form:
        "https://airforce.mil.ng/index.php/contact",

      ombudsman_information:
        "https://airforce.mil.ng/news/naf-establishes-office-of-ombudsman522922171",
    },

    portalOnly: true,

    sourceUrls: [
      "https://airforce.mil.ng/index.php/contact",
      "https://airforce.mil.ng/news/naf-establishes-office-of-ombudsman522922171",
    ],
  });

export const NIGERIAN_SECURITY_AUTHORITIES =
  Object.freeze([
    NPF_NATIONAL_AND_STATE_COMMANDS,
    PSC_POLICE_DISCIPLINE,
    NHRC_SECURITY_RIGHTS_COMPLAINTS,
    NCOS_COMPLAINT_RESPONSE,
    NSCDC_INCIDENT_REPORTING,
    NIS_SERVICOM_COMPLAINTS,
    NIGERIAN_ARMY_CALL_CENTRE,
    NIGERIAN_NAVY_CONTACT,
    NIGERIAN_AIR_FORCE_OMBUDSMAN,
  ]);

const GENERIC_SECURITY_KEYWORDS = [
  "security complaint",
  "law enforcement complaint",
  "security agency complaint",
  "police complaint",
  "police misconduct",
  "police brutality",
  "police extortion",
  "police harassment",
  "illegal checkpoint",
  "officer demanded money",
  "bail money",
  "unlawful detention",
  "illegal detention",
  "detained without charge",
  "detained without trial",
  "detained beyond lawful period",
  "illegal arrest",
  "unlawful arrest",
  "denial of bail",
  "access to lawyer denied",
  "forced confession",
  "torture",
  "inhuman treatment",
  "extrajudicial killing",
  "forced disappearance",
  "assault by officer",
  "property seized without authority",
  "illegal search",
  "missing person",
  "kidnapping",
  "armed robbery",
  "terror threat",
  "death threat",
  "criminal attack",
  "burglary",
  "crime report",
  "incident report",
  "protection request",
  "witness protection",
  "correctional complaint",
  "prison conditions",
  "inmate welfare",
  "custodial centre",
  "awaiting trial inmate",
  "correctional officer misconduct",
  "civil defence complaint",
  "critical asset vandalism",
  "pipeline vandalism",
  "illegal mining",
  "private security company",
  "immigration complaint",
  "border harassment",
  "passport seizure",
  "visa extortion",
  "deportation complaint",
  "army complaint",
  "army abuse",
  "military abuse",
  "soldier misconduct",
  "navy complaint",
  "navy abuse",
  "naval officer misconduct",
  "air force complaint",
  "air force abuse",
  "airman misconduct",
  "security emergency",
  "currently under attack",
  "immediate danger",
  "kidnapping is ongoing",
  "active shooter",
];

export const NIGERIAN_SECURITY_DETECTION_KEYWORDS =
  Object.freeze([
    ...new Set([
      ...GENERIC_SECURITY_KEYWORDS,

      ...NIGERIAN_SECURITY_AUTHORITIES
        .flatMap(
          authority => [
            authority.name,
            ...authority.aliases,
          ]
        ),
    ]),
  ]);

/*
 * PetitionDesk Nigerian general-administration registry.
 *
 * General routing principles:
 * - use only when no specialist sector is more appropriate;
 * - the institution's internal complaint mechanism ordinarily comes first;
 * - PCC is Nigeria's primary general administrative ombudsman route;
 * - SERVICOM applies to public-service delivery failures;
 * - FCCPC applies to consumer and commercial service complaints;
 * - NHRC applies only where the facts raise human-rights concerns;
 * - state and MDA contacts must be resolved dynamically;
 * - guessed emails and indiscriminate copying are prohibited.
 */

const VERIFIED_ON =
  "2026-08-03";

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
  scope = "",
  portalOnly = false,
  dynamicRoute = false,
  internalFirst = false,
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

    scope,

    portal_only:
      portalOnly,

    dynamic_route:
      dynamicRoute,

    internal_first:
      internalFirst,

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

      direct_email_verified:
        emails.length > 0,

      dynamic_resolution_required:
        dynamicRoute,

      source_urls:
        Object.freeze(sourceUrls),
    },
  });
}

export const PCC_NATIONAL_ADMINISTRATIVE_COMPLAINTS =
  authority({
    key:
      "pcc_national_administrative_complaints",

    name:
      "Public Complaints Commission (PCC)",

    aliases: [
      "Public Complaints Commission",
      "PCC",
      "Nigeria Ombudsman",
      "Nigerian Ombudsman",
      "Federal Ombudsman",
      "Administrative Ombudsman",
      "Public Complaints Commission Nigeria",
    ],

    emails: [
      "complaint@pcc.gov.ng",
      "info@pcc.gov.ng",
    ],

    phoneNumbers: [
      "+2348070100580",
      "+2342097000099",
    ],

    address:
      "25 Aguiyi Ironsi Street, Maitama, Abuja, Nigeria",

    website:
      "https://pcc.gov.ng/",

    channels: {
      complaint_procedure:
        "https://pcc.gov.ng/procedures-for-lodging-complaints/",

      contact_page:
        "https://pcc.gov.ng/contact-us/",

      state_offices:
        "https://pcc.gov.ng/state-offices-contacts/",
    },

    scope:
      "general administrative injustice involving government bodies, public officials, companies and organisations within PCC jurisdiction",

    sourceUrls: [
      "https://pcc.gov.ng/contact-us/",
      "https://pcc.gov.ng/procedures-for-lodging-complaints/",
      "https://pcc.gov.ng/how-the-commission-functions/",
    ],
  });

export const PCC_STATE_OFFICE_DIRECTORY =
  authority({
    key:
      "pcc_state_office_directory",

    name:
      "Relevant Public Complaints Commission State or Area Office",

    aliases: [
      "PCC State Office",
      "PCC Area Office",
      "Public Complaints Commission State Office",
      "Public Complaints Commission Area Office",
      "Nearest PCC Office",
      "Relevant PCC State Office",
      "State Ombudsman Office",
    ],

    website:
      "https://pcc.gov.ng/state-offices-contacts/",

    channels: {
      state_office_directory:
        "https://pcc.gov.ng/state-offices-contacts/",
    },

    scope:
      "location-specific PCC complaint intake and investigation",

    portalOnly: true,
    dynamicRoute: true,

    sourceUrls: [
      "https://pcc.gov.ng/state-offices-contacts/",
      "https://pcc.gov.ng/procedures-for-lodging-complaints/",
    ],
  });

export const SERVICOM_PUBLIC_SERVICE_COMPLAINTS =
  authority({
    key:
      "servicom_public_service_complaints",

    name:
      "SERVICOM",

    aliases: [
      "SERVICOM",
      "Service Compact with All Nigerians",
      "SERVICOM Office",
      "SERVICOM Unit",
      "Ministerial SERVICOM Unit",
      "MDA SERVICOM Unit",
      "Public Service Delivery Unit",
    ],

    emails: [
      "info@servicom.gov.ng",
    ],

    phoneNumbers: [
      "+2348106419581",
      "+2348153566084",
    ],

    address:
      "1st Floor, Phase 3, Federal Secretariat, Shehu Shagari Way, Abuja, Nigeria",

    website:
      "https://servicom.gov.ng/",

    channels: {
      contact_page:
        "https://servicom.gov.ng/contact/",
    },

    scope:
      "failure, delay or poor quality in public-service delivery",

    sourceUrls: [
      "https://servicom.gov.ng/contact/",
    ],
  });

export const FCCPC_CONSUMER_SERVICE_COMPLAINTS =
  authority({
    key:
      "fccpc_consumer_service_complaints",

    name:
      "Federal Competition and Consumer Protection Commission (FCCPC)",

    aliases: [
      "FCCPC",
      "Federal Competition and Consumer Protection Commission",
      "Consumer Protection Commission",
      "Nigeria Consumer Protection",
      "Consumer Complaint Commission",
      "Consumer Protection Authority Nigeria",
    ],

    emails: [
      "contact@fccpc.gov.ng",
    ],

    phoneNumbers: [
      "08056002020",
      "08056003030",
    ],

    address:
      "23 Jimmy Carter Street, Asokoro, Abuja, Nigeria",

    website:
      "https://fccpc.gov.ng/",

    channels: {
      contact_page:
        "https://fccpc.gov.ng/about-us/contact/",

      complaint_guidance:
        "https://fccpc.gov.ng/consumers/complaint-handling/",
    },

    scope:
      "consumer complaints concerning goods, commercial services, unfair charges, failed delivery or refused redress",

    sourceUrls: [
      "https://fccpc.gov.ng/about-us/contact/",
      "https://fccpc.gov.ng/consumers/complaint-handling/",
      "https://fccpc.gov.ng/about-us/faqs/",
    ],
  });

export const NHRC_GENERAL_RIGHTS_COMPLAINTS =
  authority({
    key:
      "nhrc_general_rights_complaints",

    name:
      "National Human Rights Commission (NHRC)",

    aliases: [
      "NHRC",
      "National Human Rights Commission",
      "Nigeria Human Rights Commission",
      "Human Rights Commission Nigeria",
      "Nigerian Human Rights Commission",
    ],

    emails: [
      "info@nhrc.gov.ng",
    ],

    phoneNumbers: [
      "08006472428",
      "6472",
      "092903746",
      "092908829",
      "09032192577",
      "07041678566",
      "07053529460",
    ],

    address:
      "No. 19 Aguiyi Ironsi Street, Maitama, Abuja, Nigeria",

    website:
      "https://www.nigeriarights.gov.ng/",

    channels: {
      complaint_form:
        "https://www.nigeriarights.gov.ng/index.php/complaint-form",

      contact_page:
        "https://www.nigeriarights.gov.ng/contact-us.html",
    },

    scope:
      "general complaints that also disclose a credible human-rights violation",

    sourceUrls: [
      "https://www.nigeriarights.gov.ng/index.php/complaint-form",
      "https://www.nigeriarights.gov.ng/contact-us.html",
    ],
  });

export const RELEVANT_MDA_INTERNAL_COMPLAINT_UNIT =
  authority({
    key:
      "relevant_mda_internal_complaint_unit",

    name:
      "Relevant Institution Internal Complaint or SERVICOM Unit",

    aliases: [
      "Internal Complaint Unit",
      "Internal Complaints Unit",
      "Complaint Desk",
      "Complaints Desk",
      "Customer Service Unit",
      "Internal Grievance Unit",
      "Internal Review Unit",
      "Ministerial SERVICOM Unit",
      "MDA Complaint Unit",
      "Agency Complaint Unit",
      "Department Complaint Unit",
    ],

    website:
      "https://servicom.gov.ng/",

    channels: {
      institution_specific_channel:
        "DYNAMIC_OFFICIAL_INSTITUTION_CHANNEL",

      escalation_guidance:
        "https://pcc.gov.ng/procedures-for-lodging-complaints/",
    },

    scope:
      "first-stage complaint to the responsible institution before external administrative escalation",

    portalOnly: true,
    dynamicRoute: true,
    internalFirst: true,

    sourceUrls: [
      "https://pcc.gov.ng/procedures-for-lodging-complaints/",
      "https://servicom.gov.ng/contact/",
    ],
  });

export const NIGERIAN_GENERAL_ADMINISTRATION_AUTHORITIES =
  Object.freeze([
    PCC_NATIONAL_ADMINISTRATIVE_COMPLAINTS,
    PCC_STATE_OFFICE_DIRECTORY,
    SERVICOM_PUBLIC_SERVICE_COMPLAINTS,
    FCCPC_CONSUMER_SERVICE_COMPLAINTS,
    NHRC_GENERAL_RIGHTS_COMPLAINTS,
    RELEVANT_MDA_INTERNAL_COMPLAINT_UNIT,
  ]);

const GENERAL_ADMINISTRATION_KEYWORDS = [
  "general administrative complaint",
  "administrative injustice",
  "administrative unfairness",
  "administrative abuse",
  "administrative excess",
  "administrative maladministration",
  "government administrative delay",
  "public service complaint",
  "public service delivery failure",
  "government service delivery failure",
  "government agency complaint",
  "government department complaint",
  "ministry complaint",
  "MDA complaint",
  "public authority complaint",
  "public officer complaint",
  "civil service complaint",
  "official refusal to act",
  "government refusal to act",
  "agency refusal to act",
  "ministry refusal to act",
  "unexplained administrative delay",
  "application ignored by government",
  "government failed to respond",
  "agency failed to respond",
  "ministry failed to respond",
  "public institution failed to respond",
  "certificate processing delay",
  "approval processing delay",
  "licence processing delay",
  "license processing delay",
  "permit processing delay",
  "benefit processing delay",
  "official misconduct complaint",
  "bureaucratic injustice",
  "bureaucratic delay",
  "ombudsman complaint",
  "internal complaint unresolved",
  "internal grievance unresolved",
  "complaint reference ignored",
  "service complaint unresolved",
  "consumer service complaint",
  "service not delivered",
  "refund refused",
  "unfair commercial charge",
  "human rights complaint",
];

export const NIGERIAN_GENERAL_ADMINISTRATION_DETECTION_KEYWORDS =
  Object.freeze([
    ...new Set([
      ...GENERAL_ADMINISTRATION_KEYWORDS,

      ...NIGERIAN_GENERAL_ADMINISTRATION_AUTHORITIES
        .flatMap(
          authority => [
            authority.name,
            ...authority.aliases,
          ]
        ),
    ]),
  ]);

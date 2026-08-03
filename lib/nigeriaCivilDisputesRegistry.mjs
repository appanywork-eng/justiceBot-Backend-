/*
 * PetitionDesk Nigerian civil-disputes registry.
 *
 * Routing principles:
 * - private civil disputes must not default to PCC;
 * - specialist regulated sectors take priority;
 * - voluntary mediation or ADR may precede litigation;
 * - court jurisdiction, filing rules and monetary limits vary;
 * - official state judiciary channels must be resolved dynamically;
 * - guessed court or mediation emails are prohibited.
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
  jurisdiction = "",
  scope = "",
  portalOnly = false,
  dynamicRoute = false,
  mediationRoute = false,
  courtRoute = false,
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

    jurisdiction,
    scope,

    portal_only:
      portalOnly,

    dynamic_route:
      dynamicRoute,

    mediation_route:
      mediationRoute,

    court_route:
      courtRoute,

    contact: Object.freeze({
      emails:
        Object.freeze(emails),

      phone_numbers:
        Object.freeze(phoneNumbers),

      address,
      website,
      ...channels,
    }),

    verification: Object.freeze({
      status:
        "VERIFIED_OFFICIAL_SOURCE",

      verified_on:
        VERIFIED_ON,

      direct_email_verified:
        emails.length > 0 &&
        !dynamicRoute,

      dynamic_resolution_required:
        dynamicRoute,

      source_urls:
        Object.freeze(sourceUrls),
    }),
  });
}

export const ABUJA_MULTI_DOOR_COURT =
  authority({
    key:
      "abuja_multi_door_court",

    name:
      "Abuja Multi-Door Court (AMDC)",

    aliases: [
      "Abuja Multi Door Court",
      "Abuja Multi-Door Court",
      "Abuja Multi-Door Court House",
      "Abuja Multi Door Courthouse",
      "AMDC",
      "FCT Multi-Door Court",
      "FCT Multi Door Court",
    ],

    address:
      "Abuja Multi-Door Court House, Gudu, Abuja, FCT, Nigeria",

    website:
      "https://www.fcthighcourt.gov.ng/abuja-multi-door-court-amdc/",

    channels: {
      filing_guidance:
        "https://www.fcthighcourt.gov.ng/wp-content/uploads/2025/07/AMDC-User-Guide.pdf",

      parent_court_contact:
        "https://www.fcthighcourt.gov.ng/",

      submission_methods: Object.freeze([
        "Walk-in filing",
        "Request Form filed at the AMDC Registry",
        "Court referral",
      ]),
    },

    jurisdiction:
      "Federal Capital Territory",

    scope:
      "FCT civil, commercial, landlord-tenant and other disputes suitable for mediation, arbitration or ADR",

    portalOnly: true,
    mediationRoute: true,

    sourceUrls: [
      "https://www.fcthighcourt.gov.ng/abuja-multi-door-court-amdc/",
      "https://www.fcthighcourt.gov.ng/wp-content/uploads/2025/07/AMDC-User-Guide.pdf",
      "https://www.fcthighcourt.gov.ng/client-services-unit/",
    ],
  });

export const LAGOS_CITIZENS_MEDIATION_BUREAU =
  authority({
    key:
      "lagos_citizens_mediation_bureau",

    name:
      "Citizens' Mediation Bureau (CMB), Lagos State",

    aliases: [
      "Citizens Mediation Bureau",
      "Citizens' Mediation Bureau",
      "Citizens Mediation Centre",
      "Citizens' Mediation Centre",
      "Lagos Citizens Mediation Bureau",
      "Lagos Citizens Mediation Centre",
      "Lagos CMB",
      "Lagos CMC",
      "CMC Ikeja",
      "CMB Lagos",
    ],

    emails: [
      "cmcikeja01@gmail.com",
    ],

    phoneNumbers: [
      "08118161620",
    ],

    address:
      "7 LJ Dosunmu Street, Opposite Beehive School, CBD, Alausa, Ikeja, Lagos, Nigeria",

    website:
      "https://lagosstatemoj.org/cmc/",

    channels: {
      submission_methods: Object.freeze([
        "Email petition",
        "Walk-in submission",
        "Telephone request",
        "Referral",
        "Court order",
      ]),

      service_cost:
        "Free mediation service",

      office_directory:
        "https://lagosstatemoj.org/cmc/",
    },

    jurisdiction:
      "Lagos State",

    scope:
      "Lagos civil, landlord-tenant, family, inheritance, land, monetary and commercial mediation disputes",

    mediationRoute: true,

    sourceUrls: [
      "https://lagosstatemoj.org/cmc/",
      "https://lagosstatemoj.org/offices/",
    ],
  });

export const LAGOS_MULTI_DOOR_COURTHOUSE =
  authority({
    key:
      "lagos_multi_door_courthouse",

    name:
      "Lagos Multi-Door Courthouse (LMDC)",

    aliases: [
      "Lagos Multi Door Courthouse",
      "Lagos Multi-Door Courthouse",
      "Lagos Multi Door Court",
      "Lagos ADR Courthouse",
      "LMDC",
    ],

    address:
      "High Court of Lagos State, Lagos State, Nigeria",

    website:
      "https://jis.lagosjudiciary.gov.ng/ViewAboutUS.aspx",

    channels: {
      judiciary_contact:
        "https://lagosjudiciary.gov.ng/contact",

      judiciary_directory:
        "https://jis.lagosjudiciary.gov.ng/ViewDirectories.aspx",

      filing_channel:
        "OFFICIAL_LAGOS_JUDICIARY_OR_LMDC_REGISTRY",
    },

    jurisdiction:
      "Lagos State",

    scope:
      "Lagos court-connected or independently referred civil and commercial ADR matters",

    portalOnly: true,
    mediationRoute: true,

    sourceUrls: [
      "https://jis.lagosjudiciary.gov.ng/ViewAboutUS.aspx",
      "https://lagosjudiciary.gov.ng/about",
      "https://jis.lagosjudiciary.gov.ng/ViewDirectories.aspx",
    ],
  });

export const RELEVANT_STATE_ADR_CENTRE =
  authority({
    key:
      "relevant_state_adr_centre",

    name:
      "Relevant State Multi-Door Courthouse or Official ADR Centre",

    aliases: [
      "State Multi-Door Courthouse",
      "State Multi Door Courthouse",
      "State Multi-Door Court",
      "State Multi Door Court",
      "State ADR Centre",
      "State Mediation Centre",
      "Relevant State ADR Centre",
      "Relevant Multi-Door Courthouse",
      "Court Connected Mediation Centre",
    ],

    website:
      "DYNAMIC_OFFICIAL_STATE_JUDICIARY_CHANNEL",

    channels: {
      official_resolution_method:
        "Locate the relevant institution only through the official state judiciary or state ministry of justice website",

      filing_channel:
        "DYNAMIC_OFFICIAL_ADR_REGISTRY",
    },

    jurisdiction:
      "Relevant Nigerian state",

    scope:
      "Private disputes suitable for mediation or other ADR outside the specifically verified FCT and Lagos routes",

    portalOnly: true,
    dynamicRoute: true,
    mediationRoute: true,

    sourceUrls: [
      "https://www.fcthighcourt.gov.ng/abuja-multi-door-court-amdc/",
      "https://jis.lagosjudiciary.gov.ng/ViewAboutUS.aspx",
    ],
  });

export const RELEVANT_SMALL_CLAIMS_OR_MAGISTRATES_COURT =
  authority({
    key:
      "relevant_small_claims_or_magistrates_court",

    name:
      "Relevant Small Claims Court or Magistrates' Court Registry",

    aliases: [
      "Small Claims Court",
      "Small Claim Court",
      "Magistrates Court",
      "Magistrate Court",
      "District Court",
      "Area Court",
      "Civil Court Registry",
      "Relevant Magistrates Court",
      "Relevant Small Claims Court",
      "Court Registry",
    ],

    website:
      "DYNAMIC_OFFICIAL_COURT_REGISTRY",

    channels: {
      official_resolution_method:
        "Confirm the correct court, monetary jurisdiction, venue, limitation period and filing procedure through the official judiciary",

      filing_channel:
        "DYNAMIC_OFFICIAL_COURT_FILING_CHANNEL",
    },

    jurisdiction:
      "Relevant Nigerian state or the Federal Capital Territory",

    scope:
      "Civil claims requiring formal adjudication where mediation is unsuitable, refused or unsuccessful",

    portalOnly: true,
    dynamicRoute: true,
    courtRoute: true,

    sourceUrls: [
      "https://www.fcthighcourt.gov.ng/",
      "https://lagosjudiciary.gov.ng/MagistrateSmallClaimReports.html?ID=13",
    ],
  });

export const NIGERIAN_CIVIL_DISPUTE_AUTHORITIES =
  Object.freeze([
    ABUJA_MULTI_DOOR_COURT,
    LAGOS_CITIZENS_MEDIATION_BUREAU,
    LAGOS_MULTI_DOOR_COURTHOUSE,
    RELEVANT_STATE_ADR_CENTRE,
    RELEVANT_SMALL_CLAIMS_OR_MAGISTRATES_COURT,
  ]);

const CIVIL_DISPUTE_KEYWORDS = [
  "private civil dispute",
  "civil dispute",
  "civil claim",
  "civil mediation",
  "alternative dispute resolution",
  "ADR",
  "mediation request",
  "settlement request",
  "landlord",
  "tenant",
  "tenancy",
  "rent dispute",
  "house rent dispute",
  "rent increase dispute",
  "rent arrears",
  "unpaid rent",
  "quit notice",
  "eviction notice",
  "threatened eviction",
  "illegal eviction",
  "locked out by landlord",
  "landlord locked me out",
  "tenant refused to leave",
  "tenancy agreement",
  "lease agreement",
  "rental agreement",
  "security deposit",
  "rent deposit",
  "caution fee",
  "deposit refund",
  "landlord refused deposit",
  "property manager dispute",
  "estate manager dispute",
  "repair obligation",
  "landlord refused repairs",
  "tenant damaged property",
  "private debt",
  "personal debt",
  "unpaid personal loan",
  "money owed by individual",
  "debt recovery",
  "monetary claim",
  "loan repayment dispute",
  "breach of private contract",
  "breach of agreement",
  "contract dispute",
  "sale agreement dispute",
  "purchase agreement dispute",
  "failed private agreement",
  "neighbour dispute",
  "neighbor dispute",
  "boundary dispute",
  "property boundary dispute",
  "shared property dispute",
  "inheritance dispute",
  "family property dispute",
  "land ownership dispute",
  "possession dispute",
  "commercial mediation",
  "business partnership dispute",
  "partnership disagreement",
  "shareholder private dispute",
  "payment dispute between individuals",
  "payment dispute between businesses",
  "demand letter",
  "pre-action notice",
  "letter before action",
  "notice of demand",
  "settlement agreement",
  "mediation agreement",
  "memorandum of understanding dispute",
  "MOU dispute",
  "small claims court",
  "magistrates court civil claim",
  "court-connected mediation",
];

export const NIGERIAN_CIVIL_DISPUTE_DETECTION_KEYWORDS =
  Object.freeze([
    ...new Set([
      ...CIVIL_DISPUTE_KEYWORDS,

      ...NIGERIAN_CIVIL_DISPUTE_AUTHORITIES.flatMap(
        authority => [
          authority.name,
          ...authority.aliases,
        ]
      ),
    ]),
  ]);

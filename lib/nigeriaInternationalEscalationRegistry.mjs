/*
 * PetitionDesk Nigerian international-escalation registry.
 *
 * Safety rules:
 * - active emergencies must not wait for international correspondence;
 * - international advocacy is not a court or enforceable legal remedy;
 * - domestic remedies are required where the relevant procedure requires them;
 * - ICC submissions require Rome Statute crime screening;
 * - UN treaty-body eligibility must be confirmed treaty by treaty;
 * - mass emailing and guessed diplomatic contacts are prohibited;
 * - formal international procedures use their designated portals.
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
  advocacyOnly = false,
  formalProcedure = false,
  domesticRoute = false,
  individualCasesAccepted = null,
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

    advocacy_only:
      advocacyOnly,

    formal_procedure:
      formalProcedure,

    domestic_route:
      domesticRoute,

    individual_cases_accepted:
      individualCasesAccepted,

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
        "official_identity_and_public_submission_channel",

      direct_email_verified:
        emails.length > 0,

      source_urls:
        Object.freeze(sourceUrls),
    },
  });
}

export const FMOJ_FINAL_DOMESTIC_ESCALATION =
  authority({
    key:
      "fmoj_final_domestic_escalation",

    name:
      "Federal Ministry of Justice (FMOJ)",

    aliases: [
      "Federal Ministry of Justice",
      "Ministry of Justice Nigeria",
      "FMOJ",
      "Attorney-General of the Federation",
      "Attorney General of the Federation",
      "Office of the Attorney-General of the Federation",
      "AGF",
      "HAGF",
      "Minister of Justice Nigeria",
    ],

    emails: [
      "info@justice.gov.ng",
    ],

    phoneNumbers: [
      "+2348024168778",
    ],

    address:
      "Plot 71B Shehu Shagari Way, Maitama, Abuja, Nigeria",

    website:
      "https://www.justice.gov.ng/",

    channels: {
      contact_page:
        "https://www.justice.gov.ng/contact-us/",
    },

    domesticRoute: true,

    sourceUrls: [
      "https://www.justice.gov.ng/contact-us/",
    ],
  });

export const NHRC_FINAL_DOMESTIC_ESCALATION =
  authority({
    key:
      "nhrc_final_domestic_escalation",

    name:
      "National Human Rights Commission (NHRC)",

    aliases: [
      "NHRC",
      "National Human Rights Commission",
      "Nigeria Human Rights Commission",
      "Human Rights Commission Nigeria",
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

      contact_page:
        "https://www.nigeriarights.gov.ng/contact-us.html",
    },

    domesticRoute: true,
    individualCasesAccepted: true,

    sourceUrls: [
      "https://www.nigeriarights.gov.ng/index.php/complaint-form",
      "https://www.nigeriarights.gov.ng/about/nhrc-mandate.html",
      "https://www.nigeriarights.gov.ng/contact-us.html",
    ],
  });

export const US_TLHRC_HUMAN_RIGHTS_ADVOCACY =
  authority({
    key:
      "us_tlhrc_human_rights_advocacy",

    name:
      "Tom Lantos Human Rights Commission, United States Congress",

    aliases: [
      "Tom Lantos Human Rights Commission",
      "TLHRC",
      "United States Congress Human Rights Commission",
      "US Congress Human Rights",
      "U.S. Congress Human Rights",
      "United States Congressional Human Rights Body",
    ],

    emails: [
      "TLHRC@mail.house.gov",
    ],

    phoneNumbers: [
      "+12022253599",
    ],

    address:
      "4150 O'Neill House Office Building, 200 C Street SW, Washington, DC 20515, United States",

    website:
      "https://humanrightscommission.house.gov/",

    channels: {
      contact_page:
        "https://humanrightscommission.house.gov/contact",

      contact_form:
        "https://humanrightscommission.house.gov/contact/email-us",

      mandate:
        "https://humanrightscommission.house.gov/about/mandate",
    },

    advocacyOnly: true,
    individualCasesAccepted: true,

    sourceUrls: [
      "https://humanrightscommission.house.gov/contact",
      "https://humanrightscommission.house.gov/contact/email-us",
      "https://humanrightscommission.house.gov/about/mandate",
    ],
  });

export const UK_FOREIGN_AFFAIRS_COMMITTEE_ADVOCACY =
  authority({
    key:
      "uk_foreign_affairs_committee_advocacy",

    name:
      "United Kingdom House of Commons Foreign Affairs Committee",

    aliases: [
      "UK Foreign Affairs Committee",
      "Foreign Affairs Committee",
      "House of Commons Foreign Affairs Committee",
      "UK Parliament Foreign Affairs Committee",
      "British Parliament Foreign Affairs Committee",
      "FAC",
    ],

    emails: [
      "fac@parliament.uk",
    ],

    phoneNumbers: [
      "+442072194050",
    ],

    address:
      "Foreign Affairs Committee, House of Commons, London, SW1A 0AA, United Kingdom",

    website:
      "https://committees.parliament.uk/committee/78/",

    channels: {
      committee_page:
        "https://committees.parliament.uk/committee/78/",
    },

    advocacyOnly: true,
    individualCasesAccepted: false,

    sourceUrls: [
      "https://committees.parliament.uk/committee/78/",
    ],
  });

export const UK_FCDO_POLICY_CORRESPONDENCE =
  authority({
    key:
      "uk_fcdo_policy_correspondence",

    name:
      "United Kingdom Foreign, Commonwealth and Development Office (FCDO)",

    aliases: [
      "FCDO",
      "Foreign Commonwealth and Development Office",
      "UK Foreign Office",
      "British Foreign Office",
      "United Kingdom Foreign Office",
    ],

    emails: [
      "fcdo.correspondence@fcdo.gov.uk",
    ],

    phoneNumbers: [
      "+442070085000",
    ],

    address:
      "King Charles Street, Westminster, London, SW1A 2AH, United Kingdom",

    website:
      "https://www.gov.uk/government/organisations/foreign-commonwealth-development-office",

    channels: {
      contact_guidance:
        "https://www.gov.uk/guidance/contact-the-fcdo",

      complaints_procedure:
        "https://www.gov.uk/government/organisations/foreign-commonwealth-development-office/about/complaints-procedure",
    },

    advocacyOnly: true,
    individualCasesAccepted: null,

    sourceUrls: [
      "https://www.gov.uk/guidance/contact-the-fcdo",
      "https://www.gov.uk/government/organisations/foreign-commonwealth-development-office/about/complaints-procedure",
    ],
  });

export const EU_DROI_HUMAN_RIGHTS_ADVOCACY =
  authority({
    key:
      "eu_droi_human_rights_advocacy",

    name:
      "European Parliament Subcommittee on Human Rights (DROI)",

    aliases: [
      "DROI",
      "European Parliament Subcommittee on Human Rights",
      "EU Subcommittee on Human Rights",
      "European Parliament Human Rights Committee",
      "EU Parliament Human Rights",
    ],

    emails: [
      "droi-secretariat@ep.europa.eu",
    ],

    website:
      "https://www.europarl.europa.eu/committees/en/droi/about",

    channels: {
      committee_page:
        "https://www.europarl.europa.eu/committees/en/droi/about",
    },

    advocacyOnly: true,
    individualCasesAccepted: null,

    sourceUrls: [
      "https://www.europarl.europa.eu/committees/en/droi/about",
    ],
  });

export const EU_DELEGATION_NIGERIA_HUMAN_RIGHTS =
  authority({
    key:
      "eu_delegation_nigeria_human_rights",

    name:
      "Delegation of the European Union to Nigeria and ECOWAS",

    aliases: [
      "EU Delegation to Nigeria",
      "European Union Delegation Nigeria",
      "EEAS Nigeria",
      "EU Human Rights Focal Point Nigeria",
      "European External Action Service Nigeria",
    ],

    emails: [
      "delegation-nigeria@eeas.europa.eu",
    ],

    phoneNumbers: [
      "+2342094617800",
    ],

    website:
      "https://www.eeas.europa.eu/delegations/nigeria_en",

    channels: {
      delegation_page:
        "https://www.eeas.europa.eu/delegations/nigeria_en",

      human_rights_focal_point:
        "https://www.eeas.europa.eu/nigeria/who-we-are_en",
    },

    advocacyOnly: true,
    individualCasesAccepted: null,

    sourceUrls: [
      "https://www.eeas.europa.eu/delegations/nigeria_en",
      "https://www.eeas.europa.eu/nigeria/who-we-are_en",
    ],
  });

export const CANADA_GLOBAL_AFFAIRS_ADVOCACY =
  authority({
    key:
      "canada_global_affairs_advocacy",

    name:
      "Global Affairs Canada",

    aliases: [
      "Global Affairs Canada",
      "GAC",
      "Canada Foreign Affairs",
      "Canadian Foreign Affairs",
      "Government of Canada Foreign Affairs",
    ],

    emails: [
      "info@international.gc.ca",
    ],

    phoneNumbers: [
      "+16139444000",
      "+18002678376",
    ],

    address:
      "125 Sussex Drive, Ottawa, Ontario, K1A 0G2, Canada",

    website:
      "https://www.international.gc.ca/",

    channels: {
      contact_page:
        "https://www.international.gc.ca/global-affairs-affaires-mondiales/corporate-ministere/contact-contactez/index.aspx?lang=eng",
    },

    advocacyOnly: true,
    individualCasesAccepted: null,

    sourceUrls: [
      "https://www.international.gc.ca/global-affairs-affaires-mondiales/corporate-ministere/contact-contactez/index.aspx?lang=eng",
    ],
  });

export const ICC_OTP_ARTICLE_15_SUBMISSIONS =
  authority({
    key:
      "icc_otp_article_15_submissions",

    name:
      "International Criminal Court – Office of the Prosecutor",

    aliases: [
      "International Criminal Court",
      "ICC",
      "ICC OTP",
      "ICC Office of the Prosecutor",
      "Office of the Prosecutor",
      "OTPLink",
      "Article 15 Communication",
      "Rome Statute Court",
    ],

    address:
      "Oude Waalsdorperweg 10, 2597 AK The Hague, Netherlands",

    website:
      "https://www.icc-cpi.int/",

    channels: {
      submission_portal:
        "https://otplink.icc-cpi.int/submissions",

      eligibility_guidance:
        "https://otplink.icc-cpi.int/faqs",
    },

    portalOnly: true,
    formalProcedure: true,
    individualCasesAccepted: true,

    sourceUrls: [
      "https://otplink.icc-cpi.int/submissions",
      "https://otplink.icc-cpi.int/faqs",
    ],
  });

export const OHCHR_SPECIAL_PROCEDURES =
  authority({
    key:
      "ohchr_special_procedures",

    name:
      "United Nations Special Procedures of the Human Rights Council",

    aliases: [
      "UN Special Procedures",
      "OHCHR Special Procedures",
      "Special Rapporteur",
      "Special Rapporteurs",
      "Working Group on Arbitrary Detention",
      "Working Group on Enforced Disappearances",
      "United Nations Human Rights Experts",
    ],

    address:
      "OHCHR-UNOG, 8-14 Avenue de la Paix, 1211 Geneva 10, Switzerland",

    website:
      "https://www.ohchr.org/",

    channels: {
      submission_portal:
        "https://spsubmission.ohchr.org/",

      submission_guidance:
        "https://spsubmission.ohchr.org/en",
    },

    portalOnly: true,
    formalProcedure: true,
    individualCasesAccepted: true,

    sourceUrls: [
      "https://spsubmission.ohchr.org/",
      "https://spsubmission.ohchr.org/en",
    ],
  });

export const OHCHR_TREATY_BODY_COMPLAINTS =
  authority({
    key:
      "ohchr_treaty_body_complaints",

    name:
      "OHCHR Treaty Body Individual Communications Portal",

    aliases: [
      "OHCHR Complaints Portal",
      "UN Treaty Body Portal",
      "UN Treaty Body Complaint",
      "Human Rights Committee Complaint",
      "Committee Against Torture Complaint",
      "CEDAW Committee Complaint",
      "Treaty Body Individual Communication",
    ],

    website:
      "https://complaints.ohchr.org/",

    channels: {
      complaints_portal:
        "https://complaints.ohchr.org/",
    },

    portalOnly: true,
    formalProcedure: true,
    individualCasesAccepted: true,

    sourceUrls: [
      "https://complaints.ohchr.org/",
    ],
  });

export const ACHPR_NON_STATE_COMMUNICATIONS =
  authority({
    key:
      "achpr_non_state_communications",

    name:
      "African Commission on Human and Peoples' Rights (ACHPR)",

    aliases: [
      "ACHPR",
      "African Commission",
      "African Commission on Human and Peoples Rights",
      "African Human Rights Commission",
      "African Charter Complaint",
      "Non-State Communication",
    ],

    address:
      "31 Bijilo Annex Layout, Kombo North District, Western Region, P.O. Box 673, Banjul, The Gambia",

    website:
      "https://achpr.au.int/",

    channels: {
      complaint_guidelines:
        "https://achpr.au.int/en/guidelines-submitting-complaints",

      communications_procedure:
        "https://achpr.au.int/index.php/en/other-documents/non-state-inter-state-communication-procedure",
    },

    portalOnly: true,
    formalProcedure: true,
    individualCasesAccepted: true,

    sourceUrls: [
      "https://achpr.au.int/en/guidelines-submitting-complaints",
      "https://achpr.au.int/index.php/en/other-documents/non-state-inter-state-communication-procedure",
    ],
  });

export const ECOWAS_COURT_FORMAL_APPLICATION =
  authority({
    key:
      "ecowas_court_formal_application",

    name:
      "Community Court of Justice, ECOWAS",

    aliases: [
      "ECOWAS Court",
      "ECOWAS Community Court",
      "Community Court of Justice",
      "Community Court of Justice ECOWAS",
      "ECOWAS Court Registry",
    ],

    address:
      "Plot 1164 Joseph Gomwalk Street, Gudu District, Abuja, Nigeria",

    website:
      "https://courtecowas.org/",

    channels: {
      court_rules:
        "https://courtecowas.org/legal-resources/court-rules/",

      registry_information:
        "https://courtecowas.org/structure-of-court/the-registry/",
    },

    portalOnly: true,
    formalProcedure: true,
    individualCasesAccepted: true,

    sourceUrls: [
      "https://courtecowas.org/legal-resources/court-rules/",
      "https://courtecowas.org/structure-of-court/the-registry/",
    ],
  });

export const NIGERIAN_INTERNATIONAL_ESCALATION_AUTHORITIES =
  Object.freeze([
    FMOJ_FINAL_DOMESTIC_ESCALATION,
    NHRC_FINAL_DOMESTIC_ESCALATION,
    US_TLHRC_HUMAN_RIGHTS_ADVOCACY,
    UK_FOREIGN_AFFAIRS_COMMITTEE_ADVOCACY,
    UK_FCDO_POLICY_CORRESPONDENCE,
    EU_DROI_HUMAN_RIGHTS_ADVOCACY,
    EU_DELEGATION_NIGERIA_HUMAN_RIGHTS,
    CANADA_GLOBAL_AFFAIRS_ADVOCACY,
    ICC_OTP_ARTICLE_15_SUBMISSIONS,
    OHCHR_SPECIAL_PROCEDURES,
    OHCHR_TREATY_BODY_COMPLAINTS,
    ACHPR_NON_STATE_COMMUNICATIONS,
    ECOWAS_COURT_FORMAL_APPLICATION,
  ]);

export const INTERNATIONAL_ESCALATION_PRIORITY =
  Object.freeze([
    "united_states",
    "united_kingdom",
    "european_union",
    "international_criminal_court",
    "canada",
    "united_nations",
    "african_union",
    "ecowas",
  ]);

const GENERIC_INTERNATIONAL_KEYWORDS = [
  "international escalation",
  "international human rights complaint",
  "international advocacy",
  "international legal remedy",
  "diplomatic escalation",
  "legislative advocacy",
  "foreign policy advocacy",
  "European Union",
  "EU",
  "EU Parliament",
  "European Parliament",
  "exhausted domestic remedies",
  "domestic remedies exhausted",
  "domestic remedies unavailable",
  "domestic remedies ineffective",
  "domestic remedies unduly prolonged",
  "final domestic decision",
  "systematic human rights violation",
  "gross human rights violation",
  "arbitrary detention",
  "political detention",
  "enforced disappearance",
  "forced disappearance",
  "extrajudicial killing",
  "torture allegation",
  "religious persecution",
  "ethnic persecution",
  "attack on journalists",
  "media repression",
  "suppression of protesters",
  "ongoing human rights violation",
  "urgent appeal",
  "risk of recurrence",
  "continuing detention",
  "continuing disappearance",
  "war crime",
  "war crimes",
  "crime against humanity",
  "crimes against humanity",
  "genocide",
  "crime of aggression",
  "widespread or systematic attack against civilians",
  "Rome Statute crime",
  "Article 15 communication",
  "UN individual complaint",
  "UN treaty body complaint",
  "African Charter complaint",
  "ECOWAS human rights case",
];

export const NIGERIAN_INTERNATIONAL_ESCALATION_DETECTION_KEYWORDS =
  Object.freeze([
    ...new Set([
      ...GENERIC_INTERNATIONAL_KEYWORDS,

      ...NIGERIAN_INTERNATIONAL_ESCALATION_AUTHORITIES
        .flatMap(
          authority => [
            authority.name,
            ...authority.aliases,
          ]
        ),
    ]),
  ]);

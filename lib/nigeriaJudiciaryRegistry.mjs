/*
 * PetitionDesk nationwide Nigerian judiciary registry.
 *
 * Safety rules:
 * - judicial discipline cannot replace an appeal;
 * - NJC complaints follow the official signed complaint
 *   and verifying-affidavit procedure;
 * - registry and court-administration complaints go first
 *   to the responsible court or Chief Registrar;
 * - rights violations route to NHRC;
 * - maladministration may include PCC;
 * - court and judicial emails are never guessed.
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
  physicalFilingRequired = false,
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

    portal_only:
      portalOnly,

    physical_filing_required:
      physicalFilingRequired,

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
        "official_identity_and_public_service_channel",

      direct_email_verified:
        emails.length > 0,

      source_urls:
        Object.freeze(sourceUrls),
    },
  });
}

export const NJC_JUDICIAL_DISCIPLINE =
  authority({
    key:
      "njc_judicial_discipline",

    name:
      "National Judicial Council (NJC)",

    aliases: [
      "NJC",
      "National Judicial Council",
      "Chairman of the National Judicial Council",
      "Chief Justice and Chairman of the NJC",
      "Office of the Secretary to the National Judicial Council",
      "NJC Complaint Registry",
    ],

    phoneNumbers: [
      "09-4603190",
    ],

    address:
      "Office of the Secretary to the National Judicial Council, Abuja, Nigeria",

    website:
      "https://njc.gov.ng/",

    channels: {
      discipline_regulations:
        "https://njc.gov.ng/discipline-regulations",

      discipline_regulations_legacy:
        "https://njc.gov.ng/index.php/judicial-discipline-regulation",

      filing_guidance:
        "Complaint must be signed, contain specific facts and a contact address, and be accompanied by a verifying affidavit. It must be filed at the Office of the Secretary to the Council, Office of the Chief Justice of Nigeria, or relevant Head of Court.",
    },

    portalOnly: true,
    physicalFilingRequired: true,

    sourceUrls: [
      "https://njc.gov.ng/discipline-regulations",
      "https://njc.gov.ng/index.php/judicial-discipline-regulation",
      "https://njc.gov.ng/index.php/faq",
    ],
  });

export const NHRC_JUSTICE_CHAIN_COMPLAINTS =
  authority({
    key:
      "nhrc_justice_chain_complaints",

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

    sourceUrls: [
      "https://www.nigeriarights.gov.ng/index.php/complaint-form",
      "https://www.nigeriarights.gov.ng/about/nhrc-mandate.html",
      "https://www.nigeriarights.gov.ng/contact-us.html",
    ],
  });

export const PCC_COURT_ADMINISTRATION_COMPLAINTS =
  authority({
    key:
      "pcc_court_administration_complaints",

    name:
      "Public Complaints Commission (PCC)",

    aliases: [
      "PCC",
      "Public Complaints Commission",
      "Nigeria Ombudsman",
      "Federal Ombudsman",
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
      contact_page:
        "https://pcc.gov.ng/contact-us/",

      complaint_procedure:
        "https://pcc.gov.ng/procedures-for-lodging-complaints/",
    },

    sourceUrls: [
      "https://pcc.gov.ng/contact-us/",
      "https://pcc.gov.ng/procedures-for-lodging-complaints/",
      "https://pcc.gov.ng/how-the-commission-functions/",
    ],
  });

export const SUPREME_COURT_ADMINISTRATION =
  authority({
    key:
      "supreme_court_administration",

    name:
      "Supreme Court of Nigeria",

    aliases: [
      "Supreme Court",
      "Supreme Court of Nigeria",
      "Apex Court",
      "Chief Registrar Supreme Court",
      "Supreme Court Registry",
      "Supreme Court Litigation Information Desk",
    ],

    emails: [
      "info@supremecourt.gov.ng",
      "litigation@supremecourt.gov.ng",
    ],

    phoneNumbers: [
      "+2347039983117",
    ],

    address:
      "Three Arms Zone, Abuja, Nigeria",

    website:
      "https://supremecourt.gov.ng/",

    channels: {
      contact_page:
        "https://supremecourt.gov.ng/contactus",

      litigation_information:
        "https://supremecourt.gov.ng/litigation-information-desk",
    },

    sourceUrls: [
      "https://supremecourt.gov.ng/contactus",
      "https://supremecourt.gov.ng/litigation-information-desk",
    ],
  });

export const COURT_OF_APPEAL_ADMINISTRATION =
  authority({
    key:
      "court_of_appeal_administration",

    name:
      "Court of Appeal of Nigeria – Relevant Division or Headquarters",

    aliases: [
      "Court of Appeal",
      "Court of Appeal of Nigeria",
      "Nigeria Court of Appeal",
      "COA",
      "Court of Appeal Registry",
      "Court of Appeal Division",
      "President Court of Appeal",
      "Chief Registrar Court of Appeal",
    ],

    address:
      "Three Arms Zone, Shehu Shagari Way, Central Business District, Abuja, Nigeria",

    website:
      "https://www.courtofappeal.gov.ng/",

    channels: {
      contact_form:
        "https://www.courtofappeal.gov.ng/contact",

      divisions_directory:
        "https://www.courtofappeal.gov.ng/contact",
    },

    portalOnly: true,
    countrySpecific: true,

    sourceUrls: [
      "https://www.courtofappeal.gov.ng/",
      "https://www.courtofappeal.gov.ng/contact",
    ],
  });

export const FEDERAL_HIGH_COURT_ADMINISTRATION =
  authority({
    key:
      "federal_high_court_administration",

    name:
      "Federal High Court of Nigeria – Relevant Judicial Division",

    aliases: [
      "Federal High Court",
      "Federal High Court of Nigeria",
      "FHC",
      "Federal High Court Registry",
      "Chief Registrar Federal High Court",
      "Federal High Court Judicial Division",
    ],

    emails: [
      "info@fhc.gov.ng",
    ],

    phoneNumbers: [
      "+2348074601579",
    ],

    address:
      "Shehu Shagari Expressway, Central Business District, Abuja, Nigeria",

    website:
      "https://fhc.gov.ng/",

    channels: {
      contact_page:
        "https://fhc.gov.ng/contact/",

      divisions_directory:
        "https://fhc.gov.ng/judicial-divisions/",
    },

    sourceUrls: [
      "https://fhc.gov.ng/contact/",
      "https://fhc.gov.ng/judicial-divisions/",
      "https://fhc.gov.ng/about-us/",
    ],
  });

export const NATIONAL_INDUSTRIAL_COURT_ADMINISTRATION =
  authority({
    key:
      "national_industrial_court_administration",

    name:
      "National Industrial Court of Nigeria – Relevant Division",

    aliases: [
      "National Industrial Court",
      "National Industrial Court of Nigeria",
      "NICN",
      "Industrial Court",
      "NICN Registry",
      "Chief Registrar National Industrial Court",
    ],

    emails: [
      "info@nicn.gov.ng",
    ],

    phoneNumbers: [
      "+2348143710567",
      "+2347013235494",
    ],

    address:
      "No. 1 Justice Adejumo Street, Area 3, Garki, Abuja, Nigeria",

    website:
      "https://www.nicn.gov.ng/",

    channels: {
      contact_page:
        "https://www.nicn.gov.ng/contact",

      divisions_directory:
        "https://www.nicn.gov.ng/divisions-registries",
    },

    sourceUrls: [
      "https://www.nicn.gov.ng/contact",
      "https://www.nicn.gov.ng/divisions-registries",
    ],
  });

export const FCT_HIGH_COURT_ADMINISTRATION =
  authority({
    key:
      "fct_high_court_administration",

    name:
      "High Court of the Federal Capital Territory, Abuja",

    aliases: [
      "FCT High Court",
      "High Court of the FCT",
      "High Court of the Federal Capital Territory",
      "Federal Capital Territory Judiciary",
      "FCT Judiciary",
      "Chief Registrar FCT High Court",
      "Chief Judge FCT",
    ],

    emails: [
      "info@fcthighcourt.gov.ng",
    ],

    phoneNumbers: [
      "+23492737084",
      "+2347084336622",
    ],

    address:
      "Plot 426, Tigris Crescent, Aguiyi Ironsi Street, Maitama, Abuja, Nigeria",

    website:
      "https://www.fcthighcourt.gov.ng/",

    channels: {
      contact_page:
        "https://www.fcthighcourt.gov.ng/113-2/",
    },

    sourceUrls: [
      "https://www.fcthighcourt.gov.ng/113-2/",
    ],
  });

export const LPDC_LEGAL_PRACTITIONER_DISCIPLINE =
  authority({
    key:
      "lpdc_legal_practitioner_discipline",

    name:
      "Legal Practitioners Disciplinary Committee (LPDC), Body of Benchers",

    aliases: [
      "LPDC",
      "Legal Practitioners Disciplinary Committee",
      "Body of Benchers",
      "BOB",
      "Chairman Body of Benchers",
      "Lawyer Discipline",
      "Legal Practitioner Discipline",
    ],

    phoneNumbers: [
      "+2349161270000",
      "09064083585",
    ],

    address:
      "Body of Benchers Secretariat, Plot 688, Institute and Research District, FCC Phase III, Abuja, Nigeria",

    website:
      "https://new.bob.gov.ng/",

    channels: {
      contact_page:
        "https://new.bob.gov.ng/contact-2/",

      filing_guidance:
        "Use the prescribed written disciplinary process and submit through an authorised recipient or directly through the LPDC or Body of Benchers Secretariat.",
    },

    portalOnly: true,
    physicalFilingRequired: true,

    sourceUrls: [
      "https://new.bob.gov.ng/contact-2/",
    ],
  });

export const RELEVANT_STATE_JUDICIARY =
  authority({
    key:
      "relevant_state_judiciary",

    name:
      "The Relevant State Judiciary, Head of Court or Chief Registrar",

    aliases: [
      "State High Court",
      "State Judiciary",
      "State Court",
      "Chief Judge",
      "State Chief Judge",
      "Chief Registrar",
      "Court Registrar",
      "High Court Registry",
      "Sharia Court of Appeal",
      "Customary Court of Appeal",
      "Judicial Service Commission",
    ],

    website:
      "https://njc.gov.ng/",

    channels: {
      official_route:
        "Use the responsible State Judiciary's verified official website, physical registry or Head of Court. Do not guess a State court email address.",

      discipline_guidance:
        "https://njc.gov.ng/discipline-regulations",
    },

    portalOnly: true,
    countrySpecific: true,

    sourceUrls: [
      "https://njc.gov.ng/discipline-regulations",
      "https://njc.gov.ng/",
    ],
  });

export const NIGERIAN_JUDICIARY_AUTHORITIES =
  Object.freeze([
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
  ]);

const GENERIC_JUDICIARY_KEYWORDS = [
  "judiciary complaint",
  "court complaint",
  "court administration complaint",
  "court registry complaint",
  "judicial misconduct",
  "judge misconduct",
  "judge demanded bribe",
  "judicial bribery",
  "judge bribery",
  "judge compromised",
  "bias allegation",
  "judicial conflict of interest",
  "improper ex parte communication",
  "sexual harassment by judge",
  "court registry delay",
  "registry delay",
  "registry refusal",
  "registry extortion",
  "court staff misconduct",
  "missing case file",
  "lost case file",
  "case file missing",
  "record of appeal delay",
  "record not compiled",
  "appeal record not compiled",
  "certified true copy delay",
  "CTC delay",
  "hearing notice not issued",
  "court process not served",
  "sheriff delay",
  "bail bond processing delay",
  "judgment not delivered",
  "reserved judgment delayed",
  "ruling delayed",
  "reserved ruling",
  "endless adjournment",
  "frequent adjournments",
  "court not sitting",
  "trial delay",
  "undue judicial delay",
  "justice delayed",
  "unlawful detention",
  "remand without trial",
  "denial of bail",
  "fair hearing denied",
  "access to lawyer denied",
  "police ignored court order",
  "disobedience of court order",
  "refusal to obey court order",
  "judgment enforcement delay",
  "writ of execution delay",
  "garnishee proceedings delay",
  "lawyer misconduct",
  "legal practitioner misconduct",
  "lawyer withheld client money",
  "lawyer misappropriated funds",
  "lawyer abandoned case",
  "lawyer forged court document",
  "fake court order",
  "altered court record",
  "appeal the judgment",
  "appeal the ruling",
  "overturn the judgment",
  "reverse the judgment",
  "set aside the judgment",
];

export const NIGERIAN_JUDICIARY_DETECTION_KEYWORDS =
  Object.freeze([
    ...new Set([
      ...GENERIC_JUDICIARY_KEYWORDS,

      ...NIGERIAN_JUDICIARY_AUTHORITIES
        .flatMap(
          authority => [
            authority.name,
            ...authority.aliases,
          ]
        ),
    ]),
  ]);

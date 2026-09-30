/*
 * PetitionDesk nationwide Nigerian anti-corruption registry.
 *
 * Routing principles:
 * - EFCC: fraud, economic crime, money laundering and diversion;
 * - ICPC: bribery, abuse of office and public-sector corruption;
 * - CCB: asset declaration, conflict of interest and conduct breaches;
 * - BPP: procurement-process complaints and petitions;
 * - never expose an unverified contact;
 * - never send every allegation to every agency.
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
      status:
        "VERIFIED_OFFICIAL_SOURCE",

      verified_on:
        VERIFIED_ON,

      scope:
        "identity_and_official_petition_channel",

      direct_email_verified:
        emails.length > 0,

      source_urls:
        Object.freeze(sourceUrls),
    },
  });
}

export const EFCC_FINANCIAL_CRIME_REPORTING =
  authority({
    key:
      "efcc_financial_crime_reporting",

    name:
      "Economic and Financial Crimes Commission (EFCC)",

    aliases: [
      "EFCC",
      "Economic and Financial Crimes Commission",
      "Economic and Financial Crime Commission",
      "EFCC Nigeria",
      "EFCC Eagle Eye",
    ],

    emails: [
      "info@efcc.gov.ng",
    ],

    address:
      "Plot 301/302, Institution and Research Cadastral District, Jabi, Abuja, Nigeria",

    website:
      "https://efcc.gov.ng/",

    channels: {
      eagle_eye_report:
        "https://www.eagleeye.efcc.gov.ng/reportForm.html",
    },

    sourceUrls: [
      "https://efcc.gov.ng/",
      "https://www.eagleeye.efcc.gov.ng/reportForm.html",
    ],
  });

export const ICPC_CORRUPTION_PETITIONS =
  authority({
    key:
      "icpc_corruption_petition",

    name:
      "Independent Corrupt Practices and Other Related Offences Commission (ICPC)",

    aliases: [
      "ICPC",
      "Independent Corrupt Practices Commission",
      "Independent Corrupt Practices and Other Related Offences Commission",
      "ICPC Nigeria",
    ],

    emails: [
      "info@icpc.gov.ng",
    ],

    address:
      "Plot 802 Constitution Avenue, Zone A9, Central Business District, Abuja, Nigeria",

    website:
      "https://icpc.gov.ng/",

    channels: {
      petition_form:
        "https://icpc.gov.ng/petition/",

      petition_guidelines:
        "https://icpc.gov.ng/petition-guidelines/",
    },

    sourceUrls: [
      "https://icpc.gov.ng/petition/",
      "https://icpc.gov.ng/petition-guidelines/",
    ],
  });

export const CCB_CODE_OF_CONDUCT_PETITIONS =
  authority({
    key:
      "ccb_code_of_conduct_petition",

    name:
      "Code of Conduct Bureau (CCB)",

    aliases: [
      "CCB",
      "Code of Conduct Bureau",
      "Code of Conduct Bureau Nigeria",
      "CCB Nigeria",
      "asset declaration bureau",
    ],

    emails: [
      "info@ccb.gov.ng",
    ],

    address:
      "5th Floor, Federal Secretariat Complex Annex III, Shehu Shagari Way, Maitama, Abuja, Nigeria",

    website:
      "https://ccb.gov.ng/",

    channels: {
      petition_guidelines:
        "https://ccb.gov.ng/?page_id=381",
    },

    sourceUrls: [
      "https://ccb.gov.ng/",
      "https://ccb.gov.ng/?page_id=381",
      "https://ccb.gov.ng/?page_id=474",
    ],
  });

export const BPP_PROCUREMENT_PETITIONS =
  authority({
    key:
      "bpp_procurement_petition",

    name:
      "Bureau of Public Procurement (BPP)",

    aliases: [
      "BPP",
      "Bureau of Public Procurement",
      "Due Process Office",
      "BPP Nigeria",
      "public procurement bureau",
    ],

    emails: [
      "info@bpp.gov.ng",
    ],

    website:
      "https://bpp.gov.ng/",

    channels: {
      petition_portal:
        "https://bpp.gov.ng/petitions/",
    },

    sourceUrls: [
      "https://bpp.gov.ng/",
      "https://bpp.gov.ng/petitions/",
    ],
  });

export const NIGERIAN_ANTI_CORRUPTION_AUTHORITIES =
  Object.freeze([
    EFCC_FINANCIAL_CRIME_REPORTING,
    ICPC_CORRUPTION_PETITIONS,
    CCB_CODE_OF_CONDUCT_PETITIONS,
    BPP_PROCUREMENT_PETITIONS,
  ]);

const GENERIC_ANTI_CORRUPTION_KEYWORDS = [
  "corruption",
  "corrupt practice",
  "financial crime",
  "economic crime",
  "fraud",
  "public fund fraud",
  "bribe",
  "bribery",
  "kickback",
  "gratification",
  "extortion",
  "abuse of office",
  "abuse of power",
  "official misconduct",
  "diversion of funds",
  "diversion of public funds",
  "embezzlement",
  "misappropriation",
  "money laundering",
  "proceeds of crime",
  "suspicious transfer",
  "fraudulent transfer",
  "ghost worker",
  "ghost workers",
  "payroll fraud",
  "pension fraud",
  "contract fraud",
  "procurement fraud",
  "contract inflation",
  "inflated contract",
  "over invoicing",
  "over-invoicing",
  "bid rigging",
  "contract splitting",
  "double payment",
  "project abandonment",
  "fake contractor",
  "shell company",
  "forged payment document",
  "conflict of interest",
  "asset declaration",
  "false asset declaration",
  "undeclared assets",
  "code of conduct breach",
  "nepotism",
  "favouritism",
  "favoritism",
  "whistleblower",
  "whistleblower retaliation",
  "audit query",
  "public procurement",
  "tender fraud",
  "tender manipulation",
  "certificate of no objection",
];

export const NIGERIAN_ANTI_CORRUPTION_DETECTION_KEYWORDS =
  Object.freeze([
    ...new Set([
      ...GENERIC_ANTI_CORRUPTION_KEYWORDS,

      ...NIGERIAN_ANTI_CORRUPTION_AUTHORITIES
        .flatMap(
          authority => [
            authority.name,
            ...authority.aliases,
          ]
        ),
    ]),
  ]);

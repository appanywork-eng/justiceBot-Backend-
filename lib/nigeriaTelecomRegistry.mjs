/*
 * PetitionDesk nationwide Nigerian
 * telecommunications registry.
 *
 * Only official operator and NCC sources
 * may expose direct complaint channels.
 */

export const NCC_TELECOM_ESCALATION =
  Object.freeze({
    key:
      "ncc",

    name:
      "Nigerian Communications Commission (NCC)",

    aliases: [
      "NCC",
      "Nigerian Communications Commission",
      "NCC Consumer Affairs Bureau",
      "NCC Consumer Protection",
    ],

    contact: {
      emails: [],

      phones: [
        "622",
        "+2342094617000",
      ],

      address:
        "Plot 423, Aguiyi Ironsi Street, Maitama District, Abuja 900271, Federal Capital Territory, Nigeria",

      website:
        "https://www.ncc.gov.ng/",

      complaint_portal:
        "https://consumer.ncc.gov.ng/consumer-complaints/complaint-form",

      complaint_management_system:
        "https://ncc-ccms.ncc.gov.ng/login",
    },

    verification: {
      status:
        "VERIFIED_OFFICIAL_SOURCE",

      verified_on:
        "2026-08-01",

      source_urls: [
        "https://www.ncc.gov.ng/contactncc",
        "https://consumer.ncc.gov.ng/consumer-complaints/complaint-form",
        "https://ncc-ccms.ncc.gov.ng/login",
      ],
    },
  });

export const NIGERIAN_TELECOM_PROVIDERS =
  Object.freeze([
    {
      key:
        "mtn",

      name:
        "MTN Nigeria Communications Plc",

      testInput:
        "MTN",

      aliases: [
        "MTN",
        "MTN Nigeria",
        "MTNNG",
        "MTN NG",
        "MTN Nigeria Communications",
        "MTN Nigeria Communications Plc",
      ],

      contact: {
        emails: [
          "customercare.ng@mtn.com",
        ],

        phones: [
          "300",
          "08031000300",
        ],

        address:
          "MTN Plaza, No. 1 Awolowo Road, Falomo, Ikoyi, Lagos State, Nigeria",

        website:
          "https://www.mtn.ng/contact/",

        complaint_portal:
          "https://www.mtn.ng/contact/",
      },

      verification: {
        status:
          "VERIFIED_OFFICIAL_SOURCE",

        verified_on:
          "2026-08-01",

        source_urls: [
          "https://www.mtn.ng/contact/",
          "https://www.mtn.ng/ncc-code-of-conduct/",
        ],
      },
    },

    {
      key:
        "glo",

      name:
        "Globacom Limited (Glo)",

      testInput:
        "Glo",

      aliases: [
        "Glo",
        "Globacom",
        "Globacom Nigeria",
        "Glo Nigeria",
        "Globacom Limited",
      ],

      contact: {
        emails: [
          "customercare@gloworld.com",
        ],

        phones: [
          "300",
          "+2348050020121",
          "+2348050020200",
        ],

        address:
          "Mike Adenuga Towers, 1 Mike Adenuga Close, Off Adeola Odeku Street, Victoria Island, Lagos State, Nigeria",

        website:
          "https://www.gloworld.com/ng/contact-us",

        complaint_portal:
          "https://www.gloworld.com/ng/contact-us",
      },

      verification: {
        status:
          "VERIFIED_OFFICIAL_SOURCE",

        verified_on:
          "2026-08-01",

        source_urls: [
          "https://www.gloworld.com/ng/contact-us",
          "https://www.gloworld.com/ng/support/",
        ],
      },
    },

    {
      key:
        "airtel",

      name:
        "Airtel Networks Limited (Airtel Nigeria)",

      testInput:
        "Airtel",

      aliases: [
        "Airtel",
        "Airtel Nigeria",
        "Airtel NG",
        "Airtel Networks",
        "Airtel Networks Limited",
      ],

      contact: {
        emails: [
          "customercare@ng.airtel.com",
        ],

        phones: [
          "300",
          "+2348021500300",
          "+2348021520800",
        ],

        address:
          "Plot L2, Banana Island, Foreshore Estate, Ikoyi, Lagos State, Nigeria",

        website:
          "https://www.airtel.com.ng/ng/about/contact-us",

        complaint_portal:
          "https://www.airtel.com.ng/ng/about/contact-us",
      },

      verification: {
        status:
          "VERIFIED_OFFICIAL_SOURCE",

        verified_on:
          "2026-08-01",

        source_urls: [
          "https://www.airtel.com.ng/contact-us",
          "https://www.airtel.com.ng/ng/about/contact-us",
        ],
      },
    },

    {
      key:
        "t2mobile",

      name:
        "Emerging Markets Telecommunication Services Limited (T2mobile)",

      testInput:
        "9mobile",

      aliases: [
        "T2",
        "T2 Mobile",
        "T2mobile",
        "T2mobile Nigeria",
        "9mobile",
        "9 mobile",
        "9mobile Nigeria",
        "Etisalat Nigeria",
        "EMTS",
        "Emerging Markets Telecommunication Services",
        "Emerging Markets Telecommunication Services Limited",
      ],

      contact: {
        emails: [
          "care@t2mobile.com.ng",
        ],

        phones: [
          "300",
          "08090000300",
        ],

        whatsapp: [
          "09092000192",
          "09092000198",
        ],

        address:
          "Plot 19, Zone L, Federal Government Layout, Banana Island, Ikoyi, Lagos State, Nigeria",

        website:
          "https://www.t2mobile.com.ng/",

        complaint_portal:
          "https://www.t2mobile.com.ng/faq",
      },

      verification: {
        status:
          "VERIFIED_OFFICIAL_SOURCE",

        verified_on:
          "2026-08-01",

        source_urls: [
          "https://www.t2mobile.com.ng/",
          "https://www.t2mobile.com.ng/individual-code-of-practice",
          "https://www.t2mobile.com.ng/about/corporate-profile",
        ],
      },
    },
  ]);

const GENERIC_TELECOM_KEYWORDS = [
  "telecom",
  "telecommunications",
  "mobile network",
  "mobile operator",
  "network provider",
  "sim",
  "sim card",
  "sim block",
  "blocked sim",
  "barred line",
  "line barred",
  "nin sim",
  "nin linkage",
  "network outage",
  "network failure",
  "poor network",
  "poor coverage",
  "call drop",
  "dropped calls",
  "airtime",
  "airtime deduction",
  "data",
  "data depletion",
  "data deduction",
  "unauthorised subscription",
  "unauthorized subscription",
  "value added service",
  "vas subscription",
  "spam sms",
  "harassment calls",
  "sim swap",
  "sim swap fraud",
  "porting delay",
  "mobile number portability",
  "msisdn",
  "ncc",
];

export const NIGERIAN_TELECOM_DETECTION_KEYWORDS =
  Object.freeze(
    [
      ...new Set([
        ...GENERIC_TELECOM_KEYWORDS,

        NCC_TELECOM_ESCALATION.name,

        ...NCC_TELECOM_ESCALATION
          .aliases,

        ...NIGERIAN_TELECOM_PROVIDERS
          .flatMap(
            provider => [
              provider.name,
              ...provider.aliases,
            ]
          ),
      ].map(
        value =>
          String(value)
            .trim()
            .toLowerCase()
      )),
    ]
  );

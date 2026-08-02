/*
 * PetitionDesk nationwide Nigerian
 * aviation complaint registry.
 *
 * Ordinary consumer complaints:
 * service provider first, NCAA second.
 *
 * Accidents and serious incidents:
 * immediate NSIB reporting.
 */

export const NCAA_AVIATION_ESCALATION =
  Object.freeze({
    key:
      "ncaa",

    name:
      "Nigerian Civil Aviation Authority (NCAA)",

    aliases: [
      "NCAA",
      "Nigerian Civil Aviation Authority",
      "NCAA Consumer Protection",
      "NCAA Consumer Protection Department",
      "Director Consumer Protection NCAA",
    ],

    contact: {
      emails: [
        "cpd@ncaa.gov.ng",
      ],

      phones: [
        "+2349162011222",
      ],

      address:
        "Nnamdi Azikiwe International Airport, Federal Capital Territory, Abuja, Nigeria",

      website:
        "https://ncaa.gov.ng/",

      complaint_portal:
        "https://cpd.ncaa.gov.ng/",

      complaint_form:
        "https://ncaa.gov.ng/report-forms/complaint-form/",
    },

    verification: {
      status:
        "VERIFIED_OFFICIAL_SOURCE",

      verified_on:
        "2026-08-02",

      source_urls: [
        "https://ncaa.gov.ng/report-forms/complaint-form/",
        "https://cpd.ncaa.gov.ng/",
        "https://ncaa.gov.ng/contact/",
      ],
    },
  });

export const NSIB_AVIATION_SAFETY =
  Object.freeze({
    key:
      "nsib",

    name:
      "Nigerian Safety Investigation Bureau (NSIB)",

    aliases: [
      "NSIB",
      "Nigerian Safety Investigation Bureau",
      "Accident Investigation Bureau",
      "AIB Nigeria",
      "aviation accident investigation",
    ],

    contact: {
      emails: [
        "info@nsib.gov.ng",
      ],

      emergency_phones: [
        "+2348077090908",
        "+2348077090909",
      ],

      address:
        "Nnamdi Azikiwe International Airport, Abuja, Nigeria",

      website:
        "https://nsib.gov.ng/",

      reporting_portal:
        "https://nsib.gov.ng/reporting",

      reporting_guidelines:
        "https://nsib.gov.ng/reporting-guidelines",
    },

    verification: {
      status:
        "VERIFIED_OFFICIAL_SOURCE",

      verified_on:
        "2026-08-02",

      source_urls: [
        "https://nsib.gov.ng/reporting",
        "https://nsib.gov.ng/reporting-guidelines",
        "https://nsib.gov.ng/contact-us",
      ],
    },
  });

export const NIGERIAN_AVIATION_PROVIDERS =
  Object.freeze([
    {
      key:
        "air_peace",

      name:
        "Air Peace Limited",

      testInput:
        "Air Peace",

      aliases: [
        "Air Peace",
        "Air Peace Airline",
        "Air Peace Airlines",
        "Fly Air Peace",
      ],

      contact: {
        emails: [
          "callcenter@flyairpeace.com",
        ],

        phones: [
          "+2342013438133",
          "+23470035924773223",
        ],

        address:
          "25 Sobo Arobiodu Street, GRA, Ikeja, Lagos State, Nigeria",

        website:
          "https://flyairpeace.com/",

        complaint_portal:
          "https://flyairpeace.com/help-and-contact/",
      },

      verification: {
        status:
          "VERIFIED_OFFICIAL_SOURCE",

        verified_on:
          "2026-08-02",

        source_urls: [
          "https://flyairpeace.com/help-and-contact/",
        ],
      },
    },

    {
      key:
        "arik",

      name:
        "Arik Air Limited",

      testInput:
        "Arik Air",

      aliases: [
        "Arik",
        "Arik Air",
        "Fly Arik",
      ],

      contact: {
        emails: [
          "callcentre@arikair.com",
        ],

        phones: [
          "0700003592745",
          "+2342018891728",
        ],

        address:
          "Arik Aviation Centre, Murtala Muhammed Airport Domestic Wing, Ikeja, Lagos State, Nigeria",

        website:
          "https://www.arikair.com/",

        complaint_portal:
          "https://www.arikair.com/",
      },

      verification: {
        status:
          "VERIFIED_OFFICIAL_SOURCE",

        verified_on:
          "2026-08-02",

        source_urls: [
          "https://www.arikair.com/",
        ],
      },
    },

    {
      key:
        "ibom_air",

      name:
        "Ibom Airlines Limited (Ibom Air)",

      testInput:
        "Ibom Air",

      aliases: [
        "Ibom Air",
        "IbomAir",
        "Ibom Airlines",
        "Ibom Airlines Limited",
      ],

      contact: {
        emails: [
          "info@ibomair.com",
          "reservations@ibomair.com",
        ],

        phones: [
          "+234700123594266",
        ],

        address:
          "Victor Attah International Airport, Uyo, Akwa Ibom State, Nigeria",

        website:
          "https://www.ibomair.com/",

        complaint_portal:
          "https://www.ibomair.com/contact-us/",
      },

      verification: {
        status:
          "VERIFIED_OFFICIAL_SOURCE",

        verified_on:
          "2026-08-02",

        source_urls: [
          "https://www.ibomair.com/contact-us/",
        ],
      },
    },

    {
      key:
        "aero_contractors",

      name:
        "Aero Contractors Company of Nigeria Limited",

      testInput:
        "Aero Contractors",

      aliases: [
        "Aero",
        "Aero Contractors",
        "Aero Contractors Nigeria",
        "ACN Aero",
        "Fly Aero",
      ],

      contact: {
        emails: [
          "ticket-helpdesk@acn.aero",
          "frontdesk@acn.aero",
        ],

        phones: [
          "+2342013302937",
          "+2347001342376",
        ],

        address:
          "Private Terminal, Murtala Muhammed Airport, PMB 21090, Ikeja, Lagos State, Nigeria",

        website:
          "https://flyaero.com/",

        complaint_portal:
          "https://flyaero.com/support/",
      },

      verification: {
        status:
          "VERIFIED_OFFICIAL_SOURCE",

        verified_on:
          "2026-08-02",

        source_urls: [
          "https://flyaero.com/support/",
          "https://flyaero.com/",
        ],
      },
    },

    {
      key:
        "united_nigeria",

      name:
        "United Nigeria Airlines Company Limited",

      testInput:
        "United Nigeria Airlines",

      aliases: [
        "United Nigeria",
        "United Nigeria Airlines",
        "UNA",
        "Fly United Nigeria",
      ],

      contact: {
        emails: [
          "customerservice@flyunitednigeria.com",
        ],

        phones: [
          "02016402255",
          "07001032255",
          "09131048525",
        ],

        address:
          "Plot C2A Garden Avenue, GRA, Enugu, Enugu State, Nigeria",

        website:
          "https://flyunitednigeria.com/",

        complaint_portal:
          "https://flyunitednigeria.com/contact-us/",
      },

      verification: {
        status:
          "VERIFIED_OFFICIAL_SOURCE",

        verified_on:
          "2026-08-02",

        source_urls: [
          "https://flyunitednigeria.com/contact-us/",
        ],
      },
    },

    {
      key:
        "green_africa",

      name:
        "Green Africa Airways Limited",

      testInput:
        "Green Africa",

      aliases: [
        "Green Africa",
        "Green Africa Airways",
        "Green Africa Airline",
        "GAA",
        "gCare",
      ],

      contact: {
        emails: [
          "gcare@greenafrica.com",
        ],

        phones: [
          "070047336237422",
          "02018883055",
        ],

        website:
          "https://www.greenafrica.com/",

        complaint_portal:
          "https://web.greenafrica.com/contact",
      },

      verification: {
        status:
          "VERIFIED_OFFICIAL_SOURCE",

        verified_on:
          "2026-08-02",

        source_urls: [
          "https://web.greenafrica.com/contact",
          "https://www.greenafrica.com/support/terms-and-conditions",
        ],
      },
    },

    {
      key:
        "max_air",

      name:
        "Max Air Limited",

      testInput:
        "Max Air",

      aliases: [
        "Max Air",
        "MaxAir",
        "Max Air Nigeria",
      ],

      contact: {
        emails: [
          "cs@maxair.com.ng",
          "reservation@maxair.com.ng",
        ],

        phones: [
          "09090092207",
          "09110604036",
          "07070210000",
        ],

        address:
          "16 Ashton Road, Kano, Kano State, Nigeria",

        website:
          "https://maxair.com.ng/",

        complaint_portal:
          "https://maxair.com.ng/contact-us",
      },

      verification: {
        status:
          "VERIFIED_OFFICIAL_SOURCE",

        verified_on:
          "2026-08-02",

        source_urls: [
          "https://maxair.com.ng/contact-us",
        ],
      },
    },

    {
      key:
        "rano_air",

      name:
        "Rano Air Limited",

      testInput:
        "Rano Air",

      aliases: [
        "Rano",
        "Rano Air",
        "Rano Airline",
      ],

      contact: {
        emails: [
          "customercare@ranoair.com",
        ],

        phones: [
          "09169844058",
          "09169844061",
          "09168340356",
        ],

        address:
          "Plot 1497, Cadastral Zone B06, Mabushi District, Abuja, Federal Capital Territory, Nigeria",

        website:
          "https://ranoair.com/",

        complaint_portal:
          "https://ranoair.com/",
      },

      verification: {
        status:
          "VERIFIED_OFFICIAL_SOURCE",

        verified_on:
          "2026-08-02",

        source_urls: [
          "https://ranoair.com/",
          "https://ranoair.com/terms-condition/",
        ],
      },
    },

    {
      key:
        "valuejet",

      name:
        "FlyForValue Aviation Limited (ValueJet)",

      testInput:
        "ValueJet",

      aliases: [
        "ValueJet",
        "Value Jet",
        "Fly ValueJet",
        "FlyForValue",
        "FlyForValue Aviation",
      ],

      contact: {
        emails: [
          "contactcenter@flyvaluejet.com",
        ],

        phones: [
          "02014600710",
          "+2349125950403",
          "+2349153823424",
          "+2347047108136",
        ],

        address:
          "31 Ladoke Akintola Street, Ikeja GRA, Lagos State, Nigeria",

        website:
          "https://www.flyvaluejet.com/",

        complaint_portal:
          "https://www.flyvaluejet.com/",
      },

      verification: {
        status:
          "VERIFIED_OFFICIAL_SOURCE",

        verified_on:
          "2026-08-02",

        source_urls: [
          "https://www.flyvaluejet.com/",
        ],
      },
    },

    {
      key:
        "overland",

      name:
        "Overland Airways Limited",

      testInput:
        "Overland Airways",

      aliases: [
        "Overland",
        "Overland Airways",
        "Overland Airline",
      ],

      contact: {
        emails: [
          "fly@overlandairways.com",
        ],

        phones: [
          "+2348035355005",
          "+2348035355006",
          "+2348035355100",
        ],

        address:
          "17 Simbiat Abiola Road, Ikeja, Lagos State, Nigeria",

        website:
          "https://www.overlandairways.com/",

        complaint_portal:
          "https://www.overlandairways.com/Contact-information/CallCentre",
      },

      verification: {
        status:
          "VERIFIED_OFFICIAL_SOURCE",

        verified_on:
          "2026-08-02",

        source_urls: [
          "https://www.overlandairways.com/Contact-information/CallCentre",
          "https://overlandairways.com/Travel-Information/Privacy-Policy",
        ],
      },
    },
  ]);

const GENERIC_AVIATION_KEYWORDS = [
  "aviation",
  "airline",
  "air carrier",
  "flight",
  "airport",
  "air ticket",
  "flight ticket",
  "boarding pass",
  "booking reference",
  "pnr",
  "flight delay",
  "delayed flight",
  "flight cancellation",
  "cancelled flight",
  "canceled flight",
  "flight disruption",
  "denied boarding",
  "overbooking",
  "refund",
  "airline refund",
  "ticket refund",
  "missing baggage",
  "lost baggage",
  "delayed baggage",
  "damaged baggage",
  "baggage tag",
  "airport service",
  "ground handling",
  "passenger complaint",
  "missed connection",
  "schedule change",
  "ncaa",
  "nsib",
  "aircraft accident",
  "aircraft incident",
  "runway excursion",
  "emergency landing",
  "aircraft fire",
];

export const NIGERIAN_AVIATION_DETECTION_KEYWORDS =
  Object.freeze(
    [
      ...new Set([
        ...GENERIC_AVIATION_KEYWORDS,

        NCAA_AVIATION_ESCALATION.name,
        ...NCAA_AVIATION_ESCALATION.aliases,

        NSIB_AVIATION_SAFETY.name,
        ...NSIB_AVIATION_SAFETY.aliases,

        ...NIGERIAN_AVIATION_PROVIDERS.flatMap(
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

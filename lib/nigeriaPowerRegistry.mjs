/*
 * PetitionDesk nationwide Nigerian electricity registry.
 *
 * Routing names and aliases for all eleven Nigerian
 * electricity distribution companies are maintained here.
 */

export const NIGERIAN_POWER_PROVIDERS = [
  {
    key: "aedc",
    name:
      "Abuja Electricity Distribution Plc (AEDC)",
    testInput: "AFEDC",
    aliases: [
      "AEDC",
      "AFEDC",
      "Abuja Electricity",
      "Abuja Electric",
      "Abuja Electricity Distribution Company",
      "Abuja Electricity Distribution Plc",
      "Abuja DisCo",
    ],
  },

  {
    key: "ekedc",
    name:
      "Eko Electricity Distribution Company (EKEDC)",
    testInput: "Eko Disco",
    aliases: [
      "EKEDC",
      "EKEDP",
      "Eko Electricity",
      "Eko Electric",
      "Eko Electricity Distribution Company",
      "Eko Electricity Distribution Plc",
      "Eko DisCo",
    ],
  },

  {
    key: "ikeja",
    name:
      "Ikeja Electric Plc (IE)",
    testInput: "Ikeja Electric",
    aliases: [
      "Ikeja Electric",
      "Ikeja Electricity",
      "Ikeja Electricity Distribution Company",
      "Ikeja Electricity Distribution Plc",
      "IKEDC",
      "Ikeja DisCo",
      "IE",
    ],
  },

  {
    key: "bedc",
    name:
      "BEDC Electricity Plc (BEDC)",
    testInput:
      "Edo Electricity Distribution Company",
    aliases: [
      "BEDC",
      "BEDC Electricity",
      "Benin Electricity",
      "Benin Electric",
      "Benin Electricity Distribution Company",
      "Benin Electricity Distribution Plc",
      "Edo Electricity",
      "Edo Electricity Distribution Company",
      "Edo DisCo",
      "Benin DisCo",
    ],
  },

  {
    key: "ibedc",
    name:
      "Ibadan Electricity Distribution Company Plc (IBEDC)",
    testInput: "IBEDC",
    aliases: [
      "IBEDC",
      "Ibadan Electricity",
      "Ibadan Electric",
      "Ibadan Electricity Distribution Company",
      "Ibadan Electricity Distribution Company Plc",
      "Ibadan DisCo",
    ],
  },

  {
    key: "jed",
    name:
      "Jos Electricity Distribution Plc (JED Plc)",
    testInput: "JEDC",
    aliases: [
      "JED",
      "JEDC",
      "JED Plc",
      "Jos Electricity",
      "Jos Electric",
      "Jos Electricity Distribution Company",
      "Jos Electricity Distribution Plc",
      "Jos DisCo",
    ],
  },

  {
    key: "kaduna",
    name: "Kaduna Electric",
    testInput: "KAEDCO",
    aliases: [
      "Kaduna Electric",
      "Kaduna Electricity",
      "Kaduna Electricity Distribution Company",
      "Kaduna Electricity Distribution Plc",
      "KAEDCO",
      "KDE",
      "Kaduna DisCo",
    ],
  },

  {
    key: "kedco",
    name:
      "Kano Electricity Distribution Company (KEDCO)",
    testInput: "KEDCO",
    aliases: [
      "KEDCO",
      "Kano Electricity",
      "Kano Electric",
      "Kano Electricity Distribution Company",
      "Kano Electricity Distribution Plc",
      "Kano DisCo",
    ],
  },

  {
    key: "yedc",
    name:
      "Yola Electricity Distribution Company (YEDC)",
    testInput: "YEDC",
    aliases: [
      "YEDC",
      "Yola Electricity",
      "Yola Electric",
      "Yola Electricity Distribution Company",
      "Yola DisCo",
    ],
  },

  {
    key: "eedc",
    name:
      "Enugu Electricity Distribution Company Plc (EEDC)",
    testInput: "EEDC",
    aliases: [
      "EEDC",
      "Enugu Electricity",
      "Enugu Electric",
      "Enugu Electricity Distribution Company",
      "Enugu Electricity Distribution Company Plc",
      "Enugu DisCo",
    ],
  },

  {
    key: "phed",
    name:
      "Port Harcourt Electricity Distribution Company (PHED)",
    testInput: "PHEDC",
    aliases: [
      "PHED",
      "PHEDC",
      "Port Harcourt Electricity",
      "Port Harcourt Electric",
      "Port Harcourt Electricity Distribution Company",
      "Port Harcourt Electricity Distribution Plc",
      "Port Harcourt DisCo",
    ],
  },
];

const GENERIC_POWER_TERMS = [
  "electricity",
  "electric power",
  "power supply",
  "nepa",
  "disco",
  "distribution company",
  "meter",
  "meter number",
  "prepaid meter",
  "postpaid meter",
  "electricity token",
  "prepaid token",
  "meter token",
  "token vending",
  "meter vending",
  "failed token",
  "missing token",
  "estimated billing",
  "overbilling",
  "transformer",
  "electricity bill",
  "power outage",
  "nerc",
  "tcn",
];

const POWER_REGISTRY_VERIFIED_ON =
  "2026-08-03";

const NERC_SERC_DIRECTORY_URL =
  "https://nerc.gov.ng/resources/sercs/";

function powerAuthority({
  key,
  name,
  aliases = [],
  emails = [],
  phoneNumbers = [],
  address = "",
  website = "",
  jurisdiction = "",
  scope = "",
  dynamicRoute = false,
  channels = {},
  sourceUrls = [],
}) {
  const verifiedSources = [
    ...new Set([
      ...sourceUrls,
      NERC_SERC_DIRECTORY_URL,
    ]),
  ];

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

    emailAvailable:
      emails.length > 0,

    dynamic_route:
      dynamicRoute,

    contact: Object.freeze({
      emails:
        Object.freeze(emails),

      phone_numbers:
        Object.freeze(
          phoneNumbers
        ),

      address,
      website,

      official_directory:
        NERC_SERC_DIRECTORY_URL,

      ...channels,
    }),

    verification: Object.freeze({
      status:
        "VERIFIED_OFFICIAL_SOURCE",

      verified_on:
        POWER_REGISTRY_VERIFIED_ON,

      direct_email_verified:
        emails.length > 0,

      dynamic_resolution_required:
        dynamicRoute,

      source_urls:
        Object.freeze(
          verifiedSources
        ),
    }),
  });
}

export const NERC_NATIONAL_COMPLAINTS =
  powerAuthority({
    key:
      "nerc_national",

    name:
      "Nigerian Electricity Regulatory Commission (NERC)",

    aliases: [
      "NERC",
      "Nigerian Electricity Regulatory Commission",
      "NERC Headquarters",
      "NERC HQ",
    ],

    emails: [
      "info@nerc.gov.ng",
    ],

    phoneNumbers: [
      "+23494621400",
      "+23494621410",
    ],

    address:
      "Plot 1387, Cadastral Zone A00, Central Business District, Abuja, FCT, Nigeria",

    website:
      "https://nerc.gov.ng/",

    jurisdiction:
      "Federal electricity market and final NERC complaint escalation",

    scope:
      "Final escalation after the responsible DisCo and applicable NERC Consumer Forum process",

    channels: {
      complaint_guidance:
        "https://nerc.gov.ng/need-help/services/how-to-file-a-complaint/",

      complaint_ticket:
        "https://nerc.freshdesk.com/support/tickets/new",

      forum_directory:
        "https://nerc.gov.ng/forum-offices/",
    },

    sourceUrls: [
      "https://nerc.gov.ng/contact-nerc/",
      "https://nerc.gov.ng/need-help/services/how-to-file-a-complaint/",
      "https://nerc.gov.ng/forum-offices/",
      "https://nerc.freshdesk.com/support/tickets/new",
    ],
  });

export const NERC_ABUJA_FORUM =
  powerAuthority({
    key:
      "nerc_abuja_forum",

    name:
      "NERC Abuja Forum",

    aliases: [
      "Abuja Forum",
      "NERC Abuja Consumer Forum",
      "Abuja NERC Forum",
    ],

    emails: [
      "abujaforum@nerc.gov.ng",
    ],

    phoneNumbers: [
      "08146862225",
    ],

    address:
      "No. 14, Road 131, Gwarinpa, Abuja, FCT, Nigeria",

    website:
      "https://nerc.gov.ng/forum-offices/abuja-forum-office/",

    jurisdiction:
      "Federal Capital Territory",

    scope:
      "Escalation of unresolved electricity complaints after the responsible DisCo Customer Complaints Unit",

    channels: {
      forum_directory:
        "https://nerc.gov.ng/forum-offices/",
    },

    sourceUrls: [
      "https://nerc.gov.ng/forum-offices/",
      "https://nerc.gov.ng/forum-offices/abuja-forum-office/",
      "https://nerc.gov.ng/need-help/services/how-to-file-a-complaint/",
    ],
  });

export const TRANSITIONED_STATE_REGULATORS =
  Object.freeze({
    abia:
      powerAuthority({
        key:
          "abia",

        name:
          "Abia State Electricity Regulatory Authority",

        aliases: [
          "ASERA",
          "Abia Electricity Regulator",
        ],

        emails: [
          "info.asera@abiastate.gov.ng",
        ],

        phoneNumbers: [
          "07079092439",
        ],

        address:
          "15 Library Avenue, Umuahia, Abia State, Nigeria",

        website:
          "https://asera.abiastate.gov.ng",

        jurisdiction:
          "Abia State",

        scope:
          "Intrastate electricity regulation and consumer complaint escalation",
      }),

    anambra:
      powerAuthority({
        key:
          "anambra",

        name:
          "Anambra State Electricity Regulatory Commission",

        aliases: [
          "ASERC",
          "Anambra Electricity Regulator",
        ],

        emails: [
          "info@aserc.anambrastate.gov.ng",
        ],

        phoneNumbers: [
          "09162402960",
        ],

        address:
          "ASERC Complex, Old Government House Complex, Awka, Anambra State, Nigeria",

        website:
          "https://aserc.anambrastate.gov.ng",

        jurisdiction:
          "Anambra State",

        scope:
          "Intrastate electricity regulation and consumer complaint escalation",
      }),

    bayelsa:
      powerAuthority({
        key:
          "bayelsa",

        name:
          "Bayelsa State Electricity Regulatory Authority",

        aliases: [
          "BYERA",
          "Bayelsa Electricity Regulator",
        ],

        emails: [
          "office@byera.energy",
        ],

        phoneNumbers: [
          "09122636936",
        ],

        address:
          "Oxbow Lake, Yenagoa, Bayelsa State, Nigeria",

        website:
          "https://byera.energy",

        jurisdiction:
          "Bayelsa State",

        scope:
          "Intrastate electricity regulation and consumer complaint escalation",
      }),

    edo:
      powerAuthority({
        key:
          "edo",

        name:
          "Edo State Electricity Regulatory Commission",

        aliases: [
          "Edo State Electricity Regulator",
          "Edo Electricity Regulator",
        ],

        jurisdiction:
          "Edo State",

        scope:
          "Intrastate electricity regulation and consumer complaint escalation",

        dynamicRoute:
          true,
      }),

    ekiti:
      powerAuthority({
        key:
          "ekiti",

        name:
          "Ekiti State Electricity Regulatory Bureau",

        aliases: [
          "EKSERB",
          "Ekiti Electricity Regulator",
        ],

        address:
          "Old NERC Forum Building, Adebayo Road, Ado Ekiti, Ekiti State, Nigeria",

        website:
          "https://ekserb.ng",

        jurisdiction:
          "Ekiti State",

        scope:
          "Intrastate electricity regulation and consumer complaint escalation",

        dynamicRoute:
          true,
      }),

    enugu:
      powerAuthority({
        key:
          "enugu",

        name:
          "Enugu State Electricity Regulatory Commission",

        aliases: [
          "EERC",
          "Enugu Electricity Regulator",
        ],

        emails: [
          "info@eerc.en.gov.ng",
        ],

        phoneNumbers: [
          "07072051569",
        ],

        address:
          "No. 2 Forest Close, Off Forest Crescent, Off Park Avenue, G.R.A. Enugu, Enugu State, Nigeria",

        website:
          "https://eerc.en.gov.ng",

        jurisdiction:
          "Enugu State",

        scope:
          "Intrastate electricity regulation and consumer complaint escalation",
      }),

    gombe:
      powerAuthority({
        key:
          "gombe",

        name:
          "Gombe State Electricity Regulatory Commission",

        aliases: [
          "GOSERC",
          "Gombe Electricity Regulator",
        ],

        emails: [
          "infogoserc@gmail.com",
        ],

        phoneNumbers: [
          "08033141578",
        ],

        address:
          "Mohammed Aliyu Plaza, Gombe-Bauchi Express Road, Gombe State, Nigeria",

        jurisdiction:
          "Gombe State",

        scope:
          "Intrastate electricity regulation and consumer complaint escalation",
      }),

    imo:
      powerAuthority({
        key:
          "imo",

        name:
          "Imo State Electricity Regulatory Commission",

        aliases: [
          "ISERC",
          "Imo Electricity Regulator",
        ],

        phoneNumbers: [
          "08033437594",
        ],

        address:
          "Electricity House, Concorde Boulevard, New Owerri, Imo State, Nigeria",

        website:
          "https://iserc.com.ng",

        jurisdiction:
          "Imo State",

        scope:
          "Intrastate electricity regulation and consumer complaint escalation",

        dynamicRoute:
          true,
      }),

    kogi:
      powerAuthority({
        key:
          "kogi",

        name:
          "Kogi State Electricity Regulatory Commission",

        aliases: [
          "KERC",
          "Kogi Electricity Regulator",
        ],

        emails: [
          "info@kerc.kg.gov.ng",
        ],

        phoneNumbers: [
          "09124267545",
          "09077324141",
        ],

        address:
          "Alheri Junction, Along Crowther Memorial College, Lokoja, Kogi State, Nigeria",

        website:
          "https://kerc.kg.gov.ng",

        jurisdiction:
          "Kogi State",

        scope:
          "Intrastate electricity regulation and consumer complaint escalation",
      }),

    lagos:
      powerAuthority({
        key:
          "lagos",

        name:
          "Lagos State Electricity Regulatory Commission",

        aliases: [
          "LASERC",
          "Lagos Electricity Regulator",
        ],

        emails: [
          "info@laserc.com.ng",
        ],

        phoneNumbers: [
          "09169346145",
        ],

        address:
          "Block B, Lagos Revenue House, Assbifi Road, Alausa, Lagos 101233, Lagos State, Nigeria",

        website:
          "https://laserc.com.ng",

        jurisdiction:
          "Lagos State",

        scope:
          "Intrastate electricity regulation and consumer complaint escalation",
      }),

    nasarawa:
      powerAuthority({
        key:
          "nasarawa",

        name:
          "Nasarawa State Electricity Regulatory Commission",

        aliases: [
          "NASERC",
          "Nasarawa Electricity Regulator",
        ],

        address:
          "Former Ministry of Health, Opposite Federal Secretariat, Jos Road, Lafia, Nasarawa State, Nigeria",

        website:
          "https://naserc.na.gov.ng",

        jurisdiction:
          "Nasarawa State",

        scope:
          "Intrastate electricity regulation and consumer complaint escalation",

        dynamicRoute:
          true,
      }),

    niger:
      powerAuthority({
        key:
          "niger",

        name:
          "Niger State Electricity Regulatory Commission",

        aliases: [
          "NSERC",
          "Niger Electricity Regulator",
        ],

        emails: [
          "info@nserc.ni.gov.ng",
        ],

        phoneNumbers: [
          "07044440453",
        ],

        address:
          "No. 6 Nnamdi Azikwe Road, Minna, Niger State, Nigeria",

        website:
          "https://nserc.ni.gov.ng",

        jurisdiction:
          "Niger State",

        scope:
          "Intrastate electricity regulation and consumer complaint escalation",
      }),

    ogun:
      powerAuthority({
        key:
          "ogun",

        name:
          "Ogun State Electricity Regulatory Commission",

        aliases: [
          "Ogun State Electricity Regulator",
          "Ogun Electricity Regulator",
        ],

        jurisdiction:
          "Ogun State",

        scope:
          "Intrastate electricity regulation and consumer complaint escalation",

        dynamicRoute:
          true,
      }),

    ondo:
      powerAuthority({
        key:
          "ondo",

        name:
          "Ondo State Electricity Regulatory Bureau",

        aliases: [
          "OSERB",
          "Ondo Electricity Regulator",
        ],

        emails: [
          "ondoserb@gmail.com",
        ],

        phoneNumbers: [
          "08070956100",
          "07083258660",
          "09034685101",
        ],

        address:
          "5 Samuel Olukayode Street, Old UNICEF Building, Alagbaka, Akure, Ondo State, Nigeria",

        website:
          "https://oserb.ng",

        jurisdiction:
          "Ondo State",

        scope:
          "Intrastate electricity regulation and consumer complaint escalation",
      }),

    oyo:
      powerAuthority({
        key:
          "oyo",

        name:
          "Oyo State Electricity Regulatory Commission",

        aliases: [
          "Oyo State Electricity Regulator",
          "Oyo Electricity Regulator",
        ],

        jurisdiction:
          "Oyo State",

        scope:
          "Intrastate electricity regulation and consumer complaint escalation",

        dynamicRoute:
          true,
      }),

    plateau:
      powerAuthority({
        key:
          "plateau",

        name:
          "Plateau State Electricity Regulatory Commission",

        aliases: [
          "Plateau State Electricity Regulator",
          "Plateau Electricity Regulator",
        ],

        address:
          "Former Tati Hotel, Gada Biu, Jos, Plateau State, Nigeria",

        jurisdiction:
          "Plateau State",

        scope:
          "Intrastate electricity regulation and consumer complaint escalation",

        dynamicRoute:
          true,
      }),
  });

export const NIGERIAN_TRANSITIONED_STATE_REGULATORS =
  Object.freeze(
    Object.values(
      TRANSITIONED_STATE_REGULATORS
    )
  );

export const NIGERIAN_POWER_DETECTION_KEYWORDS =
  Object.freeze(
    [
      ...new Set([
        ...GENERIC_POWER_TERMS,

        ...NIGERIAN_POWER_PROVIDERS
          .flatMap(
            provider => [
              provider.name,
              ...provider.aliases,
            ]
          ),

        NERC_NATIONAL_COMPLAINTS.name,
        ...NERC_NATIONAL_COMPLAINTS.aliases,

        NERC_ABUJA_FORUM.name,
        ...NERC_ABUJA_FORUM.aliases,

        ...NIGERIAN_TRANSITIONED_STATE_REGULATORS
          .flatMap(
            authority => [
              authority.name,
              ...authority.aliases,
            ]
          ),
      ]),
    ]
      .filter(
        value =>
          String(value)
            .trim()
            .toLowerCase() !==
          "ie"
      )
      .map(
        value =>
          String(value)
            .trim()
            .toLowerCase()
      )
  );

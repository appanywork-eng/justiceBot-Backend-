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

export const NIGERIAN_POWER_DETECTION_KEYWORDS =
  [
    ...new Set([
      ...GENERIC_POWER_TERMS,

      ...NIGERIAN_POWER_PROVIDERS
        .flatMap(
          provider => [
            provider.name,
            ...provider.aliases,
          ]
        )
        /*
         * IE is too short and ambiguous for broad
         * sector detection. It remains available
         * for exact institution matching.
         */
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
        ),
    ]),
  ];

export const TRANSITIONED_STATE_REGULATORS = {
  abia: {
    name:
      "Abia State Electricity Regulatory Authority",
    emailAvailable: true,
  },

  anambra: {
    name:
      "Anambra State Electricity Regulatory Commission",
    emailAvailable: true,
  },

  bayelsa: {
    name:
      "Bayelsa State Electricity Regulatory Authority",
    emailAvailable: true,
  },

  edo: {
    name:
      "Edo State Electricity Regulatory Commission",
    emailAvailable: false,
  },

  ekiti: {
    name:
      "Ekiti State Electricity Regulatory Bureau",
    emailAvailable: false,
  },

  enugu: {
    name:
      "Enugu State Electricity Regulatory Commission",
    emailAvailable: true,
  },

  gombe: {
    name:
      "Gombe State Electricity Regulatory Commission",
    emailAvailable: true,
  },

  imo: {
    name:
      "Imo State Electricity Regulatory Commission",
    emailAvailable: false,
  },

  kogi: {
    name:
      "Kogi State Electricity Regulatory Commission",
    emailAvailable: true,
  },

  lagos: {
    name:
      "Lagos State Electricity Regulatory Commission",
    emailAvailable: true,
  },

  nasarawa: {
    name:
      "Nasarawa State Electricity Regulatory Commission",
    emailAvailable: false,
  },

  niger: {
    name:
      "Niger State Electricity Regulatory Commission",
    emailAvailable: true,
  },

  ogun: {
    name:
      "Ogun State Electricity Regulatory Commission",
    emailAvailable: false,
  },

  ondo: {
    name:
      "Ondo State Electricity Regulatory Bureau",
    emailAvailable: true,
  },

  oyo: {
    name:
      "Oyo State Electricity Regulatory Commission",
    emailAvailable: false,
  },

  plateau: {
    name:
      "Plateau State Electricity Regulatory Commission",
    emailAvailable: false,
  },
};

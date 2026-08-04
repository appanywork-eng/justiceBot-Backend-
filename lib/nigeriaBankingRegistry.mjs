/*
 * PetitionDesk nationwide Nigerian
 * banking and financial-services registry.
 *
 * Routing principles:
 * - complain to the financial institution first;
 * - retain its complaint reference;
 * - escalate an unresolved complaint to CBN;
 * - never invent provider complaint emails;
 * - support banks, MFBs, PSBs, mobile-money
 *   operators and payment-service providers;
 * - allow safe routing for an institution that
 *   is not explicitly listed.
 */

const VERIFIED_ON =
  "2026-08-04";

export const CBN_BANKING_COMPLAINT_AUTHORITY =
  Object.freeze({
    key:
      "cbn_consumer_protection",

    name:
      "Central Bank of Nigeria (CBN)",

    aliases: [
      "CBN",
      "Central Bank of Nigeria",
      "Consumer Protection Department",
      "CBN Consumer Protection Department",
      "Consumer Protection Department of the CBN",
      "CPD",
    ],

    contact: {
      emails: [
        "cpd@cbn.gov.ng",
      ],

      address:
        "Central Bank of Nigeria, Plot 33, Abubakar Tafawa Balewa Way, Central Business District, Cadastral Zone, Abuja, Federal Capital Territory, Nigeria",

      website:
        "https://www.cbn.gov.ng/supervision/cpdcomgt.html",

      complaint_guide:
        "https://www.cbn.gov.ng/FinInc/FinLit/LodgeComplaint.html",

      complaint_portal:
        "https://complaintsportal.cbn.gov.ng/",
    },

    verification: {
      status:
        "VERIFIED_OFFICIAL_SOURCE",

      verified_on:
        VERIFIED_ON,

      scope:
        "identity_direct_contact_and_complaint_process",

      source_urls: [
        "https://www.cbn.gov.ng/supervision/cpdcomgt.html",
        "https://www.cbn.gov.ng/FinInc/FinLit/LodgeComplaint.html",
        "https://www.cbn.gov.ng/Contacts/",
      ],
    },
  });

const CBN_BANK_DIRECTORY_SOURCE =
  "https://www.cbn.gov.ng/RSS/CircularsRSS.html";

const CBN_PAYMENT_PROVIDER_SOURCE =
  "https://www.cbn.gov.ng/PaymentsSystem/PSPs.html";

function provider({
  key,
  name,
  aliases = [],
  category = "deposit_money_bank",
  paymentProvider = false,
} = {}) {
  return Object.freeze({
    key,
    name,
    aliases:
      Object.freeze([
        ...new Set([
          name,
          ...aliases,
        ]),
      ]),

    category,

    /*
     * Direct emails are intentionally empty
     * unless an institution's own official
     * complaint source has been verified.
     *
     * The institution remains available for
     * correct first-stage routing through its
     * branch, app, website or official support
     * channel.
     */
    contact: {
      emails: [],
    },

    verification: {
      status:
        "VERIFIED_OFFICIAL_SOURCE",

      verified_on:
        VERIFIED_ON,

      scope:
        "provider_identity_and_routing_only",

      direct_email_verified:
        false,

      source_urls: [
        paymentProvider
          ? CBN_PAYMENT_PROVIDER_SOURCE
          : CBN_BANK_DIRECTORY_SOURCE,
      ],
    },
  });
}

const GTBANK =
  Object.freeze({
    ...provider({
      key:
        "gtbank",

      name:
        "Guaranty Trust Bank Limited",

      aliases: [
        "GTBank",
        "GTB",
        "Guaranty Trust Bank",
        "Guaranty Trust Bank PLC",
      ],
    }),

    contact: {
      emails: [
        "gtbankmailsupport@gtbank.com",
      ],

      website:
        "https://www.gtbank.com/help-centre/complaints-enquiries",

      complaint_portal:
        "https://www.gtbank.com/help-centre",
    },

    verification: {
      status:
        "VERIFIED_OFFICIAL_SOURCE",

      verified_on:
        VERIFIED_ON,

      scope:
        "provider_identity_and_direct_complaint_contact",

      direct_email_verified:
        true,

      source_urls: [
        "https://www.gtbank.com/help-centre/complaints-enquiries",
        "https://www.gtbank.com/complaints-handling-policy",
      ],
    },
  });

const STANBIC =
  Object.freeze({
    ...provider({
      key:
        "stanbic",

      name:
        "Stanbic IBTC Bank Limited",

      aliases: [
        "Stanbic IBTC",
        "Stanbic",
        "Stanbic IBTC Bank PLC",
      ],
    }),

    contact: {
      emails: [
        "CustomerCareNigeria@stanbicibtc.com",
      ],

      phones: [
        "0201 2709 676",
        "0201 4222 222",
        "+234 700 909 9099",
      ],

      website:
        "https://www.stanbicibtcbank.com/nigeriabank/personal/contact-us/contact-us-details",

      complaint_form:
        "https://www.stanbicibtcbank.com/nigeriabank/personal/help/General-FAQs/complaints-and-enquiries",

      address:
        "Stanbic IBTC Towers, Walter Carrington Crescent, Victoria Island, Lagos, Nigeria",

      app_guidance:
        "Complaints may also be submitted through the user-feedback feature in the Stanbic IBTC mobile application.",
    },

    verification: {
      status:
        "VERIFIED_OFFICIAL_SOURCE",

      verified_on:
        VERIFIED_ON,

      scope:
        "provider_identity_direct_email_phone_address_and_complaint_form",

      direct_email_verified:
        true,

      phone_numbers_verified:
        true,

      complaint_form_verified:
        true,

      address_verified:
        true,

      source_urls: [
        "https://www.stanbicibtcbank.com/nigeriabank/personal/help/General-FAQs/complaints-and-enquiries",
        "https://www.stanbicibtcbank.com/nigeriabank/personal/contact-us/contact-us-details",
        "https://www.stanbicibtcbank.com/nigeriabank/personal/contact-us",
      ],
    },
  });

const ACCESS_BANK =
  Object.freeze({
    ...provider({
      key:
        "access",

      name:
        "Access Bank PLC",

      aliases: [
        "Access Bank",
      ],
    }),

    contact: {
      emails: [
        "contactcenter@accessbankplc.com",
      ],

      escalation_emails: [
        "cc-ombudsman@accessbankplc.com",
      ],

      phones: [
        "0700 300 0000",
        "0201 280 2500",
        "0201 271 2005",
        "0201 227 3000",
      ],

      website:
        "https://www.accessbankplc.com/help/complaint-channels",

      complaint_form:
        "https://www.accessbankplc.com/help/complaint-channels",

      escalation_page:
        "https://www.accessbankplc.com/contact-us/we-care",

      address:
        "Access Bank PLC Head Office, 14/15 Prince Alaba Abiodun, Oniru Road, Victoria Island, Lagos, Nigeria",

      app_guidance:
        "Complaints may also be submitted through Access Bank's official mobile applications, WhatsApp banking or any Access Bank branch.",
    },

    verification: {
      status:
        "VERIFIED_OFFICIAL_SOURCE",

      verified_on:
        VERIFIED_ON,

      scope:
        "provider_identity_direct_email_phone_address_complaint_channel_and_internal_ombudsman",

      direct_email_verified:
        true,

      escalation_email_verified:
        true,

      phone_numbers_verified:
        true,

      complaint_form_verified:
        true,

      address_verified:
        true,

      source_urls: [
        "https://www.accessbankplc.com/help/complaint-channels",
        "https://www.accessbankplc.com/contact-us/we-care",
      ],
    },
  });

export const NIGERIAN_BANKING_PROVIDERS =
  Object.freeze([
    ACCESS_BANK,

    provider({
      key:
        "citibank",

      name:
        "Citibank Nigeria Limited",

      aliases: [
        "Citibank",
        "Citi Nigeria",
        "Citi",
      ],
    }),

    provider({
      key:
        "ecobank",

      name:
        "Ecobank Nigeria Limited",

      aliases: [
        "Ecobank",
        "Ecobank Nigeria",
      ],
    }),

    provider({
      key:
        "fidelity",

      name:
        "Fidelity Bank PLC",

      aliases: [
        "Fidelity Bank",
      ],
    }),

    provider({
      key:
        "firstbank",

      name:
        "First Bank of Nigeria Limited",

      aliases: [
        "FirstBank",
        "First Bank",
        "FBN",
      ],
    }),

    provider({
      key:
        "fcmb",

      name:
        "First City Monument Bank Limited",

      aliases: [
        "FCMB",
        "First City Monument Bank",
        "First City Monument Bank PLC",
      ],
    }),

    provider({
      key:
        "globus",

      name:
        "Globus Bank Limited",

      aliases: [
        "Globus Bank",
      ],
    }),

    GTBANK,

    provider({
      key:
        "jaiz",

      name:
        "Jaiz Bank PLC",

      aliases: [
        "Jaiz",
        "Jaiz Bank",
      ],

      category:
        "non_interest_bank",
    }),

    provider({
      key:
        "keystone",

      name:
        "Keystone Bank Limited",

      aliases: [
        "Keystone Bank",
      ],
    }),

    provider({
      key:
        "lotus",

      name:
        "Lotus Bank Limited",

      aliases: [
        "Lotus",
        "Lotus Bank",
      ],

      category:
        "non_interest_bank",
    }),

    provider({
      key:
        "nova",

      name:
        "NOVA Bank Limited",

      aliases: [
        "NOVA Bank",
        "Nova Bank",
        "Nova Merchant Bank",
        "Nova Merchant Bank Limited",
      ],
    }),

    provider({
      key:
        "optimus",

      name:
        "Optimus Bank Limited",

      aliases: [
        "Optimus Bank",
      ],
    }),

    provider({
      key:
        "parallex",

      name:
        "Parallex Bank Limited",

      aliases: [
        "Parallex Bank",
        "Parallex",
      ],
    }),

    provider({
      key:
        "polaris",

      name:
        "Polaris Bank Limited",

      aliases: [
        "Polaris Bank",
      ],
    }),

    provider({
      key:
        "premiumtrust",

      name:
        "PremiumTrust Bank Limited",

      aliases: [
        "PremiumTrust Bank",
        "Premium Trust Bank",
        "PremiumTrust",
      ],
    }),

    provider({
      key:
        "providus",

      name:
        "Providus Bank Limited",

      aliases: [
        "Providus Bank",
        "Providus",
      ],
    }),

    STANBIC,

    provider({
      key:
        "standard_chartered",

      name:
        "Standard Chartered Bank Nigeria Limited",

      aliases: [
        "Standard Chartered",
        "Standard Chartered Nigeria",
        "SCB",
      ],
    }),

    provider({
      key:
        "sterling",

      name:
        "Sterling Bank Limited",

      aliases: [
        "Sterling Bank",
        "Sterling Bank PLC",
      ],
    }),

    provider({
      key:
        "suntrust",

      name:
        "SunTrust Bank Nigeria Limited",

      aliases: [
        "SunTrust Bank",
        "SunTrust",
      ],
    }),

    provider({
      key:
        "tajbank",

      name:
        "TAJBank Limited",

      aliases: [
        "TAJBank",
        "TAJ Bank",
      ],

      category:
        "non_interest_bank",
    }),

    provider({
      key:
        "alternative_bank",

      name:
        "The Alternative Bank Limited",

      aliases: [
        "The Alternative Bank",
        "Alternative Bank",
        "AltBank",
        "Alt Bank",
      ],

      category:
        "non_interest_bank",
    }),

    provider({
      key:
        "titan",

      name:
        "Titan Trust Bank Limited",

      aliases: [
        "Titan Trust Bank",
        "Titan Bank",
        "Titan",
      ],
    }),

    provider({
      key:
        "union",

      name:
        "Union Bank of Nigeria PLC",

      aliases: [
        "Union Bank",
        "Union Bank Nigeria",
      ],
    }),

    provider({
      key:
        "unity",

      name:
        "Unity Bank PLC",

      aliases: [
        "Unity Bank",
      ],
    }),

    provider({
      key:
        "uba",

      name:
        "United Bank for Africa PLC",

      aliases: [
        "UBA",
        "United Bank for Africa",
        "UBA Nigeria",
      ],
    }),

    provider({
      key:
        "wema",

      name:
        "Wema Bank PLC",

      aliases: [
        "Wema Bank",
        "ALAT",
        "ALAT by Wema",
      ],
    }),

    provider({
      key:
        "zenith",

      name:
        "Zenith Bank PLC",

      aliases: [
        "Zenith Bank",
        "Zenith",
      ],
    }),

    provider({
      key:
        "9psb",

      name:
        "9 Payment Service Bank (9PSB)",

      aliases: [
        "9PSB",
        "9 Payment Service Bank",
      ],

      category:
        "payment_service_bank",

      paymentProvider:
        true,
    }),

    provider({
      key:
        "hope_psb",

      name:
        "Hope Payment Service Bank",

      aliases: [
        "Hope PSB",
        "Hope Payment Service Bank",
        "Hopepsbank",
      ],

      category:
        "payment_service_bank",

      paymentProvider:
        true,
    }),

    provider({
      key:
        "smartcash",

      name:
        "SmartCash Payment Service Bank",

      aliases: [
        "SmartCash",
        "SmartCash PSB",
        "Smart Cash",
      ],

      category:
        "payment_service_bank",

      paymentProvider:
        true,
    }),

    provider({
      key:
        "opay",

      name:
        "OPay Digital Services Limited",

      aliases: [
        "OPay",
        "O Pay",
        "Paycom Nigeria",
        "Paycom Nigeria Limited",
      ],

      category:
        "mobile_money_operator",

      paymentProvider:
        true,
    }),

    provider({
      key:
        "palmpay",

      name:
        "PalmPay Limited",

      aliases: [
        "PalmPay",
        "Palm Pay",
        "PalmPay Nigeria",
      ],

      category:
        "mobile_money_operator",

      paymentProvider:
        true,
    }),

    provider({
      key:
        "paga",

      name:
        "Pagatech Limited (Paga)",

      aliases: [
        "Paga",
        "myPaga",
        "Paga Nigeria",
        "Pagatech",
        "Pagatech Limited",
      ],

      category:
        "mobile_money_operator",

      paymentProvider:
        true,
    }),

    provider({
      key:
        "moniepoint",

      name:
        "Moniepoint Microfinance Bank Limited",

      aliases: [
        "Moniepoint",
        "Moniepoint MFB",
        "TeamApt",
        "TeamApt Limited",
      ],

      category:
        "microfinance_and_payment_services",

      paymentProvider:
        true,
    }),

    provider({
      key:
        "flutterwave",

      name:
        "Flutterwave Technology Solutions Limited",

      aliases: [
        "Flutterwave",
        "Flutter Wave",
      ],

      category:
        "payment_service_provider",

      paymentProvider:
        true,
    }),

    provider({
      key:
        "paystack",

      name:
        "Paystack Payment Limited",

      aliases: [
        "Paystack",
        "Paystack Payments",
        "Paystack Nigeria",
      ],

      category:
        "payment_service_provider",

      paymentProvider:
        true,
    }),

    provider({
      key:
        "interswitch",

      name:
        "Interswitch Limited",

      aliases: [
        "Interswitch",
        "Quickteller",
        "Quick Teller",
      ],

      category:
        "payment_service_provider",

      paymentProvider:
        true,
    }),

    provider({
      key:
        "remita",

      name:
        "Remita Payment Service Limited",

      aliases: [
        "Remita",
        "SystemSpecs Remita",
      ],

      category:
        "payment_service_provider",

      paymentProvider:
        true,
    }),

    provider({
      key:
        "nomba",

      name:
        "Nomba Financial Services Limited",

      aliases: [
        "Nomba",
        "Nomba Financial Services",
        "Kudi",
        "Kudi Nigeria",
      ],

      category:
        "payment_service_provider",

      paymentProvider:
        true,
    }),
  ]);

const GENERIC_BANKING_KEYWORDS = [
  "bank",
  "banking",
  "bank account",
  "financial institution",
  "microfinance bank",
  "mfb",
  "payment service bank",
  "psb",
  "mobile money",
  "mobile wallet",
  "fintech",
  "payment provider",
  "payment processor",
  "account balance",
  "account restriction",
  "account freeze",
  "frozen account",
  "blocked account",
  "unauthorised debit",
  "unauthorized debit",
  "unauthorised transaction",
  "unauthorized transaction",
  "failed transfer",
  "pending transfer",
  "transfer reversal",
  "reversal",
  "duplicate debit",
  "wrong debit",
  "atm debit",
  "atm dispute",
  "pos debit",
  "pos dispute",
  "card fraud",
  "card transaction",
  "chargeback",
  "merchant dispute",
  "ussd debit",
  "mobile app debit",
  "internet banking",
  "loan complaint",
  "loan harassment",
  "excess charge",
  "bank charge",
  "interest charge",
  "credit facility",
  "kyc",
  "bvn",
  "nin linkage",
  "phishing",
  "banking fraud",
  "wallet fraud",
  "scam transfer",
  "cbn",
  "consumer protection department",
  "cpd",
  "kuda",
  "fairmoney",
  "fair money",
  "carbon",
  "carbon finance",
];

export const NIGERIAN_BANKING_DETECTION_KEYWORDS =
  Object.freeze(
    [
      ...new Set([
        ...GENERIC_BANKING_KEYWORDS,

        CBN_BANKING_COMPLAINT_AUTHORITY
          .name,

        ...CBN_BANKING_COMPLAINT_AUTHORITY
          .aliases,

        ...NIGERIAN_BANKING_PROVIDERS
          .flatMap(
            item => [
              item.name,
              ...item.aliases,
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

export function findRegisteredBankingProvider(
  key
) {
  const normalized =
    String(key || "")
      .trim()
      .toLowerCase();

  return (
    NIGERIAN_BANKING_PROVIDERS.find(
      item =>
        item.key ===
        normalized
    ) ||
    null
  );
}

import assert from "node:assert/strict";
import fs from "node:fs";

import {
  CBN_BANKING_COMPLAINT_AUTHORITY,
  NIGERIAN_BANKING_PROVIDERS,
  NIGERIAN_BANKING_DETECTION_KEYWORDS,
  findRegisteredBankingProvider,
} from "../lib/nigeriaBankingRegistry.mjs";

import {
  assessInstitutionContactVerification,
} from "../lib/nationalSectorPolicy.mjs";

import {
  resolveBankingRouting,
} from "../lib/regulatedSectorJurisdiction.mjs";

assert.ok(
  NIGERIAN_BANKING_PROVIDERS.length >=
  40,
  "Nationwide provider registry is incomplete"
);

console.log(
  `✅ ${NIGERIAN_BANKING_PROVIDERS.length} BANKING AND PAYMENT PROVIDERS ARE REGISTERED`
);

const duplicateKeys =
  NIGERIAN_BANKING_PROVIDERS
    .map(
      item =>
        item.key
    )
    .filter(
      (
        key,
        index,
        all
      ) =>
        all.indexOf(
          key
        ) !==
        index
    );

assert.deepEqual(
  duplicateKeys,
  []
);

console.log(
  "✅ BANKING PROVIDER KEYS ARE UNIQUE"
);

for (
  const provider
  of NIGERIAN_BANKING_PROVIDERS
) {
  const verification =
    assessInstitutionContactVerification({
      institution:
        provider,

      sectorData: {
        verification_policy: {
          official_sources_only:
            true,
        },
      },
    });

  assert.equal(
    verification
      .verifiedStatus,
    true,
    `${provider.key}: identity source is not verified`
  );

  assert.ok(
    verification
      .officialSources
      .length >
    0,
    `${provider.key}: official source is missing`
  );
}

console.log(
  "✅ EVERY REGISTERED PROVIDER HAS AN OFFICIAL IDENTITY SOURCE"
);

const storedProviderEmails =
  NIGERIAN_BANKING_PROVIDERS
    .flatMap(
      provider =>
        (
          provider
            .contact
            ?.emails ||
          []
        ).map(
          email => ({
            provider,
            email,
          })
        )
    );

const storedEmailsByProvider =
  Object.fromEntries(
    storedProviderEmails.map(
      ({
        provider,
        email,
      }) => [
        provider.key,
        email,
      ]
    )
  );

assert.equal(
  storedEmailsByProvider.gtbank,
  "gtbankmailsupport@gtbank.com"
);

assert.equal(
  storedEmailsByProvider.stanbic,
  "CustomerCareNigeria@stanbicibtc.com"
);

for (
  const {
    provider,
    email,
  }
  of storedProviderEmails
) {
  assert.equal(
    provider
      .verification
      .direct_email_verified,
    true,
    `${provider.key}: stored email is not verified`
  );

  assert.ok(
    provider
      .verification
      .source_urls
      .length > 0,
    `${provider.key}: official source is missing`
  );

  assert.match(
    email,
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/
  );
}

console.log(
  "✅ EVERY STORED BANK EMAIL HAS OFFICIAL VERIFICATION"
);

const cbnVerification =
  assessInstitutionContactVerification({
    institution:
      CBN_BANKING_COMPLAINT_AUTHORITY,

    sectorData: {
      verification_policy: {
        official_sources_only:
          true,
      },
    },
  });

assert.equal(
  cbnVerification
    .directContactAllowed,
  true
);

assert.deepEqual(
  CBN_BANKING_COMPLAINT_AUTHORITY
    .contact
    .emails,
  [
    "cpd@cbn.gov.ng",
  ]
);

assert.match(
  CBN_BANKING_COMPLAINT_AUTHORITY
    .contact
    .complaint_portal,
  /^https:\/\/complaintsportal\.cbn\.gov\.ng/
);

console.log(
  "✅ CBN CONSUMER PROTECTION ROUTE IS VERIFIED"
);

const providerCases = [
  [
    "GTBank",
    "Guaranty Trust Bank Limited",
  ],

  [
    "Access Bank",
    "Access Bank PLC",
  ],

  [
    "FirstBank",
    "First Bank of Nigeria Limited",
  ],

  [
    "UBA",
    "United Bank for Africa PLC",
  ],

  [
    "Zenith Bank",
    "Zenith Bank PLC",
  ],

  [
    "Stanbic",
    "Stanbic IBTC Bank Limited",
  ],

  [
    "OPay",
    "OPay Digital Services Limited",
  ],

  [
    "PalmPay",
    "PalmPay Limited",
  ],

  [
    "Paga",
    "Pagatech Limited (Paga)",
  ],

  [
    "Moniepoint",
    "Moniepoint Microfinance Bank Limited",
  ],

  [
    "Flutterwave",
    "Flutterwave Technology Solutions Limited",
  ],

  [
    "Paystack",
    "Paystack Payment Limited",
  ],

  [
    "Quickteller",
    "Interswitch Limited",
  ],
];

for (
  const [
    input,
    expectedName,
  ]
  of providerCases
) {
  const firstComplaint =
    resolveBankingRouting({
      sector:
        "banking",

      complaint:
        "I have a financial-service complaint concerning a disputed transaction.",

      institutionName:
        input,

      issueLocation:
        "Nigeria",

      escalationStage:
        "initial",

      country:
        "Nigeria",
    });

  assert.equal(
    firstComplaint.matched,
    true,
    `${input}: first-stage route did not match`
  );

  assert.equal(
    firstComplaint.routeKey,
    "bank_provider_first",
    `${input}: wrong first-stage route`
  );

  assert.equal(
    firstComplaint.primaryInstitution,
    expectedName,
    `${input}: wrong provider`
  );

  assert.deepEqual(
    firstComplaint.ccInstitutions,
    []
  );

  const unresolved =
    resolveBankingRouting({
      sector:
        "banking",

      complaint:
        "I previously complained to the institution, but the complaint remains unresolved.",

      institutionName:
        input,

      issueLocation:
        "Nigeria",

      escalationStage:
        "unresolved",

      priorComplaintDate:
        "2026-01-01",

      bankingComplaintType:
        "general_banking",

      priorComplaintReference:
        `TEST-${String(input)
          .replace(
            /[^a-z0-9]/gi,
            ""
          )
          .toUpperCase()}-12345`,

      country:
        "Nigeria",
    });

  assert.equal(
    unresolved.matched,
    true
  );

  assert.equal(
    unresolved.routeKey,
    "cbn_consumer_protection"
  );

  assert.equal(
    unresolved.primaryInstitution,
    CBN_BANKING_COMPLAINT_AUTHORITY
      .name
  );

  assert.deepEqual(
    unresolved.ccInstitutions,
    [
      expectedName,
    ]
  );

  console.log(
    `✅ ${String(input).toUpperCase()} FIRST COMPLAINT AND CBN ESCALATION ROUTE CORRECTLY`
  );
}

const unlistedProvider =
  "Example Community Microfinance Bank";

const unlistedFirstStage =
  resolveBankingRouting({
    sector:
      "banking",

    complaint:
      "I have a complaint about my savings account.",

    institutionName:
      unlistedProvider,

    issueLocation:
      "Kano State",

    escalationStage:
      "initial",

    country:
      "Nigeria",
  });

assert.equal(
  unlistedFirstStage.matched,
  true
);

assert.equal(
  unlistedFirstStage.primaryInstitution,
  unlistedProvider
);

assert.equal(
  unlistedFirstStage.routeKey,
  "bank_provider_first"
);

console.log(
  "✅ UNLISTED MICROFINANCE AND FINANCIAL INSTITUTIONS REMAIN SAFELY ROUTABLE"
);

const cbnAsProvider =
  resolveBankingRouting({
    sector:
      "banking",

    complaint:
      "I have an ordinary bank account complaint.",

    institutionName:
      "Central Bank of Nigeria",

    escalationStage:
      "initial",

    country:
      "Nigeria",
  });

assert.equal(
  cbnAsProvider.matched,
  false
);

assert.equal(
  cbnAsProvider.reason,
  "financial_institution_required"
);

console.log(
  "✅ CBN CANNOT BE MISUSED AS THE FIRST-STAGE SERVICE PROVIDER"
);

const nationwideLocations = [
  "Abia State",
  "Adamawa State",
  "Akwa Ibom State",
  "Anambra State",
  "Bauchi State",
  "Bayelsa State",
  "Benue State",
  "Borno State",
  "Cross River State",
  "Delta State",
  "Ebonyi State",
  "Edo State",
  "Ekiti State",
  "Enugu State",
  "Gombe State",
  "Imo State",
  "Jigawa State",
  "Kaduna State",
  "Kano State",
  "Katsina State",
  "Kebbi State",
  "Kogi State",
  "Kwara State",
  "Lagos State",
  "Nasarawa State",
  "Niger State",
  "Ogun State",
  "Ondo State",
  "Osun State",
  "Oyo State",
  "Plateau State",
  "Rivers State",
  "Sokoto State",
  "Taraba State",
  "Yobe State",
  "Zamfara State",
  "Federal Capital Territory",
];

for (
  const location
  of nationwideLocations
) {
  const route =
    resolveBankingRouting({
      sector:
        "banking",

      complaint:
        "I previously complained to GTBank, but the matter remains unresolved.",

      institutionName:
        "GTBank",

      issueLocation:
        location,

      escalationStage:
        "unresolved",

      priorComplaintDate:
        "2026-01-01",

      bankingComplaintType:
        "general_banking",

      priorComplaintReference:
        "TEST-NATIONWIDE-12345",

      country:
        "Nigeria",
    });

  assert.equal(
    route.matched,
    true,
    `${location}: route did not match`
  );

  assert.equal(
    route.routeKey,
    "cbn_consumer_protection",
    `${location}: did not route to CBN`
  );
}

console.log(
  "✅ ALL 36 STATES AND THE FCT USE THE NATIONAL CBN ESCALATION ROUTE"
);

for (
  const requiredKeyword
  of [
    "gtbank",
    "access bank",
    "firstbank",
    "uba",
    "zenith bank",
    "opay",
    "palmpay",
    "paga",
    "moniepoint",
    "flutterwave",
    "paystack",
    "failed transfer",
    "pos dispute",
    "loan harassment",
    "bvn",
  ]
) {
  assert.ok(
    NIGERIAN_BANKING_DETECTION_KEYWORDS
      .includes(
        requiredKeyword
      ),
    `Missing banking detection keyword: ${requiredKeyword}`
  );
}

console.log(
  "✅ NATIONAL BANKING DETECTION KEYWORDS ARE COMPLETE"
);

assert.ok(
  findRegisteredBankingProvider(
    "gtbank"
  )
);

assert.ok(
  findRegisteredBankingProvider(
    "opay"
  )
);

const bankingData =
  JSON.parse(
    fs.readFileSync(
      "data/banking.json",
      "utf8"
    )
  );

assert.equal(
  bankingData.version,
  "3.2.0"
);

assert.equal(
  bankingData.players.length,
  NIGERIAN_BANKING_PROVIDERS
    .length
);

assert.equal(
  bankingData.regulators.length,
  1
);

const serialized =
  JSON.stringify(
    bankingData
  );

for (
  const prohibitedRecipient
  of [
    "Economic and Financial Crimes Commission",
    "Nigeria Police Force",
    "Federal Competition and Consumer Protection Commission",
    "National Human Rights Commission",
    "Securities and Exchange Commission",
  ]
) {
  assert.doesNotMatch(
    serialized,
    new RegExp(
      prohibitedRecipient,
      "i"
    )
  );
}

console.log(
  "✅ IRRELEVANT AUTOMATIC BANKING RECIPIENTS WERE REMOVED"
);

const server =
  fs.readFileSync(
    "server.mjs",
    "utf8"
  );

assert.match(
  server,
  /NIGERIAN_BANKING_DETECTION_KEYWORDS/
);

assert.match(
  server,
  /banking:\s*NIGERIAN_BANKING_DETECTION_KEYWORDS/
);

console.log();
console.log(
  "✅ PROVIDER-FIRST BANKING ROUTING WORKS NATIONWIDE"
);

console.log(
  "✅ UNRESOLVED COMPLAINTS ROUTE TO CBN CONSUMER PROTECTION"
);

console.log(
  "✅ UNLISTED FINANCIAL INSTITUTIONS REMAIN SAFELY SUPPORTED"
);

console.log(
  "✅ BANKING AND FINANCE IS NOW FULLY NATIONALISED"
);

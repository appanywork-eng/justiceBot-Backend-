import assert from "node:assert/strict";
import fs from "node:fs";

import {
  NCC_TELECOM_ESCALATION,
  NIGERIAN_TELECOM_PROVIDERS,
  NIGERIAN_TELECOM_DETECTION_KEYWORDS,
} from "../lib/nigeriaTelecomRegistry.mjs";

import {
  assessInstitutionContactVerification,
} from "../lib/nationalSectorPolicy.mjs";

import {
  resolveTelecomRouting,
} from "../lib/regulatedSectorJurisdiction.mjs";

assert.equal(
  NIGERIAN_TELECOM_PROVIDERS.length,
  4
);

console.log(
  "✅ ALL FOUR NATIONAL MOBILE OPERATORS ARE REGISTERED"
);

for (
  const provider
  of NIGERIAN_TELECOM_PROVIDERS
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
      .directContactAllowed,
    true,
    `${provider.key}: contact is not verified`
  );

  assert.ok(
    provider.contact
      .emails.length >
      0,
    `${provider.key}: complaint email missing`
  );

  const firstComplaint =
    resolveTelecomRouting({
      sector:
        "telecoms",

      complaint:
        "I have a telecommunications service complaint.",

      institutionName:
        provider.testInput,

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
    `${provider.key}: first-stage route did not match`
  );

  assert.equal(
    firstComplaint.routeKey,
    "telecom_provider_first",
    `${provider.key}: wrong first-stage route`
  );

  assert.equal(
    firstComplaint.primaryInstitution,
    provider.name,
    `${provider.key}: wrong provider name`
  );

  assert.deepEqual(
    firstComplaint.ccInstitutions,
    []
  );

  const unresolved =
    resolveTelecomRouting({
      sector:
        "telecoms",

      complaint:
        "I previously complained to the operator, but the matter remains unresolved.",

      institutionName:
        provider.testInput,

      issueLocation:
        "Nigeria",

      escalationStage:
        "unresolved",

      priorComplaintReference:
        `TEST-${provider.key.toUpperCase()}-12345`,

      country:
        "Nigeria",
    });

  assert.equal(
    unresolved.matched,
    true
  );

  assert.equal(
    unresolved.routeKey,
    "ncc_consumer_portal"
  );

  assert.equal(
    unresolved.primaryInstitution,
    NCC_TELECOM_ESCALATION.name
  );

  assert.deepEqual(
    unresolved.ccInstitutions,
    [
      provider.name,
    ]
  );

  assert.equal(
    unresolved.emailRoutingExpected,
    false
  );

  console.log(
    `✅ ${provider.key.toUpperCase()} FIRST COMPLAINT AND NCC ESCALATION ROUTE CORRECTLY`
  );
}

const nccVerification =
  assessInstitutionContactVerification({
    institution:
      NCC_TELECOM_ESCALATION,

    sectorData: {
      verification_policy: {
        official_sources_only:
          true,
      },
    },
  });

assert.equal(
  nccVerification
    .directContactAllowed,
  true
);

assert.equal(
  NCC_TELECOM_ESCALATION
    .contact
    .emails
    .length,
  0
);

assert.match(
  NCC_TELECOM_ESCALATION
    .contact
    .complaint_portal,
  /^https:\/\/consumer\.ncc\.gov\.ng\//
);

console.log(
  "✅ NCC USES ITS VERIFIED CONSUMER COMPLAINT PORTAL"
);

const t2Provider =
  NIGERIAN_TELECOM_PROVIDERS.find(
    provider =>
      provider.key ===
      "t2mobile"
  );

assert.ok(
  t2Provider
);

for (
  const alias
  of [
    "T2mobile",
    "T2",
    "9mobile",
    "9 mobile",
    "Etisalat Nigeria",
    "EMTS",
  ]
) {
  const route =
    resolveTelecomRouting({
      sector:
        "telecoms",

      complaint:
        "I have a mobile service complaint.",

      institutionName:
        alias,

      escalationStage:
        "initial",

      country:
        "Nigeria",
    });

  assert.equal(
    route.primaryInstitution,
    t2Provider.name,
    `${alias}: did not resolve to T2mobile`
  );
}

console.log(
  "✅ 9MOBILE AND ETISALAT ALIASES NOW RESOLVE TO T2MOBILE"
);

for (
  const requiredKeyword
  of [
    "mtn",
    "glo",
    "airtel",
    "t2mobile",
    "9mobile",
    "sim swap fraud",
    "nin linkage",
  ]
) {
  assert.ok(
    NIGERIAN_TELECOM_DETECTION_KEYWORDS
      .includes(
        requiredKeyword
      ),
    `Missing telecom detection keyword: ${requiredKeyword}`
  );
}

console.log(
  "✅ NATIONAL TELECOM DETECTION KEYWORDS ARE COMPLETE"
);

for (
  const provider
  of NIGERIAN_TELECOM_PROVIDERS
) {
  const route =
    resolveTelecomRouting({
      sector:
        "telecoms",

      complaint:
        "I have a telecommunications service complaint.",

      institutionName:
        provider.testInput,

      escalationStage:
        "initial",

      country:
        "Nigeria",
    });

  assert.equal(
    route.emailRoutingExpected,
    true,
    `${provider.key}: verified email route disabled`
  );

  assert.deepEqual(
    route.contactEmails,
    provider.contact.emails,
    `${provider.key}: provider email metadata mismatch`
  );

  assert.deepEqual(
    route.contactPhoneNumbers,
    provider.contact.phones,
    `${provider.key}: provider phone metadata mismatch`
  );

  assert.equal(
    route.submissionUrl,
    provider.contact.complaint_portal ||
      provider.contact.website,
    `${provider.key}: provider portal mismatch`
  );

  assert.ok(
    route.sourceUrls.length > 0,
    `${provider.key}: official source URLs missing`
  );

  const escalation =
    resolveTelecomRouting({
      sector:
        "telecoms",

      complaint:
        "I complained to the operator but the issue remains unresolved.",

      institutionName:
        provider.testInput,

      escalationStage:
        "unresolved",

      priorComplaintReference:
        `LIVE-${provider.key.toUpperCase()}-12345`,

      country:
        "Nigeria",
    });

  assert.equal(
    escalation.routeKey,
    "ncc_consumer_portal"
  );

  assert.equal(
    escalation.emailRoutingExpected,
    false
  );

  assert.deepEqual(
    escalation.contactEmails,
    []
  );

  assert.deepEqual(
    escalation.contactPhoneNumbers,
    NCC_TELECOM_ESCALATION
      .contact
      .phones
  );

  assert.equal(
    escalation.submissionUrl,
    NCC_TELECOM_ESCALATION
      .contact
      .complaint_portal
  );

  assert.ok(
    escalation.sourceUrls.length > 0
  );
}

console.log(
  "✅ LIVE PROVIDER ROUTES EXPOSE VERIFIED CONTACT METADATA"
);

console.log(
  "✅ LIVE NCC ESCALATION USES THE VERIFIED PORTAL WITHOUT AN EMAIL ROUTE"
);

const unknownProvider =
  resolveTelecomRouting({
    sector:
      "telecoms",

    complaint:
      "I have a mobile network service complaint.",

    institutionName:
      "Regional Mobile Services Limited",

    escalationStage:
      "initial",

    country:
      "Nigeria",
  });

assert.equal(
  unknownProvider.matched,
  true
);

assert.equal(
  unknownProvider.routeKey,
  "telecom_provider_first_unverified_channel"
);

assert.equal(
  unknownProvider.primaryInstitution,
  "Regional Mobile Services Limited"
);

assert.equal(
  unknownProvider.emailRoutingExpected,
  false
);

assert.deepEqual(
  unknownProvider.contactEmails,
  []
);

assert.equal(
  unknownProvider.submissionUrl,
  ""
);

assert.match(
  unknownProvider.routingNote,
  /do not use a guessed email address/i
);

console.log(
  "✅ UNKNOWN TELECOM PROVIDERS NEVER RECEIVE GUESSED CONTACT DETAILS"
);

const telecomData =
  JSON.parse(
    fs.readFileSync(
      "data/telecoms.json",
      "utf8"
    )
  );

assert.equal(
  telecomData.version,
  "2.0.0"
);

assert.equal(
  telecomData.players.length,
  4
);

assert.equal(
  telecomData.regulators.length,
  1
);

const serialized =
  JSON.stringify(
    telecomData
  );

assert.doesNotMatch(
  serialized,
  /Nigeria Immigration Service \(SERVICOM\)/i
);

assert.doesNotMatch(
  serialized,
  /Nigerian Senate \(Redress Unit\)/i
);

assert.doesNotMatch(
  serialized,
  /House of Representatives \(Petitions Committee\)/i
);

console.log(
  "✅ IRRELEVANT TELECOM COMPLAINT RECIPIENTS WERE REMOVED"
);

const server =
  fs.readFileSync(
    "server.mjs",
    "utf8"
  );

assert.match(
  server,
  /NIGERIAN_TELECOM_DETECTION_KEYWORDS/
);

assert.match(
  server,
  /telecoms:\s*NIGERIAN_TELECOM_DETECTION_KEYWORDS/
);

console.log();
console.log(
  "✅ ALL TELECOM CONTACTS HAVE OFFICIAL SOURCES"
);

console.log(
  "✅ PROVIDER-FIRST ROUTING WORKS NATIONWIDE"
);

console.log(
  "✅ UNRESOLVED COMPLAINTS ROUTE TO THE NCC"
);

console.log(
  "✅ TELECOMMUNICATIONS IS NOW FULLY NATIONALISED"
);

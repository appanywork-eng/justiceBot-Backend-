import assert from "node:assert/strict";
import fs from "node:fs";

import {
  NCAA_AVIATION_ESCALATION,
  NSIB_AVIATION_SAFETY,
  NIGERIAN_AVIATION_PROVIDERS,
  NIGERIAN_AVIATION_DETECTION_KEYWORDS,
} from "../lib/nigeriaAviationRegistry.mjs";

import {
  assessInstitutionContactVerification,
} from "../lib/nationalSectorPolicy.mjs";

import {
  resolveAviationRouting,
} from "../lib/regulatedSectorJurisdiction.mjs";

assert.equal(
  NIGERIAN_AVIATION_PROVIDERS.length,
  10
);

console.log(
  "✅ TEN VERIFIED DOMESTIC PASSENGER AIRLINES ARE REGISTERED"
);

for (
  const provider
  of NIGERIAN_AVIATION_PROVIDERS
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
    `${provider.key}: official contact verification failed`
  );

  assert.ok(
    provider.contact
      .emails.length >
      0,
    `${provider.key}: complaint email missing`
  );

  assert.ok(
    provider.verification
      .source_urls.length >
      0,
    `${provider.key}: official sources missing`
  );

  const firstComplaint =
    resolveAviationRouting({
      sector:
        "aviation",

      complaint:
        "I have a passenger service complaint concerning my flight.",

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
    `${provider.key}: first complaint did not match`
  );

  assert.equal(
    firstComplaint.routeKey,
    "aviation_provider_first",
    `${provider.key}: incorrect first-stage route`
  );

  assert.equal(
    firstComplaint.primaryInstitution,
    provider.name,
    `${provider.key}: wrong provider`
  );

  assert.deepEqual(
    firstComplaint.ccInstitutions,
    []
  );

  const unresolved =
    resolveAviationRouting({
      sector:
        "aviation",

      complaint:
        "I previously complained to the airline, but the passenger complaint remains unresolved.",

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
    "ncaa_consumer_protection"
  );

  assert.equal(
    unresolved.primaryInstitution,
    NCAA_AVIATION_ESCALATION.name
  );

  assert.deepEqual(
    unresolved.ccInstitutions,
    [
      provider.name,
    ]
  );

  assert.equal(
    unresolved.emailRoutingExpected,
    true
  );

  console.log(
    `✅ ${provider.key.toUpperCase()} FIRST COMPLAINT AND NCAA ESCALATION ROUTE CORRECTLY`
  );
}

const ncaaVerification =
  assessInstitutionContactVerification({
    institution:
      NCAA_AVIATION_ESCALATION,

    sectorData: {
      verification_policy: {
        official_sources_only:
          true,
      },
    },
  });

assert.equal(
  ncaaVerification
    .directContactAllowed,
  true
);

assert.deepEqual(
  NCAA_AVIATION_ESCALATION
    .contact
    .emails,
  [
    "cpd@ncaa.gov.ng",
  ]
);

assert.match(
  NCAA_AVIATION_ESCALATION
    .contact
    .complaint_portal,
  /^https:\/\/cpd\.ncaa\.gov\.ng\//
);

console.log(
  "✅ NCAA CONSUMER PROTECTION EMAIL AND PORTAL ARE VERIFIED"
);

const nsibVerification =
  assessInstitutionContactVerification({
    institution:
      NSIB_AVIATION_SAFETY,

    sectorData: {
      verification_policy: {
        official_sources_only:
          true,
      },
    },
  });

assert.equal(
  nsibVerification
    .directContactAllowed,
  true
);

const accidentRoute =
  resolveAviationRouting({
    sector:
      "aviation",

    complaint:
      "I witnessed an aircraft crash and a serious aviation incident near the airport.",

    institutionName:
      "Test Airline",

    issueLocation:
      "Nigeria",

    escalationStage:
      "initial",

    country:
      "Nigeria",
  });

assert.equal(
  accidentRoute.matched,
  true
);

assert.equal(
  accidentRoute.routeKey,
  "nsib_accident_or_serious_incident"
);

assert.equal(
  accidentRoute.primaryInstitution,
  NSIB_AVIATION_SAFETY.name
);

assert.equal(
  accidentRoute.caseType,
  "aviation_safety"
);

console.log(
  "✅ ACCIDENTS AND SERIOUS INCIDENTS ROUTE IMMEDIATELY TO NSIB"
);

const unknownProviderFirst =
  resolveAviationRouting({
    sector:
      "aviation",

    complaint:
      "My flight was cancelled and I request a refund.",

    institutionName:
      "Example International Airline",

    issueLocation:
      "Lagos State",

    escalationStage:
      "initial",

    country:
      "Nigeria",
  });

assert.equal(
  unknownProviderFirst.matched,
  true
);

assert.equal(
  unknownProviderFirst.primaryInstitution,
  "Example International Airline"
);

assert.equal(
  unknownProviderFirst.routeKey,
  "aviation_provider_first"
);

const unknownProviderEscalation =
  resolveAviationRouting({
    sector:
      "aviation",

    complaint:
      "I previously complained to the airline about the cancellation, but it remains unresolved.",

    institutionName:
      "Example International Airline",

    issueLocation:
      "Lagos State",

    escalationStage:
      "unresolved",

    priorComplaintReference:
      "TEST-INTL-12345",

    country:
      "Nigeria",
  });

assert.equal(
  unknownProviderEscalation.primaryInstitution,
  NCAA_AVIATION_ESCALATION.name
);

assert.deepEqual(
  unknownProviderEscalation.ccInstitutions,
  [
    "Example International Airline",
  ]
);

console.log(
  "✅ OTHER AIRLINES OPERATING IN NIGERIA RETAIN SAFE PROVIDER-FIRST ROUTING"
);

for (
  const keyword
  of [
    "air peace",
    "arik air",
    "ibom air",
    "aero contractors",
    "united nigeria airlines",
    "green africa",
    "max air",
    "rano air",
    "valuejet",
    "overland airways",
    "flight cancellation",
    "lost baggage",
    "aircraft accident",
  ]
) {
  assert.ok(
    NIGERIAN_AVIATION_DETECTION_KEYWORDS
      .includes(
        keyword
      ),
    `Missing aviation keyword: ${keyword}`
  );
}

console.log(
  "✅ NATIONAL AVIATION DETECTION KEYWORDS ARE COMPLETE"
);

for (
  const provider
  of NIGERIAN_AVIATION_PROVIDERS
) {
  const route =
    resolveAviationRouting({
      sector:
        "aviation",

      complaint:
        "I have a passenger service complaint concerning my flight.",

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
    `${provider.key}: verified email routing disabled`
  );

  assert.deepEqual(
    route.contactEmails,
    provider.contact.emails,
    `${provider.key}: airline email metadata mismatch`
  );

  assert.deepEqual(
    route.contactPhoneNumbers,
    provider.contact.phones,
    `${provider.key}: airline phone metadata mismatch`
  );

  assert.equal(
    route.submissionUrl,
    provider.contact.complaint_portal ||
      provider.contact.website,
    `${provider.key}: airline complaint portal mismatch`
  );

  assert.ok(
    route.sourceUrls.length > 0,
    `${provider.key}: official source URLs missing`
  );

  const escalation =
    resolveAviationRouting({
      sector:
        "aviation",

      complaint:
        "I complained to the airline but the passenger complaint remains unresolved.",

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
    "ncaa_consumer_protection"
  );

  assert.deepEqual(
    escalation.contactEmails,
    NCAA_AVIATION_ESCALATION
      .contact
      .emails
  );

  assert.deepEqual(
    escalation.contactPhoneNumbers,
    NCAA_AVIATION_ESCALATION
      .contact
      .phones
  );

  assert.equal(
    escalation.submissionUrl,
    NCAA_AVIATION_ESCALATION
      .contact
      .complaint_portal
  );

  assert.ok(
    escalation.sourceUrls.length > 0
  );
}

console.log(
  "✅ LIVE AVIATION ROUTES EXPOSE VERIFIED CONTACT METADATA"
);

console.log(
  "✅ LIVE NCAA ESCALATION EXPOSES VERIFIED EMAIL AND PORTAL METADATA"
);

const liveSafetyRoute =
  resolveAviationRouting({
    sector:
      "aviation",

    complaint:
      "An aircraft crashed and there is a serious aviation incident.",

    issueLocation:
      "Nigeria",

    escalationStage:
      "initial",

    country:
      "Nigeria",
  });

assert.equal(
  liveSafetyRoute.routeKey,
  "nsib_accident_or_serious_incident"
);

assert.deepEqual(
  liveSafetyRoute.contactEmails,
  NSIB_AVIATION_SAFETY
    .contact
    .emails
);

assert.deepEqual(
  liveSafetyRoute
    .contactEmergencyPhoneNumbers,
  NSIB_AVIATION_SAFETY
    .contact
    .emergency_phones
);

assert.equal(
  liveSafetyRoute.submissionUrl,
  NSIB_AVIATION_SAFETY
    .contact
    .reporting_portal
);

assert.ok(
  liveSafetyRoute.sourceUrls.length > 0
);

console.log(
  "✅ LIVE NSIB SAFETY ROUTE EXPOSES VERIFIED EMERGENCY AND REPORTING CHANNELS"
);

const unknownAirlineMetadata =
  resolveAviationRouting({
    sector:
      "aviation",

    complaint:
      "My flight was cancelled and I request a refund.",

    institutionName:
      "Example International Airline",

    escalationStage:
      "initial",

    country:
      "Nigeria",
  });

assert.equal(
  unknownAirlineMetadata.routeKey,
  "aviation_provider_first"
);

assert.equal(
  unknownAirlineMetadata
    .emailRoutingExpected,
  false
);

assert.deepEqual(
  unknownAirlineMetadata
    .contactEmails,
  []
);

assert.deepEqual(
  unknownAirlineMetadata
    .contactPhoneNumbers,
  []
);

assert.equal(
  unknownAirlineMetadata
    .submissionUrl,
  ""
);

assert.match(
  unknownAirlineMetadata
    .routingNote,
  /do not use a guessed email address/i
);

console.log(
  "✅ UNKNOWN AIRLINES NEVER RECEIVE GUESSED CONTACT DETAILS"
);

const aviationData =
  JSON.parse(
    fs.readFileSync(
      "data/aviation.json",
      "utf8"
    )
  );

assert.equal(
  aviationData.version,
  "2.0.0"
);

assert.equal(
  aviationData.players.length,
  10
);

assert.equal(
  aviationData.regulators.length,
  2
);

const serialized =
  JSON.stringify(
    aviationData
  );

assert.doesNotMatch(
  serialized,
  /Dana Air/i
);

assert.doesNotMatch(
  serialized,
  /Nigerian Senate \(Redress Unit\)/i
);

assert.doesNotMatch(
  serialized,
  /SERVICOM \(Service Compact/i
);

console.log(
  "✅ INACTIVE AND IRRELEVANT AVIATION RECIPIENTS WERE REMOVED"
);

const server =
  fs.readFileSync(
    "server.mjs",
    "utf8"
  );

assert.match(
  server,
  /NIGERIAN_AVIATION_DETECTION_KEYWORDS/
);

assert.match(
  server,
  /aviation:\s*NIGERIAN_AVIATION_DETECTION_KEYWORDS/
);

console.log();
console.log(
  "✅ ALL AVIATION CONTACTS HAVE OFFICIAL SOURCES"
);

console.log(
  "✅ AIRLINE-FIRST COMPLAINT ROUTING WORKS NATIONWIDE"
);

console.log(
  "✅ UNRESOLVED CONSUMER COMPLAINTS ROUTE TO NCAA"
);

console.log(
  "✅ SERIOUS SAFETY OCCURRENCES ROUTE TO NSIB"
);

console.log(
  "✅ AVIATION IS NOW FULLY NATIONALISED"
);

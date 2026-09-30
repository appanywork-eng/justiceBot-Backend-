import assert from "node:assert/strict";

import {
  NCAA_AVIATION_ESCALATION,
  NSIB_AVIATION_SAFETY,
  NIGERIAN_AVIATION_PROVIDERS,
} from "../lib/nigeriaAviationRegistry.mjs";

import {
  evaluateAviationEscalationEligibility,
} from "../lib/aviationComplaintEligibility.mjs";

import {
  resolveAviationRouting,
} from "../lib/regulatedSectorJurisdiction.mjs";


assert.equal(
  NIGERIAN_AVIATION_PROVIDERS.length,
  10
);


const providerFirst =
  evaluateAviationEscalationEligibility({
    escalationRequested:
      false,
  });


assert.equal(
  providerFirst.reason,
  "provider_first"
);

assert.equal(
  providerFirst
    .ncaaEscalationEligible,
  false
);


const missingEvidence =
  evaluateAviationEscalationEligibility({
    escalationRequested:
      true,

    complaint:
      "The passenger service problem remains unresolved.",
  });


assert.equal(
  missingEvidence.reason,
  "provider_complaint_evidence_required"
);

assert.equal(
  missingEvidence
    .ncaaEscalationEligible,
  false
);


const referenceEvidence =
  evaluateAviationEscalationEligibility({
    escalationRequested:
      true,

    priorComplaintReference:
      "AIRLINE-TEST-12345",
  });


assert.equal(
  referenceEvidence.reason,
  "eligible_with_provider_reference"
);

assert.equal(
  referenceEvidence
    .ncaaEscalationEligible,
  true
);


const narrativeEvidence =
  evaluateAviationEscalationEligibility({
    escalationRequested:
      true,

    complaint:
      "I complained to the airline through customer care, but it has not responded.",
  });


assert.equal(
  narrativeEvidence
    .ncaaEscalationEligible,
  true
);

assert.equal(
  narrativeEvidence.reason,
  "eligible_with_provider_complaint_evidence"
);


const refusedReference =
  evaluateAviationEscalationEligibility({
    escalationRequested:
      true,

    complaint:
      "The airline refused to provide a complaint reference after I reported the problem.",
  });


assert.equal(
  refusedReference
    .ncaaEscalationEligible,
  true
);

assert.equal(
  refusedReference
    .referenceExceptionClaimed,
  true
);


console.log(
  "✅ AVIATION ESCALATION ELIGIBILITY ENGINE PASSED"
);


for (
  const provider
  of NIGERIAN_AVIATION_PROVIDERS
) {
  const initialRoute =
    resolveAviationRouting({
      sector:
        "aviation",

      complaint:
        "I have a flight delay, cancellation, refund or baggage complaint.",

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
    initialRoute.routeKey,
    "aviation_provider_first"
  );

  assert.equal(
    initialRoute.primaryInstitution,
    provider.name
  );

  assert.equal(
    initialRoute.emailRoutingExpected,
    true
  );

  assert.deepEqual(
    initialRoute.contactEmails,
    provider.contact.emails
  );

  assert.deepEqual(
    initialRoute.contactPhoneNumbers,
    provider.contact.phones
  );

  assert.equal(
    initialRoute.submissionUrl,
    provider.contact.complaint_portal ||
      provider.contact.website
  );

  assert.ok(
    initialRoute.sourceUrls.length
  );


  const vagueEscalation =
    resolveAviationRouting({
      sector:
        "aviation",

      complaint:
        "The passenger service problem remains unresolved.",

      institutionName:
        provider.testInput,

      issueLocation:
        "Nigeria",

      escalationStage:
        "unresolved",

      priorComplaintReference:
        "",

      country:
        "Nigeria",
    });


  assert.equal(
    vagueEscalation.routeKey,
    "aviation_provider_follow_up_evidence_required"
  );

  assert.equal(
    vagueEscalation.primaryInstitution,
    provider.name
  );

  assert.equal(
    vagueEscalation
      .aviationEscalation
      .ncaaEscalationEligible,
    false
  );

  assert.equal(
    vagueEscalation
      .aviationEscalation
      .reason,
    "provider_complaint_evidence_required"
  );


  const referenceEscalation =
    resolveAviationRouting({
      sector:
        "aviation",

      complaint:
        "The passenger complaint remains unresolved.",

      institutionName:
        provider.testInput,

      issueLocation:
        "Nigeria",

      escalationStage:
        "unresolved",

      priorComplaintReference:
        `AVI-${provider.key.toUpperCase()}-12345`,

      country:
        "Nigeria",
    });


  assert.equal(
    referenceEscalation.routeKey,
    "ncaa_consumer_protection"
  );

  assert.equal(
    referenceEscalation.primaryInstitution,
    NCAA_AVIATION_ESCALATION.name
  );

  assert.deepEqual(
    referenceEscalation.ccInstitutions,
    [
      provider.name,
    ]
  );

  assert.equal(
    referenceEscalation.emailRoutingExpected,
    true
  );

  assert.deepEqual(
    referenceEscalation.contactEmails,
    NCAA_AVIATION_ESCALATION
      .contact
      .emails
  );

  assert.equal(
    referenceEscalation.submissionUrl,
    NCAA_AVIATION_ESCALATION
      .contact
      .complaint_portal
  );

  assert.equal(
    referenceEscalation
      .aviationEscalation
      .ncaaEscalationEligible,
    true
  );


  const correspondenceEscalation =
    resolveAviationRouting({
      sector:
        "aviation",

      complaint:
        "I complained to the airline through customer care, but it failed to respond.",

      institutionName:
        provider.testInput,

      issueLocation:
        "Nigeria",

      escalationStage:
        "unresolved",

      priorComplaintReference:
        "",

      country:
        "Nigeria",
    });


  assert.equal(
    correspondenceEscalation.routeKey,
    "ncaa_consumer_protection"
  );

  assert.equal(
    correspondenceEscalation
      .aviationEscalation
      .providerEvidenceNarrativeDetected,
    true
  );


  console.log(
    `✅ ${provider.key.toUpperCase()} PROVIDER, FOLLOW-UP AND NCAA ROUTES PASSED`
  );
}


const unknownName =
  "Example Unregistered International Airline";


const unknownInitial =
  resolveAviationRouting({
    sector:
      "aviation",

    complaint:
      "My flight was cancelled and I require a refund.",

    institutionName:
      unknownName,

    issueLocation:
      "Nigeria",

    escalationStage:
      "initial",

    country:
      "Nigeria",
  });


assert.equal(
  unknownInitial.routeKey,
  "aviation_provider_first"
);

assert.equal(
  unknownInitial.primaryInstitution,
  unknownName
);

assert.equal(
  unknownInitial.emailRoutingExpected,
  false
);

assert.deepEqual(
  unknownInitial.contactEmails,
  []
);

assert.equal(
  unknownInitial.submissionUrl,
  ""
);


const unknownMissingEvidence =
  resolveAviationRouting({
    sector:
      "aviation",

    complaint:
      "The passenger service problem remains unresolved.",

    institutionName:
      unknownName,

    issueLocation:
      "Nigeria",

    escalationStage:
      "unresolved",

    priorComplaintReference:
      "",

    country:
      "Nigeria",
  });


assert.equal(
  unknownMissingEvidence.routeKey,
  "aviation_provider_follow_up_evidence_required"
);

assert.equal(
  unknownMissingEvidence.primaryInstitution,
  unknownName
);

assert.equal(
  unknownMissingEvidence.emailRoutingExpected,
  false
);

assert.deepEqual(
  unknownMissingEvidence.contactEmails,
  []
);


const unknownWithReference =
  resolveAviationRouting({
    sector:
      "aviation",

    complaint:
      "The passenger complaint remains unresolved.",

    institutionName:
      unknownName,

    issueLocation:
      "Nigeria",

    escalationStage:
      "unresolved",

    priorComplaintReference:
      "UNKNOWN-AIR-12345",

    country:
      "Nigeria",
  });


assert.equal(
  unknownWithReference.routeKey,
  "ncaa_consumer_protection"
);

assert.deepEqual(
  unknownWithReference.ccInstitutions,
  [
    unknownName,
  ]
);


console.log(
  "✅ UNKNOWN AIRLINES REMAIN SAFELY ROUTABLE"
);


for (
  const safetyComplaint
  of [
    "There was an aircraft crash near the runway.",

    "The aircraft suffered a loss of separation during flight.",

    "There was smoke in the aircraft cabin.",

    "A structural failure affecting safety occurred during the flight.",

    "There was a dangerous goods occurrence on board.",

    "The aircraft experienced controlled flight into terrain.",
  ]
) {
  const route =
    resolveAviationRouting({
      sector:
        "aviation",

      complaint:
        safetyComplaint,

      institutionName:
        "Example Airline",

      issueLocation:
        "Nigeria",

      escalationStage:
        "initial",

      country:
        "Nigeria",
    });


  assert.equal(
    route.routeKey,
    "nsib_accident_or_serious_incident"
  );

  assert.equal(
    route.primaryInstitution,
    NSIB_AVIATION_SAFETY.name
  );

  assert.equal(
    route.caseType,
    "aviation_safety"
  );

  assert.equal(
    route.emailRoutingExpected,
    true
  );

  assert.deepEqual(
    route.contactEmergencyPhoneNumbers,
    NSIB_AVIATION_SAFETY
      .contact
      .emergency_phones
  );

  assert.equal(
    route.submissionUrl,
    NSIB_AVIATION_SAFETY
      .contact
      .reporting_portal
  );
}


console.log(
  "✅ OFFICIAL NSIB SAFETY OCCURRENCES BYPASS CONSUMER ESCALATION"
);


const ordinaryDelay =
  resolveAviationRouting({
    sector:
      "aviation",

    complaint:
      "My flight was delayed for three hours and I need compensation.",

    institutionName:
      "Air Peace",

    issueLocation:
      "Nigeria",

    escalationStage:
      "initial",

    country:
      "Nigeria",
  });


assert.equal(
  ordinaryDelay.routeKey,
  "aviation_provider_first"
);

assert.equal(
  ordinaryDelay.primaryInstitution,
  "Air Peace Limited"
);


console.log(
  "✅ ORDINARY PASSENGER COMPLAINTS DO NOT ROUTE TO NSIB"
);

console.log(
  "✅ PREMATURE NCAA ESCALATION IS BLOCKED"
);

console.log(
  "✅ AIRLINE COMPLAINT EVIDENCE AND REFERENCE EXCEPTIONS ARE SUPPORTED"
);

console.log(
  "✅ AVIATION ROUTING-QUALITY CONTRACT PASSED"
);

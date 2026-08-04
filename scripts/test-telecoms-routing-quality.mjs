import assert from "node:assert/strict";
import fs from "node:fs";

import {
  NCC_TELECOM_ESCALATION,
  NIGERIAN_TELECOM_PROVIDERS,
} from "../lib/nigeriaTelecomRegistry.mjs";

import {
  evaluateTelecomEscalationEligibility,
} from "../lib/telecomComplaintEligibility.mjs";

import {
  resolveTelecomRouting,
} from "../lib/regulatedSectorJurisdiction.mjs";


assert.equal(
  NIGERIAN_TELECOM_PROVIDERS.length,
  4
);


const initialEligibility =
  evaluateTelecomEscalationEligibility({
    escalationRequested:
      false,
  });


assert.equal(
  initialEligibility.reason,
  "provider_first"
);

assert.equal(
  initialEligibility
    .nccEscalationEligible,
  false
);


const missingReference =
  evaluateTelecomEscalationEligibility({
    escalationRequested:
      true,

    complaint:
      "I complained previously but the issue remains unresolved.",
  });


assert.equal(
  missingReference.reason,
  "operator_reference_required"
);

assert.equal(
  missingReference
    .nccEscalationEligible,
  false
);


const validReference =
  evaluateTelecomEscalationEligibility({
    escalationRequested:
      true,

    priorComplaintReference:
      "MTN-TEST-12345",
  });


assert.equal(
  validReference
    .nccEscalationEligible,
  true
);

assert.equal(
  validReference.reason,
  "eligible_with_operator_reference"
);


const refusedReference =
  evaluateTelecomEscalationEligibility({
    escalationRequested:
      true,

    complaint:
      "The operator refused to provide a complaint ticket after I reported the problem.",
  });


assert.equal(
  refusedReference
    .nccEscalationEligible,
  true
);

assert.equal(
  refusedReference
    .referenceExceptionClaimed,
  true
);


console.log(
  "✅ TELECOM ESCALATION ELIGIBILITY ENGINE PASSED"
);


for (
  const provider
  of NIGERIAN_TELECOM_PROVIDERS
) {
  const firstComplaint =
    resolveTelecomRouting({
      sector:
        "telecoms",

      complaint:
        "I have a mobile network service complaint.",

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
    firstComplaint.routeKey,
    "telecom_provider_first"
  );

  assert.equal(
    firstComplaint.primaryInstitution,
    provider.name
  );

  assert.equal(
    firstComplaint.emailRoutingExpected,
    true
  );

  assert.deepEqual(
    firstComplaint.contactEmails,
    provider.contact.emails
  );

  assert.deepEqual(
    firstComplaint.contactPhoneNumbers,
    provider.contact.phones
  );

  assert.equal(
    firstComplaint.submissionUrl,
    provider.contact.complaint_portal ||
      provider.contact.website
  );

  assert.ok(
    firstComplaint.sourceUrls.length
  );


  const unresolvedWithoutReference =
    resolveTelecomRouting({
      sector:
        "telecoms",

      complaint:
        "I complained to the operator but the matter remains unresolved.",

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
    unresolvedWithoutReference.routeKey,
    "telecom_provider_follow_up_reference_required"
  );

  assert.equal(
    unresolvedWithoutReference.primaryInstitution,
    provider.name
  );

  assert.notEqual(
    unresolvedWithoutReference.primaryInstitution,
    NCC_TELECOM_ESCALATION.name
  );

  assert.equal(
    unresolvedWithoutReference
      .telecomEscalation
      .nccEscalationEligible,
    false
  );

  assert.equal(
    unresolvedWithoutReference
      .telecomEscalation
      .reason,
    "operator_reference_required"
  );


  const unresolvedWithReference =
    resolveTelecomRouting({
      sector:
        "telecoms",

      complaint:
        "I complained to the operator but the matter remains unresolved.",

      institutionName:
        provider.testInput,

      issueLocation:
        "Nigeria",

      escalationStage:
        "unresolved",

      priorComplaintReference:
        `TEL-${provider.key.toUpperCase()}-12345`,

      country:
        "Nigeria",
    });


  assert.equal(
    unresolvedWithReference.routeKey,
    "ncc_consumer_portal"
  );

  assert.equal(
    unresolvedWithReference.primaryInstitution,
    NCC_TELECOM_ESCALATION.name
  );

  assert.deepEqual(
    unresolvedWithReference.ccInstitutions,
    [
      provider.name,
    ]
  );

  assert.equal(
    unresolvedWithReference.emailRoutingExpected,
    false
  );

  assert.deepEqual(
    unresolvedWithReference.contactEmails,
    []
  );

  assert.deepEqual(
    unresolvedWithReference.contactPhoneNumbers,
    NCC_TELECOM_ESCALATION
      .contact
      .phones
  );

  assert.equal(
    unresolvedWithReference.submissionUrl,
    NCC_TELECOM_ESCALATION
      .contact
      .complaint_portal
  );

  assert.equal(
    unresolvedWithReference
      .telecomEscalation
      .nccEscalationEligible,
    true
  );


  const refusedTicket =
    resolveTelecomRouting({
      sector:
        "telecoms",

      complaint:
        "I reported the problem, but the operator refused to provide a complaint ticket and the issue remains unresolved.",

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
    refusedTicket.routeKey,
    "ncc_consumer_portal"
  );

  assert.equal(
    refusedTicket
      .telecomEscalation
      .referenceExceptionClaimed,
    true
  );


  console.log(
    `✅ ${provider.key.toUpperCase()} PROVIDER, FOLLOW-UP AND NCC ROUTES PASSED`
  );
}


const unknownName =
  "Example Unregistered Mobile Network Limited";


const unknownInitial =
  resolveTelecomRouting({
    sector:
      "telecoms",

    complaint:
      "I have a mobile network complaint.",

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
  "telecom_provider_first_unverified_channel"
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


const unknownMissingReference =
  resolveTelecomRouting({
    sector:
      "telecoms",

    complaint:
      "I complained but the issue remains unresolved.",

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
  unknownMissingReference.routeKey,
  "telecom_provider_follow_up_reference_required"
);

assert.equal(
  unknownMissingReference.primaryInstitution,
  unknownName
);

assert.equal(
  unknownMissingReference.emailRoutingExpected,
  false
);

assert.deepEqual(
  unknownMissingReference.contactEmails,
  []
);


const unknownWithReference =
  resolveTelecomRouting({
    sector:
      "telecoms",

    complaint:
      "I complained but the issue remains unresolved.",

    institutionName:
      unknownName,

    issueLocation:
      "Nigeria",

    escalationStage:
      "unresolved",

    priorComplaintReference:
      "UNKNOWN-TEL-12345",

    country:
      "Nigeria",
  });


assert.equal(
  unknownWithReference.routeKey,
  "ncc_consumer_portal"
);

assert.deepEqual(
  unknownWithReference.ccInstitutions,
  [
    unknownName,
  ]
);

assert.equal(
  unknownWithReference.emailRoutingExpected,
  false
);

assert.equal(
  unknownWithReference.submissionUrl,
  NCC_TELECOM_ESCALATION
    .contact
    .complaint_portal
);


console.log(
  "✅ UNKNOWN TELECOM PROVIDERS REMAIN SAFE"
);


const nationwideLocations = [
  "Abia",
  "Adamawa",
  "Akwa Ibom",
  "Anambra",
  "Bauchi",
  "Bayelsa",
  "Benue",
  "Borno",
  "Cross River",
  "Delta",
  "Ebonyi",
  "Edo",
  "Ekiti",
  "Enugu",
  "Gombe",
  "Imo",
  "Jigawa",
  "Kaduna",
  "Kano",
  "Katsina",
  "Kebbi",
  "Kogi",
  "Kwara",
  "Lagos",
  "Nasarawa",
  "Niger",
  "Ogun",
  "Ondo",
  "Osun",
  "Oyo",
  "Plateau",
  "Rivers",
  "Sokoto",
  "Taraba",
  "Yobe",
  "Zamfara",
  "FCT",
];


for (
  const location
  of nationwideLocations
) {
  const route =
    resolveTelecomRouting({
      sector:
        "telecoms",

      complaint:
        "I have an MTN mobile network complaint.",

      institutionName:
        "MTN",

      issueLocation:
        location,

      escalationStage:
        "initial",

      country:
        "Nigeria",
    });

  assert.equal(
    route.routeKey,
    "telecom_provider_first",
    `${location}: telecom route changed`
  );

  assert.equal(
    route.primaryInstitution,
    "MTN Nigeria Communications Plc",
    `${location}: wrong provider`
  );
}


console.log(
  "✅ ALL 36 STATES AND THE FCT USE THE NATIONAL TELECOM ROUTE"
);


const catalogue =
  JSON.parse(
    fs.readFileSync(
      "data/telecoms.json",
      "utf8"
    )
  );


assert.equal(
  catalogue.players.length,
  4
);

assert.equal(
  catalogue.regulators.length,
  1
);


for (
  const provider
  of NIGERIAN_TELECOM_PROVIDERS
) {
  const catalogueRecord =
    catalogue.players.find(
      item =>
        item.key ===
        provider.key
    );

  assert.ok(
    catalogueRecord,
    `${provider.key}: catalogue record missing`
  );

  assert.deepEqual(
    catalogueRecord.contact.emails,
    provider.contact.emails
  );

  assert.deepEqual(
    catalogueRecord.contact.phones,
    provider.contact.phones
  );

  assert.deepEqual(
    catalogueRecord
      .verification
      .source_urls,
    provider
      .verification
      .source_urls
  );
}


console.log(
  "✅ TELECOM CATALOGUE AND RUNTIME REGISTRY ARE SYNCHRONISED"
);

console.log(
  "✅ NCC PORTAL-ONLY ESCALATION IS ENFORCED"
);

console.log(
  "✅ PREMATURE NCC ESCALATION IS BLOCKED"
);

console.log(
  "✅ OPERATOR REFERENCE-REFUSAL EXCEPTION IS SUPPORTED"
);

console.log(
  "✅ TELECOM ROUTING-QUALITY CONTRACT PASSED"
);

import assert from "node:assert/strict";

import {
  NIGERIAN_DIPLOMATIC_MISSION_DIRECTORY,
  MFA_CONSULAR_SERVICES,
  NIDCOM_DIASPORA_SUPPORT,
  NIS_PASSPORT_SUPPORT,
  NAPTIP_TRAFFICKING_REPORT,
  NIGERIAN_DIASPORA_AUTHORITIES,
  NIGERIAN_DIASPORA_DETECTION_KEYWORDS,
} from "../lib/nigeriaDiasporaRegistry.mjs";

import {
  assessInstitutionContactVerification,
} from "../lib/nationalSectorPolicy.mjs";

import {
  resolveDiasporaRouting,
} from "../lib/finalSectorJurisdiction.mjs";

assert.equal(
  NIGERIAN_DIASPORA_AUTHORITIES.length,
  5
);

assert.equal(
  new Set(
    NIGERIAN_DIASPORA_AUTHORITIES.map(
      authority => authority.key
    )
  ).size,
  5
);

assert.equal(
  NIGERIAN_DIPLOMATIC_MISSION_DIRECTORY
    .country_specific,
  true
);

assert.equal(
  NIGERIAN_DIPLOMATIC_MISSION_DIRECTORY
    .contact
    .emails
    .length,
  0
);

assert.ok(
  NIGERIAN_DIPLOMATIC_MISSION_DIRECTORY
    .contact
    .mission_directory
);

console.log(
  "✅ FIVE VERIFIED NATIONAL DIASPORA AUTHORITIES ARE REGISTERED"
);

console.log(
  "✅ MISSION DIRECTORY REMAINS PORTAL-ONLY WITHOUT A GUESSED EMAIL"
);

for (
  const authority
  of [
    MFA_CONSULAR_SERVICES,
    NIDCOM_DIASPORA_SUPPORT,
    NIS_PASSPORT_SUPPORT,
    NAPTIP_TRAFFICKING_REPORT,
  ]
) {
  const assessment =
    assessInstitutionContactVerification({
      institution: authority,

      sectorData: {
        verification_policy: {
          official_sources_only: true,
        },
      },
    });

  assert.equal(
    assessment.directContactAllowed,
    true,
    authority.key
  );

  assert.ok(
    authority.contact.emails.length > 0,
    authority.key
  );

  assert.ok(
    authority.verification.source_urls.length > 0,
    authority.key
  );
}

console.log(
  "✅ FOUR VERIFIED DIRECT-CONTACT DIASPORA AUTHORITIES ARE AVAILABLE"
);

const emergency =
  resolveDiasporaRouting({
    issueLocation:
      "South Africa",

    complaint:
      "I am currently under attack and my life is in immediate danger.",
  });

assert.equal(
  emergency.routeKey,
  "diaspora_immediate_emergency"
);

assert.equal(
  emergency.blockGeneration,
  true
);

assert.equal(
  emergency.emailRoutingExpected,
  false
);

assert.ok(
  emergency.ccInstitutions.includes(
    NIGERIAN_DIPLOMATIC_MISSION_DIRECTORY.name
  )
);

console.log(
  "✅ ACTIVE DIASPORA EMERGENCY BLOCKS ORDINARY PETITION GENERATION"
);

const trafficking =
  resolveDiasporaRouting({
    issueLocation:
      "Saudi Arabia",

    complaint:
      "A deceptive recruiter seized my passport and I am being forced to work against my will.",
  });

assert.equal(
  trafficking.routeKey,
  "naptip_diaspora_trafficking"
);

assert.equal(
  trafficking.primaryInstitution,
  NAPTIP_TRAFFICKING_REPORT.name
);

assert.ok(
  trafficking.ccInstitutions.includes(
    NIDCOM_DIASPORA_SUPPORT.name
  )
);

assert.ok(
  trafficking.ccInstitutions.includes(
    NIGERIAN_DIPLOMATIC_MISSION_DIRECTORY.name
  )
);

assert.equal(
  trafficking.submissionUrl,
  NAPTIP_TRAFFICKING_REPORT
    .contact
    .incident_reporting
);

console.log(
  "✅ TRAFFICKING AND EXPLOITATION ROUTE TO NAPTIP"
);

const passportFirst =
  resolveDiasporaRouting({
    issueLocation:
      "United Kingdom",

    complaint:
      "My Nigerian passport expired and I need passport renewal abroad.",
  });

assert.equal(
  passportFirst.routeKey,
  "nearest_nigerian_mission_passport"
);

assert.equal(
  passportFirst.primaryInstitution,
  NIGERIAN_DIPLOMATIC_MISSION_DIRECTORY.name
);

assert.equal(
  passportFirst.submissionUrl,
  NIGERIAN_DIPLOMATIC_MISSION_DIRECTORY
    .contact
    .mission_directory
);

console.log(
  "✅ FIRST-STAGE PASSPORT REQUEST ROUTES TO THE NEAREST NIGERIAN MISSION"
);

const passportEscalation =
  resolveDiasporaRouting({
    issueLocation:
      "United Kingdom",

    escalationStage:
      "unresolved",

    priorComplaintReference:
      "NIS-PASSPORT-12345",

    complaint:
      "My passport renewal abroad remains unresolved after my earlier complaint.",
  });

assert.equal(
  passportEscalation.routeKey,
  "nis_diaspora_passport_escalation"
);

assert.equal(
  passportEscalation.primaryInstitution,
  NIS_PASSPORT_SUPPORT.name
);

assert.ok(
  passportEscalation.ccInstitutions.includes(
    NIGERIAN_DIPLOMATIC_MISSION_DIRECTORY.name
  )
);

assert.equal(
  passportEscalation.submissionUrl,
  NIS_PASSPORT_SUPPORT
    .contact
    .contact_page
);

console.log(
  "✅ UNRESOLVED PASSPORT COMPLAINT ROUTES TO NIS"
);

const consularWelfare =
  resolveDiasporaRouting({
    issueLocation:
      "Malaysia",

    complaint:
      "I am a stranded Nigerian abroad and require diaspora welfare and consular assistance.",
  });

assert.equal(
  consularWelfare.routeKey,
  "nigerian_mission_consular_welfare"
);

assert.equal(
  consularWelfare.primaryInstitution,
  NIGERIAN_DIPLOMATIC_MISSION_DIRECTORY.name
);

assert.ok(
  consularWelfare.ccInstitutions.includes(
    NIDCOM_DIASPORA_SUPPORT.name
  )
);

assert.equal(
  consularWelfare.submissionUrl,
  NIGERIAN_DIPLOMATIC_MISSION_DIRECTORY
    .contact
    .mission_directory
);

console.log(
  "✅ COUNTRY-SPECIFIC CONSULAR WELFARE ROUTES TO THE NEAREST NIGERIAN MISSION"
);

const diasporaCoordination =
  resolveDiasporaRouting({
    issueLocation:
      "Malaysia",

    complaint:
      "I am submitting a general diaspora coordination report concerning Nigerians resident in Malaysia.",
  });

assert.equal(
  diasporaCoordination.routeKey,
  "nidcom_diaspora_report"
);

assert.equal(
  diasporaCoordination.primaryInstitution,
  NIDCOM_DIASPORA_SUPPORT.name
);

assert.ok(
  diasporaCoordination.ccInstitutions.includes(
    MFA_CONSULAR_SERVICES.name
  )
);

assert.equal(
  diasporaCoordination.submissionUrl,
  NIDCOM_DIASPORA_SUPPORT
    .contact
    .contact_page
);

console.log(
  "✅ GENERAL DIASPORA COORDINATION ROUTES TO NIDCOM"
);

for (
  const keyword
  of [
    "Nigerian abroad",
    "consular assistance",
    "stranded Nigerian",
    "passport renewal abroad",
    "human trafficking",
    "NiDCOM",
    "NIS",
    "NAPTIP",
  ]
) {
  assert.ok(
    NIGERIAN_DIASPORA_DETECTION_KEYWORDS.includes(
      keyword
    ),
    keyword
  );
}

for (
  const wrongKeyword
  of [
    "electricity token",
    "airline baggage",
    "hospital insurance",
    "school transcript",
  ]
) {
  assert.equal(
    NIGERIAN_DIASPORA_DETECTION_KEYWORDS.includes(
      wrongKeyword
    ),
    false,
    wrongKeyword
  );
}

console.log(
  "✅ NATIONAL DIASPORA DETECTION KEYWORDS ARE CLEAN"
);

console.log(
  "✅ DIASPORA AND CONSULAR MATTERS ARE NOW PROTECTED BY NATIONAL REGRESSION TESTS"
);

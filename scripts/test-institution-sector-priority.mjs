import assert from "node:assert/strict";

import {
  detectInstitutionSector,
} from "../lib/institutionSectorPriority.mjs";

import {
  resolveJurisdictionRouting,
} from "../lib/jurisdictionEngine.mjs";

const cases = [
  [
    "First bank",
    "banking",
  ],
  [
    "FirstBank",
    "banking",
  ],
  [
    "TAJBank",
    "banking",
  ],
  [
    "AEDC",
    "power",
  ],
  [
    "MTN",
    "telecoms",
  ],
  [
    "Air Peace",
    "aviation",
  ],
];

for (
  const [
    institutionName,
    expectedSector,
  ]
  of cases
) {
  const detected =
    detectInstitutionSector(
      institutionName
    );

  assert.equal(
    detected.matched,
    true,
    `${institutionName} was not detected`
  );

  assert.equal(
    detected.sector,
    expectedSector,
    `${institutionName} selected the wrong sector`
  );
}

const firstBankSector =
  detectInstitutionSector(
    "First bank"
  );

const firstComplaint =
  resolveJurisdictionRouting({
    sector:
      firstBankSector.sector,

    institutionName:
      "First bank",

    complaint:
      "I have been unable to withdraw from my account for five days.",

    issueLocation:
      "Lokoja",

    escalationStage:
      "initial",

    country:
      "Nigeria",
  });

assert.equal(
  firstComplaint.matched,
  true
);

assert.equal(
  firstComplaint.sector,
  "banking"
);

assert.equal(
  firstComplaint.routeKey,
  "bank_provider_first"
);

assert.equal(
  firstComplaint.primaryInstitution,
  "First Bank of Nigeria Limited"
);

assert.equal(
  /Public Complaints Commission/i
    .test(
      firstComplaint
        .primaryInstitution
    ),
  false
);

const unresolvedComplaint =
  resolveJurisdictionRouting({
    sector:
      firstBankSector.sector,

    institutionName:
      "First bank",

    complaint:
      "My earlier bank complaint remains unresolved.",

    issueLocation:
      "Lokoja",

    escalationStage:
      "unresolved",

    priorComplaintDate:
      "2026-01-01",

    bankingComplaintType:
      "general_banking",

    priorComplaintReference:
      "TEST-REF-123",

    country:
      "Nigeria",
  });

assert.equal(
  unresolvedComplaint.matched,
  true
);

assert.equal(
  unresolvedComplaint.routeKey,
  "cbn_consumer_protection"
);

assert.equal(
  unresolvedComplaint.primaryInstitution,
  "Central Bank of Nigeria (CBN)"
);

console.log(
  "✅ INSTITUTION-TO-JURISDICTION PIPELINE PASSED"
);

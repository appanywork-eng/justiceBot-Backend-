import assert from "node:assert/strict";

import {
  assertPetitionSemanticQuality,
  inspectPetitionSemanticQuality,
} from "../lib/petitionSemanticQuality.mjs";

const complaint = [
  "VeendHQ provided a Remita payroll loan of 227000.",
  "In December 2025, N60000 was deducted even though the expected repayment was 43000.",
  "The petitioner alleges that the deduction was unexplained and supplied account records.",
].join(" ");

const safeDraft = `
TO: VeendHQ
CC: Remita, Public Complaints Commission (PCC)
SUBJECT: Petition concerning disputed payroll-loan deductions

FACTS / BACKGROUND:
1. The petitioner alleges that VeendHQ provided a Remita payroll loan of ₦227,000.
2. In December 2025, ₦60,000 was deducted although the expected repayment was ₦43,000.

LEGAL FRAMEWORK & GROUNDS:
- The allegations should be investigated against the applicable verified records.

DEMANDS / RELIEFS SOUGHT:
1. Reconcile the loan and deduction records.
`;

assert.deepEqual(
  inspectPetitionSemanticQuality({
    petitionText: safeDraft,
    complaint,
    institutionName: "VeendHQ",
    primaryInstitution: "VeendHQ",
    ccInstitutions: [
      "Remita",
      "Public Complaints Commission (PCC)",
    ],
  }),
  {
    complete: true,
    missingMaterialFacts: [],
    routingErrors: [],
  }
);

const omittedAmount = safeDraft.replace(
  "₦60,000",
  "the disputed amount"
);

assert.throws(
  () =>
    assertPetitionSemanticQuality({
      petitionText: omittedAmount,
      complaint,
      institutionName: "VeendHQ",
      primaryInstitution: "VeendHQ",
      ccInstitutions: [
        "Remita",
        "Public Complaints Commission (PCC)",
      ],
    }),
  error =>
    error.code ===
      "PETITION_SEMANTIC_QUALITY_FAILED" &&
    error.assessment.missingMaterialFacts.includes(
      "amount:60000"
    )
);

const kercMisdirection = safeDraft.replace(
  "TO: VeendHQ",
  "TO: Kogi State Electricity Regulatory Commission"
);

assert.throws(
  () =>
    assertPetitionSemanticQuality({
      petitionText: kercMisdirection,
      complaint,
      institutionName: "VeendHQ",
      primaryInstitution: "VeendHQ",
      ccInstitutions: [
        "Remita",
        "Public Complaints Commission (PCC)",
      ],
    }),
  error =>
    error.assessment.routingErrors.includes(
      "primary_recipient_header_mismatch"
    )
);

const duplicatedRecipient = safeDraft.replace(
  "CC: Remita, Public Complaints Commission (PCC)",
  "CC: VeendHQ, Remita, Public Complaints Commission (PCC)"
);

assert.equal(
  inspectPetitionSemanticQuality({
    petitionText: duplicatedRecipient,
    complaint,
    institutionName: "VeendHQ",
    primaryInstitution: "VeendHQ",
    ccInstitutions: [
      "Remita",
      "Public Complaints Commission (PCC)",
    ],
  }).routingErrors.includes("to_cc_duplicate"),
  true
);

const multiLineCcDraft = safeDraft.replace(
  "CC: Remita, Public Complaints Commission (PCC)",
  [
    "CC: Remita",
    "Address: Plot 123, Test Avenue, Abuja",
    "CC: Public Complaints Commission (PCC)",
    "Address: Headquarters, Abuja",
    "CC: Nigeria Data Protection Commission (NDPC)",
  ].join("\n")
);

assert.deepEqual(
  inspectPetitionSemanticQuality({
    petitionText: multiLineCcDraft,
    complaint,
    institutionName: "VeendHQ",
    primaryInstitution: "VeendHQ",
    ccInstitutions: [
      "Remita",
      "Public Complaints Commission (PCC)",
      "Nigeria Data Protection Commission (NDPC)",
    ],
  }),
  {
    complete: true,
    missingMaterialFacts: [],
    routingErrors: [],
  }
);

console.log("✅ MATERIAL AMOUNTS MUST SURVIVE THE FINAL DRAFT");
console.log("✅ THE NAMED INSTITUTION MUST APPEAR IN THE PETITION");
console.log("✅ FINAL TO MUST MATCH THE DETERMINISTIC PRIMARY RECIPIENT");
console.log("✅ TO AND CC DUPLICATION FAILS THE FINAL QUALITY GATE");
console.log("✅ MULTI-LINE COMPLEX-CASE CC RECIPIENTS ALL PASS VALIDATION");
console.log("✅ PETITION SEMANTIC QUALITY CONTRACT PASSED");

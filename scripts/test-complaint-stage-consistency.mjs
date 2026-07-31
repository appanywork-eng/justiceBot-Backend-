import assert from "node:assert/strict";

import {
  evaluateComplaintStageConsistency,
} from "../lib/complaintStageConsistency.mjs";

const regulatedSectors = [
  "power",
  "banking",
  "telecoms",
  "aviation",
];

for (
  const sector
  of regulatedSectors
) {
  const contradiction =
    evaluateComplaintStageConsistency({
      complaint:
        `My previous ${sector} complaint under reference TEST-12345 remains unresolved.`,

      escalationStage:
        "initial",

      priorComplaintReference:
        "",
    });

  assert.equal(
    contradiction.ok,
    false,
    `${sector}: contradictory first-stage selection was accepted`
  );

  assert.equal(
    contradiction.code,
    "initial_stage_conflicts_with_narrative"
  );

  console.log(
    `✅ ${sector.toUpperCase()} CONTRADICTORY FIRST-STAGE PETITION IS BLOCKED`
  );
}

const referenceConflict =
  evaluateComplaintStageConsistency({
    complaint:
      "I request assistance concerning this service failure.",

    escalationStage:
      "initial",

    priorComplaintReference:
      "TEST-REFERENCE-12345",
  });

assert.equal(
  referenceConflict.ok,
  false
);

assert.equal(
  referenceConflict.code,
  "initial_stage_with_previous_reference"
);

console.log(
  "✅ FIRST-STAGE PETITION WITH PREVIOUS REFERENCE IS BLOCKED"
);

const reverseConflict =
  evaluateComplaintStageConsistency({
    complaint:
      "This is my first formal complaint and I have never complained before.",

    escalationStage:
      "unresolved",

    priorComplaintReference:
      "",
  });

assert.equal(
  reverseConflict.ok,
  false
);

assert.equal(
  reverseConflict.code,
  "unresolved_stage_conflicts_with_narrative"
);

console.log(
  "✅ FALSE UNRESOLVED ESCALATION IS BLOCKED"
);

const validInitial =
  evaluateComplaintStageConsistency({
    complaint:
      "I purchased an electricity token but it was not issued.",

    escalationStage:
      "initial",

    priorComplaintReference:
      "",
  });

assert.equal(
  validInitial.ok,
  true
);

console.log(
  "✅ VALID FIRST COMPLAINT IS ALLOWED"
);

const validUnresolved =
  evaluateComplaintStageConsistency({
    complaint:
      "I previously complained to the company, but the matter remains unresolved.",

    escalationStage:
      "unresolved",

    priorComplaintReference:
      "TEST-EKO-12345",
  });

assert.equal(
  validUnresolved.ok,
  true
);

console.log(
  "✅ VALID UNRESOLVED ESCALATION IS ALLOWED"
);

const inferredStage =
  evaluateComplaintStageConsistency({
    complaint:
      "I complained to customer care and received no response.",

    escalationStage:
      "",

    priorComplaintReference:
      "",
  });

assert.equal(
  inferredStage.ok,
  true
);

assert.equal(
  inferredStage.inferredPriorComplaint,
  true
);

console.log(
  "✅ NARRATIVE-BASED INFERENCE REMAINS AVAILABLE"
);

console.log();
console.log(
  "✅ COMPLAINT-STAGE CONSISTENCY PROTECTION IS NATIONWIDE"
);

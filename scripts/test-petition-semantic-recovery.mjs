import assert from "node:assert/strict";

import {
  inspectPetitionSemanticQuality,
  repairPetitionSemanticFacts,
} from "../lib/petitionSemanticQuality.mjs";

const complaint = [
  "I obtained a digital loan and the disputed total amount was 229000.",
  "I complained previously, but the matter remains unresolved.",
  "I allege that recovery agents are harassing and defaming me.",
].join(" ");

const priorComplaintReference = "TLOAN-REF-229000";

const draft = `
TO: GIASUN TECHNOLOGY NIGERIA LIMITED
CC: None
SUBJECT: Digital lending complaint

INTRODUCTION:
- I respectfully request investigation of this complaint.

FACTS / BACKGROUND:
1. I obtained a digital loan and dispute the lender's conduct.
2. I allege that recovery agents are harassing and defaming me.

ISSUES FOR DETERMINATION:
1. Whether the complaint should be investigated.

LEGAL FRAMEWORK & GROUNDS:
- The allegations remain subject to verification.

DEMANDS / RELIEFS SOUGHT:
1. Investigate and provide appropriate redress.

NOTICE & ESCALATION:
- I reserve the right to use lawful escalation channels.

LIST OF ATTACHMENTS (if any):
- Available correspondence.

Yours faithfully,
Test User
08000000000
test@example.com
`;

const before = inspectPetitionSemanticQuality({
  petitionText: draft,
  complaint,
  institutionName: "GIASUN TECHNOLOGY NIGERIA LIMITED",
  priorComplaintReference,
  primaryInstitution: "GIASUN TECHNOLOGY NIGERIA LIMITED",
  ccInstitutions: [],
});

assert.equal(before.complete, false);
assert.ok(before.missingMaterialFacts.includes("amount:229000"));
assert.ok(before.missingMaterialFacts.includes("priorComplaintReference"));

const repaired = repairPetitionSemanticFacts({
  petitionText: draft,
  complaint,
  institutionName: "GIASUN TECHNOLOGY NIGERIA LIMITED",
  priorComplaintReference,
  primaryInstitution: "GIASUN TECHNOLOGY NIGERIA LIMITED",
  ccInstitutions: [],
});

assert.equal(repaired.repaired, true);
assert.equal(repaired.assessment.complete, true);
assert.match(repaired.text, /229000/);
assert.match(repaired.text, /TLOAN-REF-229000/);
assert.match(
  repaired.text,
  /The petitioner states:/i,
  "Recovered complaint facts must remain explicitly attributed to the petitioner"
);


const documentPurpose =
  "Digital lending complaint investigation and consumer redress";

const naturalReliefDraft =
  draft.replace(
    "1. Investigate and provide appropriate redress.",
    "1. Rectify any verified error, compensate the petitioner for any established loss, and explain the outcome in writing."
  );

const naturalReliefAssessment =
  inspectPetitionSemanticQuality({
    petitionText:
      naturalReliefDraft,

    complaint,

    institutionName:
      "GIASUN TECHNOLOGY NIGERIA LIMITED",

    primaryInstitution:
      "GIASUN TECHNOLOGY NIGERIA LIMITED",

    ccInstitutions:
      [],

    documentPurpose,
  });

assert.equal(
  naturalReliefAssessment
    .routingErrors
    .includes(
      "actionable_remedy_missing"
    ),
  false,
  "Valid natural-language remedies must not be rejected solely because Gemini used different verbs"
);

const naturalSubjectDraft =
  naturalReliefDraft.replace(
    "SUBJECT: Digital lending complaint",
    "SUBJECT: Unexpected salary deductions and harassment"
  );

const naturalSubjectBefore =
  inspectPetitionSemanticQuality({
    petitionText:
      naturalSubjectDraft,

    complaint,

    institutionName:
      "GIASUN TECHNOLOGY NIGERIA LIMITED",

    priorComplaintReference,

    primaryInstitution:
      "GIASUN TECHNOLOGY NIGERIA LIMITED",

    ccInstitutions:
      [],

    documentPurpose,
  });

assert.ok(
  naturalSubjectBefore
    .routingErrors
    .includes(
      "subject_purpose_mismatch"
    ),
  "The quality engine must still detect a mismatched AI subject"
);

const naturalSubjectRepair =
  repairPetitionSemanticFacts({
    petitionText:
      naturalSubjectDraft,

    complaint,

    institutionName:
      "GIASUN TECHNOLOGY NIGERIA LIMITED",

    priorComplaintReference,

    primaryInstitution:
      "GIASUN TECHNOLOGY NIGERIA LIMITED",

    ccInstitutions:
      [],

    documentPurpose,
  });

assert.equal(
  naturalSubjectRepair.repaired,
  true
);

assert.equal(
  naturalSubjectRepair
    .assessment
    .complete,
  true
);

assert.ok(
  naturalSubjectRepair.text.includes(
    "SUBJECT: " +
    documentPurpose
  ),
  "The mismatched AI subject must be replaced with PetitionDesk's deterministic subject"
);

assert.ok(
  naturalSubjectRepair.repairs.includes(
    "subject_purpose_repaired"
  )
);

const badRoute = draft.replace(
  "TO: GIASUN TECHNOLOGY NIGERIA LIMITED",
  "TO: Nigerian Civil Aviation Authority"
);

const unsafe = repairPetitionSemanticFacts({
  petitionText: badRoute,
  complaint,
  institutionName: "GIASUN TECHNOLOGY NIGERIA LIMITED",
  priorComplaintReference,
  primaryInstitution: "GIASUN TECHNOLOGY NIGERIA LIMITED",
  ccInstitutions: [],
});

assert.equal(unsafe.repaired, false);
assert.ok(
  unsafe.assessment.routingErrors.includes(
    "primary_recipient_header_mismatch"
  ),
  "Routing errors must never be hidden by material-fact recovery"
);

console.log("✅ OMITTED MATERIAL AMOUNT IS RECOVERED FROM THE SUPPLIED COMPLAINT");
console.log("✅ PRIOR COMPLAINT REFERENCE IS RECOVERED EXACTLY");
console.log("✅ RECOVERED FACTS ARE ATTRIBUTED TO THE PETITIONER");
console.log("✅ ROUTING ERRORS ARE NEVER AUTO-REPAIRED");
console.log("✅ PETITION SEMANTIC RECOVERY CONTRACT PASSED");

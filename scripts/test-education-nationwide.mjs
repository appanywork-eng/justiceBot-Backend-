import assert from "node:assert/strict";

import {
  JAMB_EDUCATION_SUPPORT,
  NECO_EDUCATION_COMPLAINTS,
  WAEC_NIGERIA_COMPLAINTS,
  NUC_UNIVERSITY_GRIEVANCE,
  NBTE_TECHNICAL_EDUCATION_COMPLAINTS,
  NCCE_TEACHER_EDUCATION_COMPLAINTS,
  UBEC_BASIC_EDUCATION_COMPLAINTS,
  NIGERIAN_EDUCATION_AUTHORITIES,
  NIGERIAN_EDUCATION_DETECTION_KEYWORDS,
} from "../lib/nigeriaEducationRegistry.mjs";

import {
  assessInstitutionContactVerification,
} from "../lib/nationalSectorPolicy.mjs";

import {
  resolveEducationRouting,
} from "../lib/publicInstitutionJurisdiction.mjs";

assert.equal(
  NIGERIAN_EDUCATION_AUTHORITIES.length,
  7
);

assert.equal(
  new Set(
    NIGERIAN_EDUCATION_AUTHORITIES.map(
      authority => authority.key
    )
  ).size,
  7
);

for (const authority of NIGERIAN_EDUCATION_AUTHORITIES) {
  assert.equal(
    authority.verification.status,
    "VERIFIED_OFFICIAL_SOURCE",
    authority.key
  );

  assert.ok(
    authority.verification.source_urls.length > 0,
    authority.key
  );

  const emails =
    authority.contact.emails || [];

  if (emails.length > 0) {
    const decision =
      assessInstitutionContactVerification({
        institution: authority,

        sectorData: {
          verification_policy: {
            official_sources_only: true,
          },
        },
      });

    assert.equal(
      decision.directContactAllowed,
      true,
      authority.key
    );
  }
}

assert.ok(
  JAMB_EDUCATION_SUPPORT
    .contact
    .candidate_support
);

assert.ok(
  NECO_EDUCATION_COMPLAINTS
    .contact
    .complaint_portal
);

assert.ok(
  UBEC_BASIC_EDUCATION_COMPLAINTS
    .contact
    .servicom
);

console.log(
  "✅ SEVEN VERIFIED NATIONAL EDUCATION AUTHORITIES ARE REGISTERED"
);

const cases = [
  {
    name: "JAMB SUPPORT",

    context: {
      institutionName: "JAMB",
      complaint:
        "My CAPS admission status has not been corrected.",
      country: "Nigeria",
    },

    route: "jamb_support_ticket",
    primary:
      JAMB_EDUCATION_SUPPORT.name,
  },

  {
    name: "NECO COMPLAINT",

    context: {
      institutionName: "NECO",
      complaint:
        "My NECO examination result is unavailable.",
      country: "Nigeria",
    },

    route: "neco_complaint_portal",
    primary:
      NECO_EDUCATION_COMPLAINTS.name,
  },

  {
    name: "WAEC SCHOOL CANDIDATE",

    context: {
      institutionName: "WAEC",
      complaint:
        "I am a school candidate and my WAEC result was withheld.",
      country: "Nigeria",
    },

    route: "waec_school_principal",

    primary:
      "The Candidate's School Principal or Examination Officer",
  },

  {
    name: "WAEC PRIVATE CANDIDATE",

    context: {
      institutionName: "WAEC",
      complaint:
        "I am a private candidate with a WASSCE result complaint.",
      country: "Nigeria",
    },

    route: "waec_candidate_channel",
    primary:
      WAEC_NIGERIA_COMPLAINTS.name,
  },

  {
    name: "INSTITUTION FIRST",

    context: {
      institutionName:
        "University of Abuja",

      complaint:
        "My transcript has been delayed.",

      escalationStage: "initial",
      country: "Nigeria",
    },

    route:
      "education_institution_first",

    primary:
      "University of Abuja",
  },

  {
    name: "NUC ESCALATION",

    context: {
      institutionName:
        "University of Abuja",

      complaint:
        "My university transcript remains delayed after internal complaints.",

      escalationStage: "unresolved",

      priorComplaintReference:
        "UNI-123",

      country: "Nigeria",
    },

    route:
      "nuc_grievance_escalation",

    primary:
      NUC_UNIVERSITY_GRIEVANCE.name,
  },

  {
    name: "NBTE ESCALATION",

    context: {
      institutionName:
        "Federal Polytechnic Bida",

      complaint:
        "The polytechnic has withheld my HND certificate after repeated complaints.",

      escalationStage: "unresolved",

      priorComplaintReference:
        "POLY-123",

      country: "Nigeria",
    },

    route:
      "nbte_complaint_escalation",

    primary:
      NBTE_TECHNICAL_EDUCATION_COMPLAINTS.name,
  },

  {
    name: "NCCE ESCALATION",

    context: {
      institutionName:
        "Federal College of Education Zaria",

      complaint:
        "My college of education has not resolved my NCE programme complaint.",

      escalationStage: "unresolved",

      priorComplaintReference:
        "NCE-123",

      country: "Nigeria",
    },

    route:
      "ncce_complaint_escalation",

    primary:
      NCCE_TEACHER_EDUCATION_COMPLAINTS.name,
  },

  {
    name: "UBEC ESCALATION",

    context: {
      institutionName:
        "Example Public Primary School",

      complaint:
        "This public primary school and SUBEB have not resolved the basic education complaint.",

      escalationStage: "unresolved",

      priorComplaintReference:
        "UBE-123",

      country: "Nigeria",
    },

    route:
      "ubec_basic_education_channel",

    primary:
      UBEC_BASIC_EDUCATION_COMPLAINTS.name,
  },
];

for (const test of cases) {
  const result =
    resolveEducationRouting(
      test.context
    );

  assert.equal(
    result.matched,
    true,
    test.name
  );

  assert.equal(
    result.routeKey,
    test.route,
    test.name
  );

  assert.equal(
    result.primaryInstitution,
    test.primary,
    test.name
  );

  console.log(
    `✅ ${test.name} ROUTES CORRECTLY`
  );
}

const regulatorFirst =
  resolveEducationRouting({
    institutionName:
      NUC_UNIVERSITY_GRIEVANCE.name,

    complaint:
      "I want to submit a first complaint about delayed service.",

    escalationStage: "initial",
    country: "Nigeria",
  });

assert.equal(
  regulatorFirst.matched,
  false
);

console.log(
  "✅ NUC CANNOT BE MISUSED AS THE FIRST-STAGE EDUCATION PROVIDER"
);

for (const keyword of [
  "school",
  "university",
  "JAMB",
  "WAEC",
  "NECO",
  "college of education",
  "primary school",
  "transcript delay",
]) {
  assert.ok(
    NIGERIAN_EDUCATION_DETECTION_KEYWORDS.includes(
      keyword
    ),
    keyword
  );
}

for (const wrongKeyword of [
  "hospital",
  "airline",
  "bank transfer",
  "electricity token",
]) {
  assert.equal(
    NIGERIAN_EDUCATION_DETECTION_KEYWORDS.includes(
      wrongKeyword
    ),
    false,
    wrongKeyword
  );
}

console.log(
  "✅ NATIONAL EDUCATION DETECTION KEYWORDS ARE CLEAN"
);

console.log(
  "✅ EDUCATION IS NOW PROTECTED BY NATIONAL REGRESSION TESTS"
);

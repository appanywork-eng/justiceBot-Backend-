import assert from "node:assert/strict";

import {
  NHIA_HEALTH_INSURANCE_ESCALATION,
  MDCN_MEDICAL_DISCIPLINE,
  NMCN_NURSING_DISCIPLINE,
  PCN_PHARMACY_DISCIPLINE,
  MLSCN_LABORATORY_DISCIPLINE,
  NAFDAC_MEDICAL_PRODUCT_SAFETY,
  NHRC_HEALTH_RIGHTS,
  FCCPC_HEALTH_CONSUMER_ESCALATION,
  NIGERIAN_HEALTH_AUTHORITIES,
  NIGERIAN_HEALTH_DETECTION_KEYWORDS,
} from "../lib/nigeriaHealthRegistry.mjs";

import {
  assessInstitutionContactVerification,
} from "../lib/nationalSectorPolicy.mjs";

import {
  resolveHealthRouting,
} from "../lib/publicInstitutionJurisdiction.mjs";

assert.equal(
  NIGERIAN_HEALTH_AUTHORITIES.length,
  8
);

for (const authority of NIGERIAN_HEALTH_AUTHORITIES) {
  const result =
    assessInstitutionContactVerification({
      institution: authority,
      sectorData: {
        verification_policy: {
          official_sources_only: true,
        },
      },
    });

  assert.equal(
    result.directContactAllowed,
    true,
    authority.key
  );

  assert.ok(
    authority.contact.emails.length > 0,
    authority.key
  );
}

console.log(
  "✅ EIGHT VERIFIED NATIONAL HEALTH AUTHORITIES ARE REGISTERED"
);

const cases = [
  {
    name: "PROVIDER FIRST",
    context: {
      institutionName: "National Hospital Abuja",
      complaint: "The hospital delayed my treatment.",
      escalationStage: "initial",
      country: "Nigeria",
    },
    route: "health_provider_first",
    primary: "National Hospital Abuja",
  },
  {
    name: "NHIA ESCALATION",
    context: {
      institutionName: "Example HMO",
      complaint: "My unresolved HMO referral authorisation complaint remains unresolved.",
      escalationStage: "unresolved",
      priorComplaintReference: "HMO-123",
      country: "Nigeria",
    },
    route: "nhia_insurance_escalation",
    primary: NHIA_HEALTH_INSURANCE_ESCALATION.name,
  },
  {
    name: "DOCTOR MISCONDUCT",
    context: {
      institutionName: "Example Hospital",
      complaint: "I am reporting medical negligence and doctor misconduct.",
      country: "Nigeria",
    },
    route: "mdcn_practitioner_complaint",
    primary: MDCN_MEDICAL_DISCIPLINE.name,
  },
  {
    name: "QUACK PRACTICE",
    context: {
      institutionName: "Example Clinic",
      complaint: "An unlicensed doctor is operating an illegal hospital.",
      country: "Nigeria",
    },
    route: "mdcn_quack_report",
    primary: MDCN_MEDICAL_DISCIPLINE.name,
  },
  {
    name: "HEALTH RIGHTS",
    context: {
      institutionName: "Example Hospital",
      complaint: "The patient was detained over a hospital bill.",
      country: "Nigeria",
    },
    route: "health_rights_nhrc",
    primary: NHRC_HEALTH_RIGHTS.name,
  },
  {
    name: "CONSUMER ESCALATION",
    context: {
      institutionName: "Example Hospital",
      complaint: "I complained previously about illegal hospital fees but received no response.",
      escalationStage: "unresolved",
      priorComplaintReference: "HOSP-123",
      country: "Nigeria",
    },
    route: "health_consumer_escalation",
    primary: FCCPC_HEALTH_CONSUMER_ESCALATION.name,
  },
];

for (const test of cases) {
  const result =
    resolveHealthRouting(
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

for (const keyword of [
  "hospital",
  "health insurance",
  "medical negligence",
  "nurse",
  "pharmacy",
  "laboratory",
  "counterfeit drug",
]) {
  assert.ok(
    NIGERIAN_HEALTH_DETECTION_KEYWORDS.includes(
      keyword
    ),
    keyword
  );
}

for (const wrongKeyword of [
  "msisdn",
  "sim swap",
  "airtime debit",
]) {
  assert.equal(
    NIGERIAN_HEALTH_DETECTION_KEYWORDS.includes(
      wrongKeyword
    ),
    false,
    wrongKeyword
  );
}

void NMCN_NURSING_DISCIPLINE;
void PCN_PHARMACY_DISCIPLINE;
void MLSCN_LABORATORY_DISCIPLINE;
void NAFDAC_MEDICAL_PRODUCT_SAFETY;

console.log(
  "✅ NATIONAL HEALTH DETECTION KEYWORDS ARE CLEAN"
);

console.log(
  "✅ HEALTH AND INSURANCE NATIONAL REGRESSION PASSED"
);

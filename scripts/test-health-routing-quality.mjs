import assert from "node:assert/strict";
import fs from "node:fs";

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
} from "../lib/nigeriaHealthRegistry.mjs";

import {
  evaluateHealthEscalationEligibility,
} from "../lib/healthComplaintEligibility.mjs";

import {
  resolveHealthRouting,
} from "../lib/publicInstitutionJurisdiction.mjs";


assert.equal(
  NIGERIAN_HEALTH_AUTHORITIES.length,
  8
);


for (
  const authority
  of NIGERIAN_HEALTH_AUTHORITIES
) {
  assert.equal(
    authority
      .verification
      .status,
    "VERIFIED_OFFICIAL_SOURCE",
    authority.key
  );

  assert.equal(
    authority
      .verification
      .direct_email_verified,
    true,
    authority.key
  );

  assert.ok(
    authority.contact.emails.length,
    authority.key
  );

  assert.ok(
    authority
      .verification
      .source_urls
      .length,
    authority.key
  );
}


console.log(
  "✅ EIGHT VERIFIED HEALTH AUTHORITIES PASSED"
);


const providerFirst =
  evaluateHealthEscalationEligibility({
    escalationRequested:
      false,
  });

assert.equal(
  providerFirst.reason,
  "provider_first"
);

assert.equal(
  providerFirst
    .healthEscalationEligible,
  false
);


const missingEvidence =
  evaluateHealthEscalationEligibility({
    escalationRequested:
      true,

    complaint:
      "The healthcare service complaint remains unresolved.",
  });

assert.equal(
  missingEvidence.reason,
  "provider_complaint_evidence_required"
);

assert.equal(
  missingEvidence
    .healthEscalationEligible,
  false
);


const validReference =
  evaluateHealthEscalationEligibility({
    escalationRequested:
      true,

    priorComplaintReference:
      "HEALTH-TEST-12345",
  });

assert.equal(
  validReference
    .healthEscalationEligible,
  true
);


const narrativeEvidence =
  evaluateHealthEscalationEligibility({
    escalationRequested:
      true,

    complaint:
      "I complained to the hospital management, but the hospital failed to respond.",
  });

assert.equal(
  narrativeEvidence
    .healthEscalationEligible,
  true
);

assert.equal(
  narrativeEvidence
    .providerEvidenceNarrativeDetected,
  true
);


const refusedReference =
  evaluateHealthEscalationEligibility({
    escalationRequested:
      true,

    complaint:
      "The HMO refused to provide a complaint reference after I reported the problem.",
  });

assert.equal(
  refusedReference
    .healthEscalationEligible,
  true
);

assert.equal(
  refusedReference
    .referenceExceptionClaimed,
  true
);


console.log(
  "✅ HEALTH ESCALATION ELIGIBILITY ENGINE PASSED"
);


const hospitalName =
  "Example Specialist Hospital";


const initialHospital =
  resolveHealthRouting({
    sector:
      "health",

    institutionName:
      hospitalName,

    complaint:
      "The hospital delayed my non-emergency treatment.",

    escalationStage:
      "initial",

    country:
      "Nigeria",
  });


assert.equal(
  initialHospital.routeKey,
  "health_provider_first"
);

assert.equal(
  initialHospital.primaryInstitution,
  hospitalName
);

assert.equal(
  initialHospital.emailRoutingExpected,
  false
);

assert.deepEqual(
  initialHospital.contactEmails,
  []
);

assert.equal(
  initialHospital.submissionUrl,
  ""
);


const prematureHospitalEscalation =
  resolveHealthRouting({
    sector:
      "health",

    institutionName:
      hospitalName,

    complaint:
      "The healthcare service complaint remains unresolved.",

    escalationStage:
      "unresolved",

    priorComplaintReference:
      "",

    country:
      "Nigeria",
  });


assert.equal(
  prematureHospitalEscalation.routeKey,
  "health_provider_follow_up_evidence_required"
);

assert.equal(
  prematureHospitalEscalation.primaryInstitution,
  hospitalName
);

assert.equal(
  prematureHospitalEscalation
    .healthEscalation
    .healthEscalationEligible,
  false
);


const fccpcEscalation =
  resolveHealthRouting({
    sector:
      "health",

    institutionName:
      hospitalName,

    complaint:
      "My unresolved hospital billing complaint has not been resolved.",

    escalationStage:
      "unresolved",

    priorComplaintReference:
      "HOSP-12345",

    country:
      "Nigeria",
  });


assert.equal(
  fccpcEscalation.routeKey,
  "health_consumer_escalation"
);

assert.equal(
  fccpcEscalation.primaryInstitution,
  FCCPC_HEALTH_CONSUMER_ESCALATION.name
);

assert.deepEqual(
  fccpcEscalation.ccInstitutions,
  [
    hospitalName,
  ]
);

assert.equal(
  fccpcEscalation.emailRoutingExpected,
  true
);

assert.deepEqual(
  fccpcEscalation.contactEmails,
  FCCPC_HEALTH_CONSUMER_ESCALATION
    .contact
    .emails
);

assert.equal(
  fccpcEscalation.submissionUrl,
  FCCPC_HEALTH_CONSUMER_ESCALATION
    .contact
    .complaint_portal
);


console.log(
  "✅ PROVIDER-FIRST AND FCCPC ESCALATION SAFEGUARDS PASSED"
);


const hmoName =
  "Example Health Maintenance Organisation";


const initialHmo =
  resolveHealthRouting({
    sector:
      "health",

    institutionName:
      hmoName,

    complaint:
      "The HMO refused my referral authorisation.",

    escalationStage:
      "initial",

    country:
      "Nigeria",
  });


assert.equal(
  initialHmo.routeKey,
  "health_insurance_provider_first"
);

assert.equal(
  initialHmo.primaryInstitution,
  hmoName
);

assert.equal(
  initialHmo.emailRoutingExpected,
  false
);


const prematureNhia =
  resolveHealthRouting({
    sector:
      "health",

    institutionName:
      hmoName,

    complaint:
      "The HMO referral complaint remains unresolved.",

    escalationStage:
      "unresolved",

    priorComplaintReference:
      "",

    country:
      "Nigeria",
  });


assert.equal(
  prematureNhia.routeKey,
  "health_insurance_provider_follow_up_evidence_required"
);

assert.equal(
  prematureNhia.primaryInstitution,
  hmoName
);

assert.equal(
  prematureNhia
    .healthEscalation
    .healthEscalationEligible,
  false
);


const nhiaEscalation =
  resolveHealthRouting({
    sector:
      "health",

    institutionName:
      hmoName,

    complaint:
      "The unresolved HMO referral authorisation complaint remains unresolved.",

    escalationStage:
      "unresolved",

    priorComplaintReference:
      "HMO-12345",

    country:
      "Nigeria",
  });


assert.equal(
  nhiaEscalation.routeKey,
  "nhia_insurance_escalation"
);

assert.equal(
  nhiaEscalation.primaryInstitution,
  NHIA_HEALTH_INSURANCE_ESCALATION.name
);

assert.deepEqual(
  nhiaEscalation.ccInstitutions,
  [
    hmoName,
  ]
);

assert.equal(
  nhiaEscalation.emailRoutingExpected,
  true
);

assert.deepEqual(
  nhiaEscalation.contactEmails,
  NHIA_HEALTH_INSURANCE_ESCALATION
    .contact
    .emails
);

assert.ok(
  nhiaEscalation.submissionUrl
);

assert.equal(
  nhiaEscalation
    .healthEscalation
    .healthEscalationEligible,
  true
);


console.log(
  "✅ HMO-FIRST AND NHIA ESCALATION SAFEGUARDS PASSED"
);


const authorityCases = [
  {
    name:
      "DOCTOR DISCIPLINE",

    complaint:
      "I am reporting medical negligence and doctor misconduct.",

    routeKey:
      "mdcn_practitioner_complaint",

    authority:
      MDCN_MEDICAL_DISCIPLINE,
  },

  {
    name:
      "QUACK MEDICAL PRACTICE",

    complaint:
      "An unlicensed doctor is operating an illegal hospital.",

    routeKey:
      "mdcn_quack_report",

    authority:
      MDCN_MEDICAL_DISCIPLINE,
  },

  {
    name:
      "NURSING DISCIPLINE",

    complaint:
      "A nurse acted negligently and committed nursing misconduct.",

    routeKey:
      "nmcn_nursing_complaint",

    authority:
      NMCN_NURSING_DISCIPLINE,
  },

  {
    name:
      "PHARMACY DISCIPLINE",

    complaint:
      "A pharmacist dispensed the wrong medicine and acted negligently.",

    routeKey:
      "pcn_pharmacy_complaint",

    authority:
      PCN_PHARMACY_DISCIPLINE,
  },

  {
    name:
      "LABORATORY DISCIPLINE",

    complaint:
      "A laboratory scientist falsified my laboratory result.",

    routeKey:
      "mlscn_laboratory_complaint",

    authority:
      MLSCN_LABORATORY_DISCIPLINE,
  },

  {
    name:
      "MEDICAL PRODUCT SAFETY",

    complaint:
      "I purchased counterfeit medicine with suspicious packaging.",

    routeKey:
      "nafdac_medical_product_report",

    authority:
      NAFDAC_MEDICAL_PRODUCT_SAFETY,
  },

  {
    name:
      "HEALTH RIGHTS",

    complaint:
      "The hospital detained the patient over a hospital bill.",

    routeKey:
      "health_rights_nhrc",

    authority:
      NHRC_HEALTH_RIGHTS,
  },
];

const healthRightsWordingVariants = [
  "The hospital detained the patient over a hospital bill.",
  "A patient was held by the clinic because of an unpaid medical bill.",
  "The hospital refused emergency care to the injured patient.",
  "Emergency treatment was denied by the clinic.",
];

for (const complaint of healthRightsWordingVariants) {
  const route = resolveHealthRouting({
    sector: "health",
    institutionName: hospitalName,
    complaint,
    issueLocation: "Nigeria",
    escalationStage: "initial",
    country: "Nigeria",
  });

  assert.equal(route.routeKey, "health_rights_nhrc", complaint);
  assert.equal(route.primaryInstitution, NHRC_HEALTH_RIGHTS.name, complaint);
}


for (
  const test
  of authorityCases
) {
  const route =
    resolveHealthRouting({
      sector:
        "health",

      institutionName:
        hospitalName,

      complaint:
        test.complaint,

      issueLocation:
        "Nigeria",

      escalationStage:
        "initial",

      country:
        "Nigeria",
    });


  assert.equal(
    route.routeKey,
    test.routeKey,
    test.name
  );

  assert.equal(
    route.primaryInstitution,
    test.authority.name,
    test.name
  );

  assert.equal(
    route.emailRoutingExpected,
    true,
    test.name
  );

  assert.deepEqual(
    route.contactEmails,
    test.authority.contact.emails,
    test.name
  );

  assert.ok(
    route.submissionUrl,
    test.name
  );

  assert.ok(
    route.sourceUrls.length,
    test.name
  );


  console.log(
    `✅ ${test.name} ROUTE PASSED`
  );
}


const unknownProvider =
  "Example Unregistered Community Clinic";


const unknownRoute =
  resolveHealthRouting({
    sector:
      "health",

    institutionName:
      unknownProvider,

    complaint:
      "The clinic delayed a routine appointment.",

    issueLocation:
      "Nigeria",

    escalationStage:
      "initial",

    country:
      "Nigeria",
  });


assert.equal(
  unknownRoute.routeKey,
  "health_provider_first"
);

assert.equal(
  unknownRoute.primaryInstitution,
  unknownProvider
);

assert.equal(
  unknownRoute.emailRoutingExpected,
  false
);

assert.deepEqual(
  unknownRoute.contactEmails,
  []
);

assert.equal(
  unknownRoute.submissionUrl,
  ""
);


console.log(
  "✅ UNKNOWN HEALTHCARE PROVIDERS REMAIN SAFE"
);


const locations = [
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
  of locations
) {
  const route =
    resolveHealthRouting({
      sector:
        "health",

      institutionName:
        "Example General Hospital",

      complaint:
        "The hospital delayed my routine treatment.",

      issueLocation:
        location,

      escalationStage:
        "initial",

      country:
        "Nigeria",
    });


  assert.equal(
    route.routeKey,
    "health_provider_first",
    location
  );

  assert.equal(
    route.sector,
    "health",
    location
  );
}


console.log(
  "✅ ALL 36 STATES AND THE FCT USE THE NATIONAL HEALTH ROUTE"
);


const catalogue =
  JSON.parse(
    fs.readFileSync(
      "data/health.json",
      "utf8"
    )
  );


const catalogueAuthorities = [
  ...catalogue
    .regulators_and_core_agencies,

  ...catalogue.watchdogs,
];


assert.equal(
  catalogueAuthorities.length,
  8
);


for (
  const authority
  of NIGERIAN_HEALTH_AUTHORITIES
) {
  const catalogueRecord =
    catalogueAuthorities.find(
      item =>
        item.key ===
        authority.key
    );

  assert.ok(
    catalogueRecord,
    authority.key
  );

  assert.deepEqual(
    catalogueRecord.contact.emails,
    authority.contact.emails,
    authority.key
  );

  assert.deepEqual(
    catalogueRecord
      .verification
      .source_urls,
    authority
      .verification
      .source_urls,
    authority.key
  );
}


console.log(
  "✅ HEALTH CATALOGUE AND RUNTIME REGISTRY ARE SYNCHRONISED"
);

console.log(
  "✅ PREMATURE NHIA AND FCCPC ESCALATION IS BLOCKED"
);

console.log(
  "✅ ALL PROFESSIONAL AND PRODUCT-SAFETY ROUTES ARE ACTIVE"
);

console.log(
  "✅ HEALTH ROUTING-QUALITY CONTRACT PASSED"
);

import assert from "node:assert/strict";

import {
  NJC_JUDICIAL_DISCIPLINE,
  NHRC_JUSTICE_CHAIN_COMPLAINTS,
  PCC_COURT_ADMINISTRATION_COMPLAINTS,
  SUPREME_COURT_ADMINISTRATION,
  COURT_OF_APPEAL_ADMINISTRATION,
  FEDERAL_HIGH_COURT_ADMINISTRATION,
  NATIONAL_INDUSTRIAL_COURT_ADMINISTRATION,
  FCT_HIGH_COURT_ADMINISTRATION,
  LPDC_LEGAL_PRACTITIONER_DISCIPLINE,
  RELEVANT_STATE_JUDICIARY,
  NIGERIAN_JUDICIARY_AUTHORITIES,
  NIGERIAN_JUDICIARY_DETECTION_KEYWORDS,
} from "../lib/nigeriaJudiciaryRegistry.mjs";

import {
  resolveJudiciaryRouting,
} from "../lib/publicInstitutionJurisdiction.mjs";

assert.equal(
  NIGERIAN_JUDICIARY_AUTHORITIES.length,
  10
);

assert.equal(
  new Set(
    NIGERIAN_JUDICIARY_AUTHORITIES.map(
      authority => authority.key
    )
  ).size,
  10
);

for (
  const authority
  of NIGERIAN_JUDICIARY_AUTHORITIES
) {
  assert.ok(
    authority.verification.source_urls.length > 0,
    authority.key
  );

  assert.equal(
    authority.verification.status,
    "VERIFIED_OFFICIAL_SOURCE",
    authority.key
  );
}

assert.equal(
  NIGERIAN_JUDICIARY_AUTHORITIES.filter(
    authority =>
      authority.verification
        .direct_email_verified
  ).length,
  6
);

assert.equal(
  NIGERIAN_JUDICIARY_AUTHORITIES.filter(
    authority =>
      authority.portal_only
  ).length,
  4
);

assert.equal(
  NJC_JUDICIAL_DISCIPLINE
    .contact
    .emails
    .length,
  0
);

assert.equal(
  NJC_JUDICIAL_DISCIPLINE
    .physical_filing_required,
  true
);

assert.equal(
  LPDC_LEGAL_PRACTITIONER_DISCIPLINE
    .physical_filing_required,
  true
);

console.log(
  "✅ TEN VERIFIED NATIONAL JUDICIARY AUTHORITIES ARE REGISTERED"
);

console.log(
  "✅ SIX DIRECT-CONTACT AND FOUR SAFE PORTAL/PHYSICAL ROUTES ARE ENFORCED"
);

const judicialMisconduct =
  resolveJudiciaryRouting({
    institutionName:
      "Federal High Court",

    complaint:
      "I wish to report judicial misconduct because the judge demanded a bribe.",
  });

assert.equal(
  judicialMisconduct.routeKey,
  "njc_judicial_misconduct"
);

assert.equal(
  judicialMisconduct.primaryInstitution,
  NJC_JUDICIAL_DISCIPLINE.name
);

assert.equal(
  judicialMisconduct.emailRoutingExpected,
  false
);

assert.equal(
  judicialMisconduct.deliveryMethod,
  "physical_filing_with_verifying_affidavit"
);

assert.equal(
  judicialMisconduct.submissionUrl,
  NJC_JUDICIAL_DISCIPLINE
    .contact
    .discipline_regulations
);

console.log(
  "✅ JUDICIAL MISCONDUCT ROUTES TO NJC PHYSICAL FILING"
);

const meritsChallenge =
  resolveJudiciaryRouting({
    institutionName:
      "Supreme Court",

    complaint:
      "I am dissatisfied with the judgment and want to overturn the judgment.",
  });

assert.equal(
  meritsChallenge.routeKey,
  "judicial_decision_appeal_required"
);

assert.equal(
  meritsChallenge.blockGeneration,
  true
);

assert.equal(
  meritsChallenge.emailRoutingExpected,
  false
);

assert.equal(
  meritsChallenge.caseType,
  "appeal_or_legal_review"
);

console.log(
  "✅ DISCIPLINARY PETITIONS CANNOT REPLACE AN APPEAL"
);

const lawyerMisconduct =
  resolveJudiciaryRouting({
    complaint:
      "My lawyer withheld client money, refused to account for it and abandoned my case.",
  });

assert.equal(
  lawyerMisconduct.routeKey,
  "lpdc_legal_practitioner_discipline"
);

assert.equal(
  lawyerMisconduct.primaryInstitution,
  LPDC_LEGAL_PRACTITIONER_DISCIPLINE.name
);

assert.equal(
  lawyerMisconduct.emailRoutingExpected,
  false
);

assert.equal(
  lawyerMisconduct.deliveryMethod,
  "official_physical_disciplinary_filing"
);

console.log(
  "✅ LAWYER MISCONDUCT ROUTES TO LPDC"
);

const justiceRights =
  resolveJudiciaryRouting({
    institutionName:
      "Federal High Court",

    complaint:
      "I remain in unlawful detention after the police ignored the court order.",
  });

assert.equal(
  justiceRights.routeKey,
  "justice_chain_nhrc"
);

assert.equal(
  justiceRights.primaryInstitution,
  NHRC_JUSTICE_CHAIN_COMPLAINTS.name
);

assert.ok(
  justiceRights.ccInstitutions.includes(
    FEDERAL_HIGH_COURT_ADMINISTRATION.name
  )
);

assert.equal(
  justiceRights.emailRoutingExpected,
  true
);

assert.equal(
  justiceRights.submissionUrl,
  NHRC_JUSTICE_CHAIN_COMPLAINTS
    .contact
    .complaint_form
);

console.log(
  "✅ JUSTICE-CHAIN RIGHTS VIOLATIONS ROUTE TO NHRC"
);

const supremeCourtRegistry =
  resolveJudiciaryRouting({
    institutionName:
      "Supreme Court",

    complaint:
      "The court registry has delayed my certified true copy.",
  });

assert.equal(
  supremeCourtRegistry.routeKey,
  "court_registry_complaint"
);

assert.equal(
  supremeCourtRegistry.primaryInstitution,
  SUPREME_COURT_ADMINISTRATION.name
);

assert.ok(
  supremeCourtRegistry.ccInstitutions.includes(
    PCC_COURT_ADMINISTRATION_COMPLAINTS.name
  )
);

assert.equal(
  supremeCourtRegistry.emailRoutingExpected,
  true
);

assert.equal(
  supremeCourtRegistry.submissionUrl,
  SUPREME_COURT_ADMINISTRATION
    .contact
    .contact_page
);

console.log(
  "✅ SUPREME COURT REGISTRY COMPLAINT USES THE VERIFIED COURT CHANNEL"
);

const appealCourtRegistry =
  resolveJudiciaryRouting({
    institutionName:
      "Court of Appeal",

    complaint:
      "The registry has refused to compile the record of appeal.",
  });

assert.equal(
  appealCourtRegistry.routeKey,
  "court_registry_complaint"
);

assert.equal(
  appealCourtRegistry.primaryInstitution,
  COURT_OF_APPEAL_ADMINISTRATION.name
);

assert.equal(
  appealCourtRegistry.emailRoutingExpected,
  false
);

assert.equal(
  appealCourtRegistry.deliveryMethod,
  "official_portal_or_physical_registry"
);

assert.equal(
  appealCourtRegistry.submissionUrl,
  COURT_OF_APPEAL_ADMINISTRATION
    .contact
    .contact_form
);

console.log(
  "✅ COURT OF APPEAL REMAINS PORTAL-ONLY WITHOUT A GUESSED EMAIL"
);

const firstStageDelay =
  resolveJudiciaryRouting({
    institutionName:
      "National Industrial Court",

    complaint:
      "There have been endless adjournments and an undue judicial delay.",
  });

assert.equal(
  firstStageDelay.routeKey,
  "head_of_court_delay_complaint"
);

assert.equal(
  firstStageDelay.primaryInstitution,
  NATIONAL_INDUSTRIAL_COURT_ADMINISTRATION.name
);

assert.equal(
  firstStageDelay.emailRoutingExpected,
  true
);

console.log(
  "✅ FIRST-STAGE COURT DELAY ROUTES TO THE HEAD OF COURT"
);

const escalatedDelay =
  resolveJudiciaryRouting({
    institutionName:
      "FCT High Court",

    priorComplaintReference:
      "FCTHC-2026-001",

    complaint:
      "My earlier complaint remains unresolved and the reserved judgment is still delayed.",
  });

assert.equal(
  escalatedDelay.routeKey,
  "njc_delay_escalation"
);

assert.equal(
  escalatedDelay.primaryInstitution,
  NJC_JUDICIAL_DISCIPLINE.name
);

assert.ok(
  escalatedDelay.ccInstitutions.includes(
    FCT_HIGH_COURT_ADMINISTRATION.name
  )
);

assert.equal(
  escalatedDelay.emailRoutingExpected,
  false
);

console.log(
  "✅ SERIOUS CONTINUING COURT DELAY ESCALATES TO NJC"
);

const stateRegistry =
  resolveJudiciaryRouting({
    institutionName:
      "State High Court",

    complaint:
      "The High Court Registry has lost my case file.",
  });

assert.equal(
  stateRegistry.routeKey,
  "court_registry_complaint"
);

assert.equal(
  stateRegistry.primaryInstitution,
  RELEVANT_STATE_JUDICIARY.name
);

assert.equal(
  stateRegistry.emailRoutingExpected,
  false
);

assert.equal(
  stateRegistry.deliveryMethod,
  "official_portal_or_physical_registry"
);

console.log(
  "✅ STATE JUDICIARY COMPLAINTS DO NOT USE GUESSED COURT EMAILS"
);

for (
  const keyword
  of [
    "judicial misconduct",
    "court registry delay",
    "certified true copy delay",
    "judgment not delivered",
    "lawyer misconduct",
    "appeal the judgment",
    "unlawful detention",
  ]
) {
  assert.ok(
    NIGERIAN_JUDICIARY_DETECTION_KEYWORDS.includes(
      keyword
    ),
    keyword
  );
}

for (
  const wrongKeyword
  of [
    "electricity token",
    "airline refund",
    "bank transfer reversal",
    "telecom data bundle",
  ]
) {
  assert.equal(
    NIGERIAN_JUDICIARY_DETECTION_KEYWORDS.includes(
      wrongKeyword
    ),
    false,
    wrongKeyword
  );
}

console.log(
  "✅ NATIONAL JUDICIARY DETECTION KEYWORDS ARE CLEAN"
);

console.log(
  "✅ JUDICIARY ROUTING IS PROTECTED BY NATIONAL REGRESSION TESTS"
);

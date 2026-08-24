import assert from "node:assert/strict";

import {
  FMOJ_FINAL_DOMESTIC_ESCALATION,
  NHRC_FINAL_DOMESTIC_ESCALATION,
  US_TLHRC_HUMAN_RIGHTS_ADVOCACY,
  UK_FOREIGN_AFFAIRS_COMMITTEE_ADVOCACY,
  UK_FCDO_POLICY_CORRESPONDENCE,
  EU_DROI_HUMAN_RIGHTS_ADVOCACY,
  EU_DELEGATION_NIGERIA_HUMAN_RIGHTS,
  CANADA_GLOBAL_AFFAIRS_ADVOCACY,
  FRANCE_EMBASSY_NIGERIA_ADVOCACY,
  INEC_ELECTION_INCIDENT_REPORTING,
  ICC_OTP_ARTICLE_15_SUBMISSIONS,
  OHCHR_SPECIAL_PROCEDURES,
  OHCHR_TREATY_BODY_COMPLAINTS,
  ACHPR_NON_STATE_COMMUNICATIONS,
  ECOWAS_COURT_FORMAL_APPLICATION,
  NIGERIAN_INTERNATIONAL_ESCALATION_AUTHORITIES,
  NIGERIAN_INTERNATIONAL_ESCALATION_DETECTION_KEYWORDS,
  INTERNATIONAL_ESCALATION_PRIORITY,
} from "../lib/nigeriaInternationalEscalationRegistry.mjs";

import {
  resolveInternationalRouting,
} from "../lib/finalSectorJurisdiction.mjs";

/* ======================================================
   REGISTRY INTEGRITY
====================================================== */

assert.equal(
  NIGERIAN_INTERNATIONAL_ESCALATION_AUTHORITIES.length,
  15
);

assert.equal(
  new Set(
    NIGERIAN_INTERNATIONAL_ESCALATION_AUTHORITIES.map(
      authority => authority.key
    )
  ).size,
  15
);

for (
  const authority
  of NIGERIAN_INTERNATIONAL_ESCALATION_AUTHORITIES
) {
  assert.equal(
    authority.verification.status,
    "VERIFIED_OFFICIAL_SOURCE",
    authority.key
  );

  assert.ok(
    authority.verification.source_urls.length > 0,
    authority.key
  );
}

assert.equal(
  NIGERIAN_INTERNATIONAL_ESCALATION_AUTHORITIES.filter(
    authority =>
      authority.verification
        .direct_email_verified
  ).length,
  10
);

assert.equal(
  NIGERIAN_INTERNATIONAL_ESCALATION_AUTHORITIES.filter(
    authority =>
      authority.portal_only
  ).length,
  5
);

assert.deepEqual(
  INTERNATIONAL_ESCALATION_PRIORITY,
  [
    "united_states",
    "united_kingdom",
    "european_union",
    "international_criminal_court",
    "canada",
    "france",
    "united_nations",
    "african_union",
    "ecowas",
  ]
);

console.log(
  "✅ FIFTEEN VERIFIED INTERNATIONAL-ESCALATION AUTHORITIES ARE REGISTERED"
);

console.log(
  "✅ TEN DIRECT-CONTACT AND FIVE FORMAL PORTAL ROUTES ARE ENFORCED"
);

/* ======================================================
   ACTIVE EMERGENCY SAFETY
====================================================== */

const emergency =
  resolveInternationalRouting({
    institutionName:
      "United Nations",

    complaint:
      "My life is in immediate danger and I am currently under attack.",
  });

assert.equal(
  emergency.routeKey,
  "international_immediate_danger"
);

assert.equal(
  emergency.blockGeneration,
  true
);

assert.equal(
  emergency.emailRoutingExpected,
  false
);

assert.equal(
  emergency.deliveryMethod,
  "immediate_emergency_report"
);

console.log(
  "✅ ACTIVE EMERGENCIES BLOCK DELAYED INTERNATIONAL PETITION GENERATION"
);

/* ======================================================
   DOMESTIC FINAL ESCALATION
====================================================== */

const domesticRightsFirst =
  resolveInternationalRouting({
    institutionName:
      "United States Congress",

    complaint:
      "I suffered arbitrary detention and denial of access to a lawyer.",
  });

assert.equal(
  domesticRightsFirst.routeKey,
  "domestic_nhrc_before_international"
);

assert.equal(
  domesticRightsFirst.primaryInstitution,
  NHRC_FINAL_DOMESTIC_ESCALATION.name
);

assert.ok(
  domesticRightsFirst.ccInstitutions.includes(
    FMOJ_FINAL_DOMESTIC_ESCALATION.name
  )
);

assert.equal(
  domesticRightsFirst.emailRoutingExpected,
  true
);

assert.equal(
  domesticRightsFirst.submissionUrl,
  NHRC_FINAL_DOMESTIC_ESCALATION
    .contact
    .complaint_form
);

console.log(
  "✅ DOMESTIC HUMAN-RIGHTS ESCALATION PRECEDES FOREIGN ADVOCACY"
);

const domesticGeneralFirst =
  resolveInternationalRouting({
    institutionName:
      "Global Affairs Canada",

    complaint:
      "I want international advocacy about an unresolved government administrative injustice.",
  });

assert.equal(
  domesticGeneralFirst.routeKey,
  "domestic_fmoj_before_international"
);

assert.equal(
  domesticGeneralFirst.primaryInstitution,
  FMOJ_FINAL_DOMESTIC_ESCALATION.name
);

assert.equal(
  domesticGeneralFirst.emailRoutingExpected,
  true
);

console.log(
  "✅ GENERAL INTERNATIONAL ESCALATION FIRST ROUTES THROUGH FMOJ"
);

/* ======================================================
   DIPLOMATIC AND LEGISLATIVE ADVOCACY
====================================================== */

const usAdvocacy =
  resolveInternationalRouting({
    institutionName:
      "Tom Lantos Human Rights Commission",

    priorComplaintReference:
      "NHRC/2026/001",

    complaint:
      "My arbitrary detention remains unresolved after domestic complaints.",
  });

assert.equal(
  usAdvocacy.routeKey,
  "international_advocacy_united_states"
);

assert.equal(
  usAdvocacy.primaryInstitution,
  US_TLHRC_HUMAN_RIGHTS_ADVOCACY.name
);

assert.equal(
  usAdvocacy.emailRoutingExpected,
  true
);

assert.equal(
  usAdvocacy.submissionUrl,
  US_TLHRC_HUMAN_RIGHTS_ADVOCACY
    .contact
    .contact_form
);

assert.match(
  usAdvocacy.routingNote,
  /do not send bulk or repetitive messages/i
);

console.log(
  "✅ UNITED STATES HUMAN-RIGHTS ADVOCACY USES THE VERIFIED TLHRC CHANNEL"
);

const ukIndividualAdvocacy =
  resolveInternationalRouting({
    institutionName:
      "FCDO",

    priorComplaintReference:
      "NHRC/2026/002",

    complaint:
      "My individual human-rights complaint remains unresolved.",
  });

assert.equal(
  ukIndividualAdvocacy.routeKey,
  "international_advocacy_united_kingdom"
);

assert.equal(
  ukIndividualAdvocacy.primaryInstitution,
  UK_FCDO_POLICY_CORRESPONDENCE.name
);

assert.deepEqual(
  ukIndividualAdvocacy.ccInstitutions,
  []
);

assert.equal(
  ukIndividualAdvocacy.emailRoutingExpected,
  true
);

console.log(
  "✅ INDIVIDUAL UK ADVOCACY DOES NOT MISROUTE TO A PARLIAMENTARY COMMITTEE"
);

const ukSystemicAdvocacy =
  resolveInternationalRouting({
    institutionName:
      "UK Foreign Affairs Committee",

    priorComplaintReference:
      "FMOJ/2026/003",

    complaint:
      "This is a widespread systematic violation affecting multiple victims and raising a foreign policy concern.",
  });

assert.equal(
  ukSystemicAdvocacy.primaryInstitution,
  UK_FCDO_POLICY_CORRESPONDENCE.name
);

assert.ok(
  ukSystemicAdvocacy.ccInstitutions.includes(
    UK_FOREIGN_AFFAIRS_COMMITTEE_ADVOCACY.name
  )
);

assert.equal(
  UK_FOREIGN_AFFAIRS_COMMITTEE_ADVOCACY
    .individual_cases_accepted,
  false
);

console.log(
  "✅ UK PARLIAMENTARY ADVOCACY IS LIMITED TO SYSTEMIC POLICY CONCERNS"
);

const euAdvocacy =
  resolveInternationalRouting({
    institutionName:
      "European Union",

    priorComplaintReference:
      "NHRC/2026/004",

    complaint:
      "A systematic human rights violation affects multiple victims.",
  });

assert.equal(
  euAdvocacy.routeKey,
  "international_advocacy_european_union"
);

assert.equal(
  euAdvocacy.primaryInstitution,
  EU_DELEGATION_NIGERIA_HUMAN_RIGHTS.name
);

assert.ok(
  euAdvocacy.ccInstitutions.includes(
    EU_DROI_HUMAN_RIGHTS_ADVOCACY.name
  )
);

assert.equal(
  euAdvocacy.emailRoutingExpected,
  true
);

console.log(
  "✅ EUROPEAN UNION ADVOCACY USES THE NIGERIA DELEGATION AND SYSTEMIC DROI ROUTE"
);

const canadaAdvocacy =
  resolveInternationalRouting({
    institutionName:
      "Global Affairs Canada",

    priorComplaintReference:
      "FMOJ/2026/005",

    complaint:
      "Domestic complaints remain unresolved and diplomatic advocacy is requested.",
  });

assert.equal(
  canadaAdvocacy.routeKey,
  "international_advocacy_canada"
);

assert.equal(
  canadaAdvocacy.primaryInstitution,
  CANADA_GLOBAL_AFFAIRS_ADVOCACY.name
);

assert.equal(
  canadaAdvocacy.emailRoutingExpected,
  true
);

assert.equal(
  canadaAdvocacy.submissionUrl,
  CANADA_GLOBAL_AFFAIRS_ADVOCACY
    .contact
    .contact_page
);

console.log(
  "✅ CANADIAN ADVOCACY USES THE VERIFIED GLOBAL AFFAIRS CHANNEL"
);

/* ======================================================
   ICC SCREENING
====================================================== */

const ordinaryIccComplaint =
  resolveInternationalRouting({
    institutionName:
      "International Criminal Court",

    complaint:
      "A government office delayed my application and treated me unfairly.",
  });

assert.equal(
  ordinaryIccComplaint.routeKey,
  "icc_jurisdiction_not_established"
);

assert.equal(
  ordinaryIccComplaint.blockGeneration,
  true
);

assert.equal(
  ordinaryIccComplaint.emailRoutingExpected,
  false
);

console.log(
  "✅ ORDINARY INJUSTICE IS BLOCKED FROM ICC ROUTING"
);

const eligibleIccInformation =
  resolveInternationalRouting({
    institutionName:
      "ICC Office of the Prosecutor",

    complaint:
      "I have evidence concerning alleged war crimes and crimes against humanity.",
  });

assert.equal(
  eligibleIccInformation.routeKey,
  "icc_otp_link"
);

assert.equal(
  eligibleIccInformation.primaryInstitution,
  ICC_OTP_ARTICLE_15_SUBMISSIONS.name
);

assert.equal(
  eligibleIccInformation.emailRoutingExpected,
  false
);

assert.equal(
  eligibleIccInformation.submissionUrl,
  ICC_OTP_ARTICLE_15_SUBMISSIONS
    .contact
    .submission_portal
);

console.log(
  "✅ ROME STATUTE ALLEGATIONS ROUTE ONLY THROUGH OFFICIAL ICC OTPLINK"
);

/* ======================================================
   ECOWAS COURT
====================================================== */

const ecowasCourt =
  resolveInternationalRouting({
    institutionName:
      "ECOWAS Court",

    complaint:
      "I want to commence a human-rights case before the Community Court of Justice.",
  });

assert.equal(
  ecowasCourt.routeKey,
  "ecowas_court_formal_application"
);

assert.equal(
  ecowasCourt.primaryInstitution,
  ECOWAS_COURT_FORMAL_APPLICATION.name
);

assert.equal(
  ecowasCourt.blockGeneration,
  true
);

assert.equal(
  ecowasCourt.emailRoutingExpected,
  false
);

assert.equal(
  ecowasCourt.submissionUrl,
  ECOWAS_COURT_FORMAL_APPLICATION
    .contact
    .court_rules
);

console.log(
  "✅ ECOWAS COURT CASES REQUIRE A FORMAL REGISTRY APPLICATION"
);

/* ======================================================
   AFRICAN COMMISSION
====================================================== */

const achprWithoutExhaustion =
  resolveInternationalRouting({
    institutionName:
      "African Commission",

    complaint:
      "I want to submit an African Charter complaint.",
  });

assert.equal(
  achprWithoutExhaustion.routeKey,
  "achpr_domestic_remedies_review"
);

assert.equal(
  achprWithoutExhaustion.blockGeneration,
  true
);

assert.equal(
  achprWithoutExhaustion.emailRoutingExpected,
  false
);

console.log(
  "✅ ACHPR COMMUNICATIONS REQUIRE A DOMESTIC-REMEDIES REVIEW"
);

const achprWithExhaustion =
  resolveInternationalRouting({
    institutionName:
      "African Commission",

    complaint:
      "All domestic remedies have been exhausted and I seek an African Charter remedy.",
  });

assert.equal(
  achprWithExhaustion.routeKey,
  "achpr_non_state_communication"
);

assert.equal(
  achprWithExhaustion.primaryInstitution,
  ACHPR_NON_STATE_COMMUNICATIONS.name
);

assert.equal(
  achprWithExhaustion.emailRoutingExpected,
  false
);

assert.equal(
  achprWithExhaustion.submissionUrl,
  ACHPR_NON_STATE_COMMUNICATIONS
    .contact
    .communications_procedure
);

console.log(
  "✅ ADMISSIBLE ACHPR MATTERS USE THE OFFICIAL NON-STATE PROCEDURE"
);

/* ======================================================
   UN TREATY BODIES
====================================================== */

const treatyBodyWithoutExhaustion =
  resolveInternationalRouting({
    institutionName:
      "UN Treaty Body",

    complaint:
      "I want to submit an individual complaint to the Human Rights Committee.",
  });

assert.equal(
  treatyBodyWithoutExhaustion.routeKey,
  "un_treaty_body_domestic_remedies_required"
);

assert.equal(
  treatyBodyWithoutExhaustion.blockGeneration,
  true
);

assert.equal(
  treatyBodyWithoutExhaustion.emailRoutingExpected,
  false
);

console.log(
  "✅ UN TREATY-BODY ROUTING REQUIRES ELIGIBILITY AND ADMISSIBILITY REVIEW"
);

const treatyBodyWithExhaustion =
  resolveInternationalRouting({
    institutionName:
      "OHCHR Complaints Portal",

    complaint:
      "Domestic remedies are ineffective and I seek a UN treaty body individual communication.",
  });

assert.equal(
  treatyBodyWithExhaustion.routeKey,
  "ohchr_treaty_body_portal"
);

assert.equal(
  treatyBodyWithExhaustion.primaryInstitution,
  OHCHR_TREATY_BODY_COMPLAINTS.name
);

assert.equal(
  treatyBodyWithExhaustion.emailRoutingExpected,
  false
);

assert.equal(
  treatyBodyWithExhaustion.submissionUrl,
  OHCHR_TREATY_BODY_COMPLAINTS
    .contact
    .complaints_portal
);

console.log(
  "✅ POTENTIALLY ADMISSIBLE TREATY COMPLAINTS USE THE OHCHR PORTAL"
);

/* ======================================================
   UN SPECIAL PROCEDURES
====================================================== */

const specialProcedures =
  resolveInternationalRouting({
    institutionName:
      "UN Special Rapporteur",

    complaint:
      "There is continuing arbitrary detention and an ongoing human rights violation.",
  });

assert.equal(
  specialProcedures.routeKey,
  "ohchr_special_procedures"
);

assert.equal(
  specialProcedures.primaryInstitution,
  OHCHR_SPECIAL_PROCEDURES.name
);

assert.equal(
  specialProcedures.emailRoutingExpected,
  false
);

assert.equal(
  specialProcedures.submissionUrl,
  OHCHR_SPECIAL_PROCEDURES
    .contact
    .submission_portal
);

console.log(
  "✅ URGENT HUMAN-RIGHTS ALLEGATIONS ROUTE TO UN SPECIAL PROCEDURES"
);

/* ======================================================
   DETECTION AND ANTI-SPAM SAFETY
====================================================== */

for (
  const keyword
  of [
    "international escalation",
    "Tom Lantos Human Rights Commission",
    "UK Foreign Affairs Committee",
    "European Union",
    "Global Affairs Canada",
    "International Criminal Court",
    "UN Special Procedures",
    "UN treaty body complaint",
    "African Charter complaint",
    "ECOWAS Court",
    "war crimes",
    "exhausted domestic remedies",
  ]
) {
  assert.ok(
    NIGERIAN_INTERNATIONAL_ESCALATION_DETECTION_KEYWORDS.includes(
      keyword
    ),
    keyword
  );
}

for (
  const wrongKeyword
  of [
    "electricity token",
    "airline baggage refund",
    "bank transfer reversal",
    "telecom data bundle",
    "university admission result",
  ]
) {
  assert.equal(
    NIGERIAN_INTERNATIONAL_ESCALATION_DETECTION_KEYWORDS.includes(
      wrongKeyword
    ),
    false,
    wrongKeyword
  );
}

for (
  const authority
  of [
    ICC_OTP_ARTICLE_15_SUBMISSIONS,
    OHCHR_SPECIAL_PROCEDURES,
    OHCHR_TREATY_BODY_COMPLAINTS,
    ACHPR_NON_STATE_COMMUNICATIONS,
    ECOWAS_COURT_FORMAL_APPLICATION,
  ]
) {
  assert.equal(
    authority.contact.emails.length,
    0,
    authority.key
  );

  assert.equal(
    authority.portal_only,
    true,
    authority.key
  );
}

assert.ok(
  usAdvocacy.ccInstitutions.length <= 1
);

assert.ok(
  ukSystemicAdvocacy.ccInstitutions.length <= 1
);

assert.ok(
  euAdvocacy.ccInstitutions.length <= 1
);

console.log(
  "✅ INTERNATIONAL DETECTION KEYWORDS ARE CLEAN"
);

console.log(
  "✅ FORMAL INTERNATIONAL PROCEDURES DO NOT USE GUESSED EMAILS"
);

console.log(
  "✅ MASS AND REPETITIVE INTERNATIONAL EMAIL ROUTING IS PROHIBITED"
);

console.log(
  "✅ INTERNATIONAL ESCALATION IS PROTECTED BY NATIONAL REGRESSION TESTS"
);

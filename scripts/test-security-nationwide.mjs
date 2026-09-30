import assert from "node:assert/strict";

import {
  NPF_NATIONAL_AND_STATE_COMMANDS,
  PSC_POLICE_DISCIPLINE,
  NHRC_SECURITY_RIGHTS_COMPLAINTS,
  NCOS_COMPLAINT_RESPONSE,
  NSCDC_INCIDENT_REPORTING,
  NIS_SERVICOM_COMPLAINTS,
  NIGERIAN_ARMY_CALL_CENTRE,
  NIGERIAN_NAVY_CONTACT,
  NIGERIAN_AIR_FORCE_OMBUDSMAN,
  NIGERIAN_SECURITY_AUTHORITIES,
  NIGERIAN_SECURITY_DETECTION_KEYWORDS,
} from "../lib/nigeriaSecurityRegistry.mjs";

import {
  resolveSecurityRouting,
} from "../lib/publicInstitutionJurisdiction.mjs";

assert.equal(
  NIGERIAN_SECURITY_AUTHORITIES.length,
  9
);

assert.equal(
  new Set(
    NIGERIAN_SECURITY_AUTHORITIES.map(
      authority => authority.key
    )
  ).size,
  9
);

for (
  const authority
  of NIGERIAN_SECURITY_AUTHORITIES
) {
  assert.ok(
    authority.verification.source_urls.length > 0,
    authority.key
  );

  for (
    const sourceUrl
    of authority.verification.source_urls
  ) {
    const hostname =
      new URL(sourceUrl).hostname;

    assert.ok(
      hostname.endsWith(".gov.ng") ||
      hostname.endsWith(".mil.ng") ||
      hostname === "police.gov.ng" ||
      hostname === "psc.gov.ng" ||
      hostname === "nscdc.gov.ng" ||
      hostname === "immigration.gov.ng" ||
      hostname === "corrections.gov.ng" ||
      hostname === "www.nigeriarights.gov.ng",
      `${authority.key}: ${sourceUrl}`
    );
  }
}

assert.equal(
  NIGERIAN_SECURITY_AUTHORITIES.filter(
    authority =>
      authority.verification
        .direct_email_verified
  ).length,
  7
);

assert.equal(
  NIGERIAN_SECURITY_AUTHORITIES.filter(
    authority =>
      authority.portal_only
  ).length,
  2
);

assert.equal(
  NPF_NATIONAL_AND_STATE_COMMANDS
    .contact
    .emails
    .length,
  0
);

assert.equal(
  NIGERIAN_AIR_FORCE_OMBUDSMAN
    .contact
    .emails
    .length,
  0
);

console.log(
  "✅ NINE VERIFIED NATIONAL SECURITY AUTHORITIES ARE REGISTERED"
);

console.log(
  "✅ SEVEN DIRECT-CONTACT AND TWO SAFE PORTAL-ONLY ROUTES ARE ENFORCED"
);

const emergency =
  resolveSecurityRouting({
    complaint:
      "I am currently under attack and my life is in immediate danger.",
  });

assert.equal(
  emergency.routeKey,
  "active_security_emergency"
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
  emergency.caseType,
  "active_emergency"
);

console.log(
  "✅ ACTIVE SECURITY EMERGENCY BLOCKS ORDINARY PETITION GENERATION"
);

const policeRights =
  resolveSecurityRouting({
    institutionName:
      "Nigeria Police Force",

    complaint:
      "Police officers unlawfully detained me without charge and denied access to my lawyer.",
  });

assert.equal(
  policeRights.routeKey,
  "security_rights_nhrc"
);

assert.equal(
  policeRights.primaryInstitution,
  NHRC_SECURITY_RIGHTS_COMPLAINTS.name
);

assert.ok(
  policeRights.ccInstitutions.includes(
    NPF_NATIONAL_AND_STATE_COMMANDS.name
  )
);

assert.ok(
  policeRights.ccInstitutions.includes(
    PSC_POLICE_DISCIPLINE.name
  )
);

assert.ok(
  policeRights.sourceUrls.includes(
    NHRC_SECURITY_RIGHTS_COMPLAINTS
      .contact
      .complaint_form
  )
);

console.log(
  "✅ SERIOUS SECURITY RIGHTS ABUSE ROUTES TO NHRC"
);

const policeDiscipline =
  resolveSecurityRouting({
    institutionName:
      "Nigeria Police Force",

    complaint:
      "Police officers demanded bail money from me at an illegal checkpoint.",
  });

assert.equal(
  policeDiscipline.routeKey,
  "psc_police_discipline"
);

assert.equal(
  policeDiscipline.primaryInstitution,
  PSC_POLICE_DISCIPLINE.name
);

assert.ok(
  policeDiscipline.ccInstitutions.includes(
    NPF_NATIONAL_AND_STATE_COMMANDS.name
  )
);

assert.ok(
  policeDiscipline.sourceUrls.includes(
    PSC_POLICE_DISCIPLINE
      .contact
      .police_discipline
  )
);

console.log(
  "✅ POLICE MISCONDUCT ROUTES TO THE POLICE SERVICE COMMISSION"
);

const crimeReport =
  resolveSecurityRouting({
    complaint:
      "My brother is missing following a kidnapping and I need to report the crime.",
  });

assert.equal(
  crimeReport.routeKey,
  "crime_report_nearest_command"
);

assert.equal(
  crimeReport.primaryInstitution,
  NPF_NATIONAL_AND_STATE_COMMANDS.name
);

assert.equal(
  crimeReport.emailRoutingExpected,
  false
);

assert.equal(
  crimeReport.submissionUrl,
  NPF_NATIONAL_AND_STATE_COMMANDS
    .contact
    .command_directory
);

console.log(
  "✅ CRIME REPORT ROUTES TO THE RELEVANT STATE COMMAND OR POLICE STATION"
);

const correctionalComplaint =
  resolveSecurityRouting({
    institutionName:
      "Nigerian Correctional Service",

    complaint:
      "I am making a complaint about inmate welfare and conditions at a custodial centre.",
  });

assert.equal(
  correctionalComplaint.routeKey,
  "security_agency_first"
);

assert.equal(
  correctionalComplaint.primaryInstitution,
  NCOS_COMPLAINT_RESPONSE.name
);

assert.equal(
  correctionalComplaint.emailRoutingExpected,
  true
);

assert.equal(
  correctionalComplaint.submissionUrl,
  NCOS_COMPLAINT_RESPONSE
    .contact
    .contact_page
);

console.log(
  "✅ CORRECTIONAL COMPLAINT ROUTES TO NCOS"
);

const armyComplaint =
  resolveSecurityRouting({
    institutionName:
      "Nigerian Army",

    complaint:
      "I wish to submit a formal complaint concerning the conduct of an Army officer.",
  });

assert.equal(
  armyComplaint.routeKey,
  "security_agency_first"
);

assert.equal(
  armyComplaint.primaryInstitution,
  NIGERIAN_ARMY_CALL_CENTRE.name
);

assert.equal(
  armyComplaint.emailRoutingExpected,
  true
);

assert.equal(
  armyComplaint.submissionUrl,
  NIGERIAN_ARMY_CALL_CENTRE
    .contact
    .contact_page
);

console.log(
  "✅ ARMY COMPLAINT ROUTES THROUGH THE VERIFIED ARMY CHANNEL"
);

const airForceComplaint =
  resolveSecurityRouting({
    institutionName:
      "Nigerian Air Force",

    complaint:
      "I wish to submit a formal complaint concerning Air Force service conduct.",
  });

assert.equal(
  airForceComplaint.routeKey,
  "security_agency_first"
);

assert.equal(
  airForceComplaint.primaryInstitution,
  NIGERIAN_AIR_FORCE_OMBUDSMAN.name
);

assert.equal(
  airForceComplaint.emailRoutingExpected,
  false
);

assert.equal(
  airForceComplaint.submissionUrl,
  NIGERIAN_AIR_FORCE_OMBUDSMAN
    .contact
    .contact_form
);

console.log(
  "✅ AIR FORCE COMPLAINT REMAINS PORTAL-ONLY WITHOUT A GUESSED EMAIL"
);

const civilDefenceEscalation =
  resolveSecurityRouting({
    institutionName:
      "Nigeria Security and Civil Defence Corps",

    priorComplaintReference:
      "NSCDC-REF-2026-001",

    complaint:
      "My earlier complaint to NSCDC remains unresolved.",
  });

assert.equal(
  civilDefenceEscalation.routeKey,
  "security_agency_internal_escalation"
);

assert.equal(
  civilDefenceEscalation.primaryInstitution,
  NSCDC_INCIDENT_REPORTING.name
);

assert.equal(
  civilDefenceEscalation.emailRoutingExpected,
  true
);

console.log(
  "✅ UNRESOLVED SECURITY-AGENCY COMPLAINT ESCALATES INTERNALLY"
);

for (
  const authority
  of [
    NIS_SERVICOM_COMPLAINTS,
    NIGERIAN_NAVY_CONTACT,
  ]
) {
  assert.ok(
    authority.contact.emails.length > 0,
    authority.key
  );
}

for (
  const keyword
  of [
    "police brutality",
    "unlawful detention",
    "forced confession",
    "prison conditions",
    "immigration complaint",
    "army abuse",
    "navy abuse",
    "air force abuse",
    "currently under attack",
  ]
) {
  assert.ok(
    NIGERIAN_SECURITY_DETECTION_KEYWORDS.includes(
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
    "school transcript",
    "health insurance claim",
  ]
) {
  assert.equal(
    NIGERIAN_SECURITY_DETECTION_KEYWORDS.includes(
      wrongKeyword
    ),
    false,
    wrongKeyword
  );
}

console.log(
  "✅ NATIONAL SECURITY DETECTION KEYWORDS ARE CLEAN"
);

console.log(
  "✅ SECURITY AND LAW-ENFORCEMENT ROUTING IS PROTECTED BY NATIONAL REGRESSION TESTS"
);

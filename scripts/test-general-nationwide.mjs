import assert from "node:assert/strict";

import {
  PCC_NATIONAL_ADMINISTRATIVE_COMPLAINTS,
  PCC_STATE_OFFICE_DIRECTORY,
  SERVICOM_PUBLIC_SERVICE_COMPLAINTS,
  FCCPC_CONSUMER_SERVICE_COMPLAINTS,
  NHRC_GENERAL_RIGHTS_COMPLAINTS,
  RELEVANT_MDA_INTERNAL_COMPLAINT_UNIT,
  NIGERIAN_GENERAL_ADMINISTRATION_AUTHORITIES,
  NIGERIAN_GENERAL_ADMINISTRATION_DETECTION_KEYWORDS,
} from "../lib/nigeriaGeneralRegistry.mjs";

import {
  resolveGeneralRouting,
} from "../lib/finalSectorJurisdiction.mjs";

/* ======================================================
   REGISTRY INTEGRITY
====================================================== */

assert.equal(
  NIGERIAN_GENERAL_ADMINISTRATION_AUTHORITIES.length,
  6
);

assert.equal(
  new Set(
    NIGERIAN_GENERAL_ADMINISTRATION_AUTHORITIES.map(
      authority => authority.key
    )
  ).size,
  6
);

for (
  const authority
  of NIGERIAN_GENERAL_ADMINISTRATION_AUTHORITIES
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
  NIGERIAN_GENERAL_ADMINISTRATION_AUTHORITIES.filter(
    authority =>
      authority.verification
        .direct_email_verified
  ).length,
  4
);

assert.equal(
  NIGERIAN_GENERAL_ADMINISTRATION_AUTHORITIES.filter(
    authority =>
      authority.dynamic_route
  ).length,
  2
);

console.log(
  "✅ SIX VERIFIED NATIONAL GENERAL-ADMINISTRATION AUTHORITIES ARE REGISTERED"
);

console.log(
  "✅ FOUR DIRECT-CONTACT AND TWO SAFE DYNAMIC ROUTES ARE ENFORCED"
);

/* ======================================================
   PCC DEFAULT ROUTING
====================================================== */

const ordinaryComplaint =
  resolveGeneralRouting({
    complaint:
      "I wish to make a general administrative complaint about unfair official treatment.",
  });

assert.equal(
  ordinaryComplaint.routeKey,
  "pcc_general_complaint"
);

assert.equal(
  ordinaryComplaint.primaryInstitution,
  PCC_NATIONAL_ADMINISTRATIVE_COMPLAINTS.name
);

assert.equal(
  ordinaryComplaint.caseType,
  "general_complaint"
);

assert.deepEqual(
  ordinaryComplaint.ccInstitutions,
  []
);

assert.equal(
  ordinaryComplaint.emailRoutingExpected,
  true
);

assert.equal(
  ordinaryComplaint.submissionUrl,
  PCC_NATIONAL_ADMINISTRATIVE_COMPLAINTS
    .contact
    .complaint_procedure
);

assert.equal(
  ordinaryComplaint.stateOfficeDirectory,
  PCC_STATE_OFFICE_DIRECTORY
    .contact
    .state_office_directory
);

console.log(
  "✅ ORDINARY ADMINISTRATIVE COMPLAINTS ROUTE TO PCC"
);

/* ======================================================
   PUBLIC-SERVICE DELIVERY
====================================================== */

const publicServiceComplaint =
  resolveGeneralRouting({
    institutionName:
      "Federal Ministry",

    complaint:
      "The federal ministry has delayed my certificate application and failed to respond.",
  });

assert.equal(
  publicServiceComplaint.caseType,
  "administrative_delay"
);

assert.equal(
  publicServiceComplaint.primaryInstitution,
  PCC_NATIONAL_ADMINISTRATIVE_COMPLAINTS.name
);

assert.ok(
  publicServiceComplaint.ccInstitutions.includes(
    SERVICOM_PUBLIC_SERVICE_COMPLAINTS.name
  )
);

assert.equal(
  publicServiceComplaint.ccInstitutions.includes(
    FCCPC_CONSUMER_SERVICE_COMPLAINTS.name
  ),
  false
);

assert.equal(
  publicServiceComplaint.internalFirstAuthority,
  RELEVANT_MDA_INTERNAL_COMPLAINT_UNIT.name
);

assert.equal(
  publicServiceComplaint.internalEscalationGuidance,
  RELEVANT_MDA_INTERNAL_COMPLAINT_UNIT
    .contact
    .escalation_guidance
);

console.log(
  "✅ PUBLIC-SERVICE FAILURES INCLUDE SERVICOM WITHOUT UNRELATED COPYING"
);

/* ======================================================
   CONSUMER SERVICE COMPLAINTS
====================================================== */

const consumerComplaint =
  resolveGeneralRouting({
    institutionName:
      "Private Service Provider",

    complaint:
      "The vendor refused my refund after the defective service was not delivered.",
  });

assert.equal(
  consumerComplaint.caseType,
  "consumer_service"
);

assert.equal(
  consumerComplaint.primaryInstitution,
  PCC_NATIONAL_ADMINISTRATIVE_COMPLAINTS.name
);

assert.ok(
  consumerComplaint.ccInstitutions.includes(
    FCCPC_CONSUMER_SERVICE_COMPLAINTS.name
  )
);

assert.equal(
  consumerComplaint.ccInstitutions.includes(
    SERVICOM_PUBLIC_SERVICE_COMPLAINTS.name
  ),
  false
);

console.log(
  "✅ CONSUMER SERVICE COMPLAINTS INCLUDE FCCPC"
);

/* ======================================================
   HUMAN-RIGHTS COMPLAINTS
====================================================== */

const rightsComplaint =
  resolveGeneralRouting({
    institutionName:
      "Government Agency",

    complaint:
      "The government agency subjected me to unlawful detention and access to lawyer was denied.",
  });

assert.equal(
  rightsComplaint.caseType,
  "human_rights"
);

assert.equal(
  rightsComplaint.primaryInstitution,
  PCC_NATIONAL_ADMINISTRATIVE_COMPLAINTS.name
);

assert.ok(
  rightsComplaint.ccInstitutions.includes(
    NHRC_GENERAL_RIGHTS_COMPLAINTS.name
  )
);

assert.ok(
  rightsComplaint.ccInstitutions.includes(
    SERVICOM_PUBLIC_SERVICE_COMPLAINTS.name
  )
);

assert.equal(
  new Set(
    rightsComplaint.ccInstitutions
  ).size,
  rightsComplaint.ccInstitutions.length
);

console.log(
  "✅ RIGHTS-BASED ADMINISTRATIVE COMPLAINTS INCLUDE NHRC"
);

/* ======================================================
   COMBINED MANDATE ROUTING
====================================================== */

const combinedComplaint =
  resolveGeneralRouting({
    institutionName:
      "Government Service Provider",

    complaint:
      "A government department unlawfully detained me, failed to deliver a paid service and refused my refund.",
  });

assert.ok(
  combinedComplaint.ccInstitutions.includes(
    NHRC_GENERAL_RIGHTS_COMPLAINTS.name
  )
);

assert.ok(
  combinedComplaint.ccInstitutions.includes(
    SERVICOM_PUBLIC_SERVICE_COMPLAINTS.name
  )
);

assert.ok(
  combinedComplaint.ccInstitutions.includes(
    FCCPC_CONSUMER_SERVICE_COMPLAINTS.name
  )
);

assert.equal(
  combinedComplaint.ccInstitutions.length,
  3
);

console.log(
  "✅ MULTI-MANDATE COMPLAINTS USE UNIQUE AND RELEVANT OVERSIGHT RECIPIENTS"
);

/* ======================================================
   DYNAMIC CONTACT SAFETY
====================================================== */

for (
  const authority
  of [
    PCC_STATE_OFFICE_DIRECTORY,
    RELEVANT_MDA_INTERNAL_COMPLAINT_UNIT,
  ]
) {
  assert.equal(
    authority.dynamic_route,
    true,
    authority.key
  );

  assert.equal(
    authority.portal_only,
    true,
    authority.key
  );

  assert.equal(
    authority.contact.emails.length,
    0,
    authority.key
  );

  assert.equal(
    authority.verification
      .direct_email_verified,
    false,
    authority.key
  );
}

assert.equal(
  RELEVANT_MDA_INTERNAL_COMPLAINT_UNIT
    .internal_first,
  true
);

console.log(
  "✅ STATE-OFFICE AND INTERNAL-MDA ROUTES DO NOT USE GUESSED EMAILS"
);

/* ======================================================
   SECTOR BOUNDARY
====================================================== */

const authorityNames =
  NIGERIAN_GENERAL_ADMINISTRATION_AUTHORITIES.map(
    authority => authority.name
  );

assert.equal(
  authorityNames.includes(
    "Citizens' Mediation Bureau (CMB), Lagos State"
  ),
  false
);

assert.equal(
  authorityNames.includes(
    "Lagos Multi-Door Courthouse (LMDC)"
  ),
  false
);

console.log(
  "✅ CIVIL-DISPUTE AND LAGOS ADR BODIES ARE EXCLUDED FROM GENERAL ADMINISTRATION"
);

/* ======================================================
   DETECTION SAFETY
====================================================== */

for (
  const keyword
  of [
    "general administrative complaint",
    "administrative injustice",
    "public service delivery failure",
    "government agency complaint",
    "Public Complaints Commission (PCC)",
    "SERVICOM",
    "Federal Competition and Consumer Protection Commission (FCCPC)",
    "National Human Rights Commission (NHRC)",
    "internal complaint unresolved",
  ]
) {
  assert.ok(
    NIGERIAN_GENERAL_ADMINISTRATION_DETECTION_KEYWORDS.includes(
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
    "war crimes",
    "Lagos Multi-Door Courthouse",
  ]
) {
  assert.equal(
    NIGERIAN_GENERAL_ADMINISTRATION_DETECTION_KEYWORDS.includes(
      wrongKeyword
    ),
    false,
    wrongKeyword
  );
}

console.log(
  "✅ GENERAL-ADMINISTRATION DETECTION KEYWORDS ARE CLEAN"
);

console.log(
  "✅ GENERAL ADMINISTRATIVE ROUTING IS PROTECTED BY NATIONAL REGRESSION TESTS"
);

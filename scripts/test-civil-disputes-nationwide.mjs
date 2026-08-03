import assert from "node:assert/strict";

import {
  ABUJA_MULTI_DOOR_COURT,
  LAGOS_CITIZENS_MEDIATION_BUREAU,
  LAGOS_MULTI_DOOR_COURTHOUSE,
  RELEVANT_STATE_ADR_CENTRE,
  RELEVANT_SMALL_CLAIMS_OR_MAGISTRATES_COURT,
  NIGERIAN_CIVIL_DISPUTE_AUTHORITIES,
  NIGERIAN_CIVIL_DISPUTE_DETECTION_KEYWORDS,
} from "../lib/nigeriaCivilDisputesRegistry.mjs";

import {
  isLandlordTenantDispute,
  isCivilDispute,
  detectCivilJurisdiction,
  resolveCivilRouting,
} from "../lib/civilJurisdiction.mjs";

/* ======================================================
   REGISTRY INTEGRITY
====================================================== */

assert.equal(
  NIGERIAN_CIVIL_DISPUTE_AUTHORITIES.length,
  5
);

assert.equal(
  new Set(
    NIGERIAN_CIVIL_DISPUTE_AUTHORITIES.map(
      authority => authority.key
    )
  ).size,
  5
);

for (
  const authority
  of NIGERIAN_CIVIL_DISPUTE_AUTHORITIES
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
  NIGERIAN_CIVIL_DISPUTE_AUTHORITIES.filter(
    authority =>
      authority.verification
        .direct_email_verified
  ).length,
  1
);

assert.equal(
  NIGERIAN_CIVIL_DISPUTE_AUTHORITIES.filter(
    authority =>
      authority.portal_only ||
      authority.dynamic_route
  ).length,
  4
);

console.log(
  "✅ FIVE VERIFIED CIVIL-DISPUTE AUTHORITIES ARE REGISTERED"
);

console.log(
  "✅ ONE DIRECT-CONTACT AND FOUR SAFE PORTAL/DYNAMIC ROUTES ARE ENFORCED"
);

/* ======================================================
   DISPUTE DETECTION
====================================================== */

assert.equal(
  isLandlordTenantDispute(
    "My landlord served an eviction notice."
  ),
  true
);

assert.equal(
  isCivilDispute(
    "My former business partner breached our private agreement."
  ),
  true
);

assert.equal(
  isCivilDispute(
    "An individual has refused to repay my personal loan."
  ),
  true
);

assert.equal(
  isCivilDispute(
    "My electricity meter is faulty and the DISCO ignored my complaint."
  ),
  false
);

console.log(
  "✅ PRIVATE CIVIL DISPUTES ARE DETECTED WITHOUT CAPTURING REGULATED-SECTOR COMPLAINTS"
);

/* ======================================================
   LOCATION DETECTION
====================================================== */

assert.deepEqual(
  detectCivilJurisdiction({
    disputeLocation:
      "Kubwa, Abuja",
  }),
  {
    jurisdiction:
      "fct",

    source:
      "dispute_location",
  }
);

assert.deepEqual(
  detectCivilJurisdiction({
    disputeLocation:
      "Ikeja, Lagos",
  }),
  {
    jurisdiction:
      "lagos",

    source:
      "dispute_location",
  }
);

assert.deepEqual(
  detectCivilJurisdiction({
    disputeLocation:
      "Enugu State",
  }),
  {
    jurisdiction:
      "other",

    source:
      "dispute_location",
  }
);

console.log(
  "✅ FCT, LAGOS AND OTHER-STATE CIVIL JURISDICTIONS ARE DISTINGUISHED"
);

/* ======================================================
   FCT ADR ROUTING
====================================================== */

const fctTenancy =
  resolveCivilRouting({
    complaint:
      "My landlord in Kubwa served an eviction notice and I request mediation.",

    disputeLocation:
      "Kubwa, Abuja",
  });

assert.equal(
  fctTenancy.matched,
  true
);

assert.equal(
  fctTenancy.routeKey,
  "fct_amdc"
);

assert.equal(
  fctTenancy.primaryInstitution,
  ABUJA_MULTI_DOOR_COURT.name
);

assert.equal(
  fctTenancy.disputeType,
  "landlord_tenant"
);

assert.equal(
  fctTenancy.emailRoutingExpected,
  false
);

assert.equal(
  fctTenancy.submissionUrl,
  ABUJA_MULTI_DOOR_COURT
    .contact
    .filing_guidance
);

console.log(
  "✅ FCT PRIVATE DISPUTES ROUTE TO ABUJA MULTI-DOOR COURT"
);

/* ======================================================
   LAGOS CMB ROUTING
====================================================== */

const lagosTenancy =
  resolveCivilRouting({
    complaint:
      "My landlord has refused to refund my rent deposit.",

    disputeLocation:
      "Ikeja, Lagos",
  });

assert.equal(
  lagosTenancy.routeKey,
  "lagos_cmb"
);

assert.equal(
  lagosTenancy.primaryInstitution,
  LAGOS_CITIZENS_MEDIATION_BUREAU.name
);

assert.equal(
  lagosTenancy.emailRoutingExpected,
  true
);

assert.equal(
  lagosTenancy.deliveryMethod,
  "verified_email_or_walk_in"
);

console.log(
  "✅ LAGOS LANDLORD-TENANT DISPUTES ROUTE TO THE VERIFIED CMB CHANNEL"
);

/* ======================================================
   LAGOS LMDC ROUTING
====================================================== */

const lagosCommercial =
  resolveCivilRouting({
    complaint:
      "My business partner breached our agreement and I request commercial mediation.",

    disputeLocation:
      "Lagos State",
  });

assert.equal(
  lagosCommercial.routeKey,
  "lagos_lmdc"
);

assert.equal(
  lagosCommercial.primaryInstitution,
  LAGOS_MULTI_DOOR_COURTHOUSE.name
);

assert.equal(
  lagosCommercial.disputeType,
  "private_contract"
);

assert.equal(
  lagosCommercial.emailRoutingExpected,
  false
);

assert.equal(
  lagosCommercial.submissionUrl,
  LAGOS_MULTI_DOOR_COURTHOUSE
    .contact
    .judiciary_contact
);

console.log(
  "✅ COMPLEX LAGOS CIVIL AND COMMERCIAL ADR ROUTES TO LMDC"
);

/* ======================================================
   COURT ESCALATION
====================================================== */

const courtClaim =
  resolveCivilRouting({
    complaint:
      "The debtor refused mediation and I now want to file a small claims court action.",

    disputeLocation:
      "Abuja",
  });

assert.equal(
  courtClaim.routeKey,
  "fct_small_claims_or_magistrates"
);

assert.equal(
  courtClaim.primaryInstitution,
  RELEVANT_SMALL_CLAIMS_OR_MAGISTRATES_COURT.name
);

assert.equal(
  courtClaim.deliveryMethod,
  "official_dynamic_court_registry"
);

assert.equal(
  courtClaim.emailRoutingExpected,
  false
);

console.log(
  "✅ FAILED OR REFUSED MEDIATION ROUTES TO THE RELEVANT COURT REGISTRY"
);

/* ======================================================
   OTHER-STATE ADR
====================================================== */

const stateAdr =
  resolveCivilRouting({
    complaint:
      "An individual has refused to repay my personal loan and I seek mediation.",

    disputeLocation:
      "Enugu State",
  });

assert.equal(
  stateAdr.routeKey,
  "state_adr_centre"
);

assert.equal(
  stateAdr.primaryInstitution,
  RELEVANT_STATE_ADR_CENTRE.name
);

assert.equal(
  stateAdr.deliveryMethod,
  "official_dynamic_adr_registry"
);

assert.equal(
  stateAdr.emailRoutingExpected,
  false
);

console.log(
  "✅ OTHER-STATE DISPUTES USE OFFICIAL DYNAMIC ADR RESOLUTION"
);

/* ======================================================
   UNKNOWN LOCATION FALLBACK
====================================================== */

const unknownLocation =
  resolveCivilRouting({
    complaint:
      "My former business partner breached our private agreement.",
  });

assert.equal(
  unknownLocation.routeKey,
  "formal_notice"
);

assert.equal(
  unknownLocation.primaryInstitution,
  "The Other Party to the Dispute"
);

assert.equal(
  unknownLocation.emailRoutingExpected,
  false
);

assert.match(
  unknownLocation.routingNote,
  /location was not established/i
);

console.log(
  "✅ UNKNOWN-LOCATION DISPUTES GENERATE A FORMAL-NOTICE FALLBACK"
);

/* ======================================================
   NO PCC MISROUTING
====================================================== */

for (
  const result
  of [
    fctTenancy,
    lagosTenancy,
    lagosCommercial,
    courtClaim,
    stateAdr,
    unknownLocation,
  ]
) {
  assert.equal(
    result.primaryInstitution.includes(
      "Public Complaints Commission"
    ),
    false
  );

  assert.equal(
    result.ccInstitutions.includes(
      "Public Complaints Commission (PCC)"
    ),
    false
  );
}

console.log(
  "✅ PRIVATE CIVIL DISPUTES DO NOT DEFAULT TO PCC"
);

/* ======================================================
   DYNAMIC-CONTACT SAFETY
====================================================== */

for (
  const authority
  of [
    ABUJA_MULTI_DOOR_COURT,
    LAGOS_MULTI_DOOR_COURTHOUSE,
    RELEVANT_STATE_ADR_CENTRE,
    RELEVANT_SMALL_CLAIMS_OR_MAGISTRATES_COURT,
  ]
) {
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
  RELEVANT_STATE_ADR_CENTRE.dynamic_route,
  true
);

assert.equal(
  RELEVANT_SMALL_CLAIMS_OR_MAGISTRATES_COURT.dynamic_route,
  true
);

console.log(
  "✅ COURT AND DYNAMIC ADR ROUTES DO NOT USE GUESSED EMAILS"
);

/* ======================================================
   KEYWORD SAFETY
====================================================== */

for (
  const keyword
  of [
    "private civil dispute",
    "landlord",
    "tenant",
    "private debt",
    "breach of private contract",
    "inheritance dispute",
    "Abuja Multi-Door Court (AMDC)",
    "Citizens' Mediation Bureau (CMB), Lagos State",
    "Lagos Multi-Door Courthouse (LMDC)",
    "Relevant State Multi-Door Courthouse or Official ADR Centre",
  ]
) {
  assert.ok(
    NIGERIAN_CIVIL_DISPUTE_DETECTION_KEYWORDS.includes(
      keyword
    ),
    keyword
  );
}

for (
  const wrongKeyword
  of [
    "electricity token",
    "bank transfer reversal",
    "airline baggage",
    "telecom data bundle",
    "university admission result",
    "passport renewal",
    "war crimes",
  ]
) {
  assert.equal(
    NIGERIAN_CIVIL_DISPUTE_DETECTION_KEYWORDS.includes(
      wrongKeyword
    ),
    false,
    wrongKeyword
  );
}

console.log(
  "✅ CIVIL-DISPUTE DETECTION KEYWORDS ARE CLEAN"
);

console.log(
  "✅ CIVIL-DISPUTE ROUTING IS PROTECTED BY NATIONAL REGRESSION TESTS"
);

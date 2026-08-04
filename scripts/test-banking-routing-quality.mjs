import assert from "node:assert/strict";

import {
  BANKING_GENERAL_WAITING_DAYS,
  BANKING_EXTENDED_WAITING_DAYS,
  evaluateBankingComplaintTiming,
} from "../lib/bankingComplaintTiming.mjs";

import {
  resolveJurisdictionRouting,
} from "../lib/jurisdictionEngine.mjs";

function isoDaysAgo(days) {
  const date = new Date();

  date.setUTCHours(
    0,
    0,
    0,
    0
  );

  date.setUTCDate(
    date.getUTCDate() -
    days
  );

  return date
    .toISOString()
    .slice(
      0,
      10
    );
}

const fixedDate =
  new Date(
    "2026-08-04T12:00:00Z"
  );

const initial =
  evaluateBankingComplaintTiming({
    complaint:
      "My withdrawal is failing.",

    escalationStage:
      "initial",

    asOfDate:
      fixedDate,
  });

assert.equal(
  initial.stage,
  "provider_initial"
);

assert.equal(
  initial.routeKey,
  "bank_provider_first"
);

assert.equal(
  initial.waitingPeriodDays,
  BANKING_GENERAL_WAITING_DAYS
);

console.log(
  "✅ FIRST BANKING COMPLAINT ROUTES TO PROVIDER"
);

const missingDate =
  evaluateBankingComplaintTiming({
    complaint:
      "My earlier complaint remains unresolved.",

    escalationStage:
      "unresolved",

    priorComplaintReference:
      "TEST-REF-001",

    asOfDate:
      fixedDate,
  });

assert.equal(
  missingDate.stage,
  "provider_escalation_information_required"
);

assert.equal(
  missingDate.requiresPriorComplaintDate,
  true
);

assert.equal(
  missingDate.escalationEligible,
  false
);

console.log(
  "✅ CBN ESCALATION REQUIRES THE PRIOR COMPLAINT DATE"
);

const missingReference =
  evaluateBankingComplaintTiming({
    complaint:
      "My earlier complaint remains unresolved.",

    escalationStage:
      "unresolved",

    priorComplaintDate:
      "2026-07-01",

    asOfDate:
      fixedDate,
  });

assert.equal(
  missingReference.stage,
  "provider_escalation_information_required"
);

assert.equal(
  missingReference.requiresPriorComplaintReference,
  true
);

console.log(
  "✅ CBN ESCALATION REQUIRES THE PROVIDER REFERENCE"
);

const generalPending =
  evaluateBankingComplaintTiming({
    complaint:
      "My failed withdrawal complaint remains unresolved.",

    escalationStage:
      "unresolved",

    priorComplaintReference:
      "TEST-REF-002",

    priorComplaintDate:
      "2026-07-30",

    bankingComplaintType:
      "general_banking",

    asOfDate:
      fixedDate,
  });

assert.equal(
  generalPending.stage,
  "provider_follow_up_pending"
);

assert.equal(
  generalPending.daysElapsed,
  5
);

assert.equal(
  generalPending.daysRemaining,
  9
);

assert.equal(
  generalPending.escalationEligible,
  false
);

console.log(
  "✅ GENERAL BANKING COMPLAINT WAITS 14 DAYS"
);

const generalReady =
  evaluateBankingComplaintTiming({
    complaint:
      "My failed withdrawal complaint remains unresolved.",

    escalationStage:
      "unresolved",

    priorComplaintReference:
      "TEST-REF-003",

    priorComplaintDate:
      "2026-07-20",

    bankingComplaintType:
      "general_banking",

    asOfDate:
      fixedDate,
  });

assert.equal(
  generalReady.stage,
  "cbn_escalation_ready"
);

assert.equal(
  generalReady.escalationEligible,
  true
);

assert.equal(
  generalReady.routeKey,
  "cbn_consumer_protection"
);

console.log(
  "✅ GENERAL BANKING COMPLAINT ESCALATES AFTER 14 DAYS"
);

const loanPending =
  evaluateBankingComplaintTiming({
    complaint:
      "My loan complaint remains unresolved.",

    escalationStage:
      "unresolved",

    priorComplaintReference:
      "TEST-LOAN-001",

    priorComplaintDate:
      "2026-07-15",

    bankingComplaintType:
      "loan_or_credit",

    asOfDate:
      fixedDate,
  });

assert.equal(
  loanPending.complaintType,
  "loan_or_credit"
);

assert.equal(
  loanPending.waitingPeriodDays,
  BANKING_EXTENDED_WAITING_DAYS
);

assert.equal(
  loanPending.stage,
  "provider_follow_up_pending"
);

assert.equal(
  loanPending.daysElapsed,
  20
);

assert.equal(
  loanPending.daysRemaining,
  10
);

console.log(
  "✅ LOAN COMPLAINT WAITS 30 DAYS"
);

const loanReady =
  evaluateBankingComplaintTiming({
    complaint:
      "My loan complaint remains unresolved.",

    escalationStage:
      "unresolved",

    priorComplaintReference:
      "TEST-LOAN-002",

    priorComplaintDate:
      "2026-07-01",

    bankingComplaintType:
      "loan_or_credit",

    asOfDate:
      fixedDate,
  });

assert.equal(
  loanReady.stage,
  "cbn_escalation_ready"
);

assert.equal(
  loanReady.escalationEligible,
  true
);

console.log(
  "✅ LOAN COMPLAINT ESCALATES AFTER 30 DAYS"
);

const excessChargePending =
  evaluateBankingComplaintTiming({
    complaint:
      "The bank imposed unauthorised charges on my account.",

    escalationStage:
      "unresolved",

    priorComplaintReference:
      "TEST-CHARGE-001",

    priorComplaintDate:
      "2026-07-15",

    asOfDate:
      fixedDate,
  });

assert.equal(
  excessChargePending.complaintType,
  "excess_charges"
);

assert.equal(
  excessChargePending.waitingPeriodDays,
  30
);

assert.equal(
  excessChargePending.stage,
  "provider_follow_up_pending"
);

console.log(
  "✅ EXCESS-CHARGE COMPLAINT WAITS 30 DAYS"
);

const invalidFutureDate =
  evaluateBankingComplaintTiming({
    complaint:
      "My earlier complaint remains unresolved.",

    escalationStage:
      "unresolved",

    priorComplaintReference:
      "TEST-FUTURE-001",

    priorComplaintDate:
      "2026-08-10",

    asOfDate:
      fixedDate,
  });

assert.equal(
  invalidFutureDate.dateInvalid,
  true
);

assert.equal(
  invalidFutureDate.stage,
  "provider_complaint_date_in_future"
);

console.log(
  "✅ FUTURE COMPLAINT DATE IS REJECTED"
);

function bankingRoute(
  overrides = {}
) {
  return resolveJurisdictionRouting({
    sector:
      "banking",

    complaint:
      "I have been unable to withdraw from my account.",

    institutionName:
      "Stanbic",

    issueLocation:
      "Warri",

    escalationStage:
      "initial",

    country:
      "Nigeria",

    ...overrides,
  });
}

const providerFirst =
  bankingRoute();

assert.equal(
  providerFirst.routeKey,
  "bank_provider_first"
);

assert.equal(
  providerFirst.primaryInstitution,
  "Stanbic IBTC Bank Limited"
);

assert.equal(
  providerFirst.bankingTiming.stage,
  "provider_initial"
);

const incompleteEscalation =
  bankingRoute({
    complaint:
      "My earlier complaint remains unresolved.",

    escalationStage:
      "unresolved",

    priorComplaintReference:
      "TEST-STANBIC-001",
  });

assert.equal(
  incompleteEscalation.routeKey,
  "bank_provider_escalation_information_required"
);

assert.equal(
  incompleteEscalation.primaryInstitution,
  "Stanbic IBTC Bank Limited"
);

assert.equal(
  incompleteEscalation.bankingTiming.escalationEligible,
  false
);

assert.doesNotMatch(
  incompleteEscalation.primaryInstitution,
  /Central Bank/i
);

const followUpPending =
  bankingRoute({
    complaint:
      "My withdrawal complaint remains unresolved.",

    escalationStage:
      "unresolved",

    priorComplaintReference:
      "TEST-STANBIC-002",

    priorComplaintDate:
      isoDaysAgo(
        5
      ),

    bankingComplaintType:
      "general_banking",
  });

assert.equal(
  followUpPending.routeKey,
  "bank_provider_follow_up"
);

assert.equal(
  followUpPending.primaryInstitution,
  "Stanbic IBTC Bank Limited"
);

assert.equal(
  followUpPending.bankingTiming.daysRemaining,
  9
);

assert.equal(
  followUpPending.bankingTiming.escalationEligible,
  false
);

const cbnReady =
  bankingRoute({
    complaint:
      "My withdrawal complaint remains unresolved.",

    escalationStage:
      "unresolved",

    priorComplaintReference:
      "TEST-STANBIC-003",

    priorComplaintDate:
      isoDaysAgo(
        15
      ),

    bankingComplaintType:
      "general_banking",
  });

assert.equal(
  cbnReady.routeKey,
  "cbn_consumer_protection"
);

assert.equal(
  cbnReady.primaryInstitution,
  "Central Bank of Nigeria (CBN)"
);

assert.deepEqual(
  cbnReady.ccInstitutions,
  [
    "Stanbic IBTC Bank Limited",
  ]
);

assert.equal(
  cbnReady.bankingTiming.escalationEligible,
  true
);

for (
  const forbidden
  of [
    "Public Complaints Commission",
    "Federal Competition and Consumer Protection Commission",
  ]
) {
  assert.doesNotMatch(
    JSON.stringify(
      cbnReady
    ),
    new RegExp(
      forbidden,
      "i"
    )
  );
}

console.log(
  "✅ LIVE BANKING RESOLVER PREVENTS PREMATURE CBN ESCALATION"
);

console.log(
  "✅ LIVE BANKING RESOLVER ESCALATES ONLY AFTER THE APPLICABLE PERIOD"
);

console.log(
  "✅ BANKING ROUTING-QUALITY TIMING PASSED"
);

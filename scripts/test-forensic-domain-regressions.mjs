import assert from "node:assert/strict";

import {
  NIGERIAN_AVIATION_DETECTION_KEYWORDS,
} from "../lib/nigeriaAviationRegistry.mjs";

import * as BankingRegistry from "../lib/nigeriaBankingRegistry.mjs";

import {
  detectInstitutionSector,
} from "../lib/institutionSectorPriority.mjs";

import {
  resolveAviationRouting,
  resolveBankingRouting,
} from "../lib/regulatedSectorJurisdiction.mjs";

import fs from "node:fs";

const regulatedSectorSource = fs.readFileSync(
  new URL("../lib/regulatedSectorJurisdiction.mjs", import.meta.url),
  "utf8"
);
assert.equal(
  regulatedSectorSource.includes("\u0008"),
  false,
  "Generated regulated-sector routing source must not contain backspace control characters"
);

const daysAgo = days =>
  new Date(
    Date.now() - days * 24 * 60 * 60 * 1000
  ).toISOString().slice(0, 10);

assert.equal(
  NIGERIAN_AVIATION_DETECTION_KEYWORDS.includes("refund"),
  false,
  "Standalone refund must not classify a complaint as aviation"
);
assert.equal(
  NIGERIAN_AVIATION_DETECTION_KEYWORDS.includes("ticket refund"),
  true,
  "Aviation-specific ticket refund signal must remain"
);

const tloanSector = detectInstitutionSector("Tloan online app");
assert.equal(tloanSector.matched, true);
assert.equal(tloanSector.sector, "banking");

const tloanProvider =
  BankingRegistry.NIGERIAN_BANKING_PROVIDERS.find(
    provider => provider.key === "giasun_tloan"
  );
assert.ok(
  tloanProvider,
  "GIASUN/Tloan must be present in the financial-services provider registry"
);
assert.equal(
  tloanProvider.name,
  "GIASUN TECHNOLOGY NIGERIA LIMITED"
);
assert.equal(tloanProvider.category, "digital_lender");
assert.ok(tloanProvider.aliases.includes("Tloan"));

assert.ok(
  BankingRegistry.FCCPC_DIGITAL_LENDING_AUTHORITY,
  "FCCPC digital-lending authority must be defined"
);
assert.deepEqual(
  BankingRegistry.FCCPC_DIGITAL_LENDING_AUTHORITY.contact.emails,
  ["lenderstaskforce@fccpc.gov.ng"]
);

const falseAviation = resolveAviationRouting({
  complaint:
    "I used Tloan for a digital loan and I am disputing the loan refund, repayment amount, interest and recovery harassment.",
  institutionName: "Tloan online app",
  issueLocation: "Lagos State",
  escalationStage: "initial",
  country: "Nigeria",
});
assert.equal(
  falseAviation.matched,
  false,
  "A digital lender must never be accepted as an unknown aviation provider"
);

const genuineUnknownAirline = resolveAviationRouting({
  complaint:
    "My flight was cancelled after check-in and I am requesting a ticket refund.",
  institutionName: "Example Airways",
  issueLocation: "Lagos State",
  escalationStage: "initial",
  country: "Nigeria",
});
assert.equal(
  genuineUnknownAirline.matched,
  true,
  "A genuinely aviation-shaped unlisted provider must remain safely routable"
);

const tloanInitial = resolveBankingRouting({
  complaint:
    "I obtained a digital loan through Tloan. I dispute the amount disbursed, interest and repayment demand.",
  institutionName: "Tloan online app",
  issueLocation: "Lagos State",
  escalationStage: "initial",
  bankingComplaintType: "loan_credit",
  country: "Nigeria",
});
assert.equal(tloanInitial.matched, true);
assert.equal(tloanInitial.sector, "banking");
assert.equal(
  tloanInitial.primaryInstitution,
  "GIASUN TECHNOLOGY NIGERIA LIMITED"
);
assert.equal(
  tloanInitial.jurisdiction,
  "fccpc_deon_consumer_lending"
);
assert.equal(
  tloanInitial.routeKey,
  "bank_provider_first"
);
assert.equal(tloanInitial.bankingTiming.waitingPeriodDays, 14);
assert.equal(tloanInitial.emailRoutingExpected, true);
assert.ok(
  tloanInitial.contactEmails.includes(
    "GiasunTechnology@gmail.com"
  )
);

const veendEscalation = resolveBankingRouting({
  complaint:
    "I complained to Veend about a digital loan deduction and repayment dispute but it remains unresolved.",
  institutionName: "VeendHQ",
  issueLocation: "Abuja",
  escalationStage: "unresolved",
  priorComplaintReference: "VEEND-TEST-123",
  priorComplaintDate: daysAgo(20),
  bankingComplaintType: "loan_credit",
  country: "Nigeria",
});
assert.equal(veendEscalation.matched, true);
assert.equal(
  veendEscalation.routeKey,
  "fccpc_digital_lending_complaint"
);
assert.equal(
  veendEscalation.primaryInstitution,
  "Federal Competition and Consumer Protection Commission (FCCPC)"
);
assert.ok(
  veendEscalation.ccInstitutions.includes("VeendHQ Limited")
);
assert.deepEqual(
  veendEscalation.contactEmails,
  ["lenderstaskforce@fccpc.gov.ng"]
);
assert.equal(veendEscalation.bankingTiming.waitingPeriodDays, 14);
assert.equal(veendEscalation.bankingTiming.routeTo, "fccpc");

const unverifiedDigitalLender = resolveBankingRouting({
  complaint:
    "I complained about a digital loan app and the repayment dispute remains unresolved.",
  institutionName: "ExampleQuickLoan App",
  issueLocation: "Lagos State",
  escalationStage: "unresolved",
  priorComplaintReference: "EXAMPLE-123",
  priorComplaintDate: daysAgo(40),
  bankingComplaintType: "loan_credit",
  country: "Nigeria",
});
assert.equal(unverifiedDigitalLender.matched, true);
assert.equal(
  unverifiedDigitalLender.routeKey,
  "digital_lender_regulatory_status_verification_required"
);
assert.equal(
  unverifiedDigitalLender.primaryInstitution,
  "ExampleQuickLoan App"
);
assert.doesNotMatch(
  unverifiedDigitalLender.primaryInstitution,
  /Central Bank|Competition and Consumer Protection/i
);

const gtbankEscalation = resolveBankingRouting({
  complaint:
    "I complained to GTBank about a loan and the complaint remains unresolved.",
  institutionName: "GTBank",
  issueLocation: "Abuja",
  escalationStage: "unresolved",
  priorComplaintReference: "GTB-TEST-123",
  priorComplaintDate: daysAgo(35),
  bankingComplaintType: "loan_credit",
  country: "Nigeria",
});
assert.equal(gtbankEscalation.matched, true);
assert.equal(
  gtbankEscalation.routeKey,
  "cbn_consumer_protection"
);
assert.equal(
  gtbankEscalation.primaryInstitution,
  "Central Bank of Nigeria (CBN)"
);
assert.equal(gtbankEscalation.bankingTiming.waitingPeriodDays, 30);
assert.equal(gtbankEscalation.bankingTiming.routeTo, "cbn");

console.log("✅ FORENSIC DOMAIN REGRESSIONS PASSED");

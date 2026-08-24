import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  completePetitionDraft,
  inspectPetitionDraft,
} from "../lib/petitionDraftQuality.mjs";
import {
  resolveBankingRouting,
} from "../lib/regulatedSectorJurisdiction.mjs";
import {
  resolveDeliveryPlan,
} from "../lib/routingDelivery.mjs";
import {
  findRegisteredBankingProvider,
} from "../lib/nigeriaBankingRegistry.mjs";

const complaint = [
  "I obtained a Remita payroll loan through VeendHQ Limited.",
  "The genuine loan principal was ₦258,960, repayable in six instalments of ₦43,160.",
  "On 29 December 2025, VeendHQ deducted the agreed ₦43,160 instalment under mandate 101387212319.",
  "An unauthorized additional deduction of ₦60,000 was made under Remita mandate 191386747802 and repayment reference 1402370295.",
  "My FirstBank account statement covering October to December 2025 proves there was no ₦60,000 loan disbursement.",
  "A different loan credit of ₦151,320 and my salary credit of ₦123,931.41 are fully accounted for.",
].join(" ");

const decision = resolveBankingRouting({
  complaint,
  escalationStage: "initial",
  bankingComplaintType: "loan_or_credit",
  country: "Nigeria",
});

assert.equal(decision.primaryInstitution, "VeendHQ Limited");
assert.deepEqual(decision.ccInstitutions, [
  "Remita Payment Service Limited",
]);
assert.deepEqual(decision.contactEmails, [
  "support@veendhq.com",
]);
assert.equal(decision.bankingTiming.escalationEligible, false);
assert.doesNotMatch(decision.primaryInstitution, /FirstBank|First Bank/i);

const remita = findRegisteredBankingProvider("remita");
const delivery = resolveDeliveryPlan({
  routingDecision: decision,
  catalogCcItems: [{
    name: remita.name,
    emails: remita.contact.emails,
  }],
});

assert.deepEqual(delivery.toInstitutions, ["VeendHQ Limited"]);
assert.deepEqual(delivery.toEmails, ["support@veendhq.com"]);
assert.deepEqual(delivery.ccInstitutions, ["Remita Payment Service Limited"]);
assert.deepEqual(delivery.ccEmails, ["support@remita.net"]);

const explicitBank = resolveBankingRouting({
  complaint,
  institutionName: "FirstBank",
  escalationStage: "initial",
  country: "Nigeria",
});

assert.equal(explicitBank.primaryInstitution, "First Bank of Nigeria Limited");

const petitioner = {
  fullName: "Nelson Ononivami Oniwon",
  phone: "08073371450",
  email: "vami@example.com",
};

const unfinished = [
  "Date: 24/08/2026",
  "PETITIONER DETAILS:\nName: Nelson Ononivami Oniwon",
  "TO: VeendHQ Limited\nCC: Remita Payment Service Limited",
  "SUBJECT: DISPUTED UNAUTHORISED DEDUCTION OF ₦60,000",
  "Dear Sir/Madam,",
  "INTRODUCTION:\n- I request investigation of a disputed Remita payroll-loan deduction.",
  "FACTS / BACKGROUND:\n1. VeendHQ deducted ₦60,000 without a matching loan disbursement.\n2. My December 2025 salary credit was ₦123,931.41 under Remita salary",
].join("\n\n");

const inspection = inspectPetitionDraft(unfinished, petitioner.fullName);

assert.equal(inspection.complete, false);
assert.equal(inspection.hasClosing, false);
assert.ok(inspection.missingHeadings.includes("DEMANDS / RELIEFS SOUGHT:"));

const repaired = completePetitionDraft(unfinished, {
  complaint,
  sector: "banking",
  primaryInstitution: decision.primaryInstitution,
  ccInstitutions: decision.ccInstitutions,
  petitioner,
});

assert.equal(repaired.repaired, true);
assert.equal(inspectPetitionDraft(repaired.text, petitioner.fullName).complete, true);
assert.doesNotMatch(repaired.text, /under Remita salary\s*ISSUES/i);
assert.match(repaired.text, /ISSUES FOR DETERMINATION:/);
assert.match(repaired.text, /LEGAL FRAMEWORK & GROUNDS:/);
assert.match(repaired.text, /DEMANDS \/ RELIEFS SOUGHT:[\s\S]*refund[\s\S]*₦60,000/i);
assert.match(repaired.text, /NOTICE & ESCALATION:/);
assert.match(repaired.text, /LIST OF ATTACHMENTS \(if any\):/);
assert.match(repaired.text, /Yours faithfully,\s*Nelson Ononivami Oniwon\s*08073371450\s*vami@example\.com\s*$/);
assert.match(repaired.text, /VeendHQ Limited and Remita Payment Service Limited/);

const unchanged = completePetitionDraft(repaired.text, {
  complaint,
  sector: "banking",
  petitioner,
});

assert.equal(unchanged.repaired, false);
assert.equal(unchanged.text, repaired.text);

const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

assert.match(server, /maxOutputTokens:\s*12288/);
assert.match(server, /completePetitionDraft\(/);
assert.match(server, /do not treat a bank that merely issued an account statement as the respondent/i);

console.log("✅ VEENDHQ REMITA PAYROLL LOANS ROUTE TO THE RESPONSIBLE LENDER");
console.log("✅ REMITA IS COPIED ONLY AS AN INVOLVED PAYMENT-MANDATE PROCESSOR");
console.log("✅ FIRSTBANK ACCOUNT STATEMENTS ARE EVIDENCE, NOT THE COMPLAINT RESPONDENT");
console.log("✅ BOTH DELIVERY EMAILS COME FROM VERIFIED OFFICIAL INSTITUTION CHANNELS");
console.log("✅ EXPLICIT BANK RESPONDENTS AND CBN TIMING SAFEGUARDS ARE PRESERVED");
console.log("✅ UNFINISHED PETITIONS ARE COMPLETED WITH EVIDENCE-BASED LEGAL RELIEF");
console.log("✅ EVERY PETITION CONCLUDES WITH ITS NOTICE, ATTACHMENTS AND SIGNATURE");
console.log("✅ COMPLETE PETITIONS ARE NOT REWRITTEN OR MODIFIED");
console.log("✅ PETITION DRAFT QUALITY AND RESPONDENT-ROUTING CONTRACT PASSED");

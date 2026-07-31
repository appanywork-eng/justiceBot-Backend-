import assert from "node:assert/strict";

import {
  sanitizeLegalDraft,
} from "../lib/legalDraftSafety.mjs";

const unsafeBankingDraft = `
Date: 31/07/2026

FACTS / BACKGROUND:
1. The customer alleges that the bank deducted ₦7,000.00 from the account.
2. The customer requested an explanation.

LEGAL FRAMEWORK & GROUNDS:
- Central Bank of Nigeria Guide to Charges regulates SMS alerts, which are typically ₦4 per SMS, and prohibits excessive deductions.
- CBN consumer-protection rules require fair treatment and transparent complaint resolution.
- Financial institutions owe a fiduciary duty to every customer.

DEMANDS / RELIEFS SOUGHT:
1. Refund the disputed ₦7,000.00 if investigation confirms it was wrongly charged.
2. Mandatory sanction or penalty against the bank.

Yours faithfully,
Test User
`;

const cleaned =
  sanitizeLegalDraft(
    unsafeBankingDraft,
    "banking"
  );

assert.match(
  cleaned,
  /FACTS \/ BACKGROUND:[\s\S]*₦7,000\.00/
);

assert.match(
  cleaned,
  /DEMANDS \/ RELIEFS SOUGHT:[\s\S]*₦7,000\.00/
);

assert.doesNotMatch(
  cleaned,
  /₦4\s+per\s+SMS/i
);

assert.doesNotMatch(
  cleaned,
  /mandatory sanction/i
);

assert.doesNotMatch(
  cleaned,
  /mandatory penalty/i
);

assert.doesNotMatch(
  cleaned,
  /fiduciary duty/i
);

assert.match(
  cleaned,
  /CBN consumer-protection and banking-charge rules require charges to be authorised/i
);

assert.match(
  cleaned,
  /regulator considers lawful and justified/i
);

assert.match(
  cleaned,
  /applicable regulatory or contractual obligations/i
);

const nonBankingDraft = `
LEGAL FRAMEWORK & GROUNDS:
- The complainant alleges that ₦4 was deducted.
DEMANDS / RELIEFS SOUGHT:
1. Appropriate relief.
`;

const nonBankingResult =
  sanitizeLegalDraft(
    nonBankingDraft,
    "general"
  );

assert.match(
  nonBankingResult,
  /₦4 was deducted/
);

console.log(
  "✅ USER-SUPPLIED DISPUTED AMOUNT IS PRESERVED"
);

console.log(
  "✅ UNSUPPORTED BANKING RATE IS REMOVED"
);

console.log(
  "✅ MANDATORY PENALTY LANGUAGE IS SOFTENED"
);

console.log(
  "✅ UNSUPPORTED FIDUCIARY-DUTY CLAIM IS REMOVED"
);

console.log(
  "✅ NON-BANKING FACTS ARE NOT OVER-SANITISED"
);

import assert from "node:assert/strict";
import fs from "node:fs";

import {
  resolveDeliveryPlan,
} from "../lib/routingDelivery.mjs";

const serverSource = fs.readFileSync(
  new URL("../server.mjs", import.meta.url),
  "utf8"
);

const fnStart = serverSource.indexOf(
  "async function resolveComplaintRouting({"
);
assert.notEqual(fnStart, -1);

const rawStart = serverSource.indexOf(
  "const rawJurisdictionRouting =",
  fnStart
);
assert.notEqual(rawStart, -1);

const routingBlock = serverSource.slice(
  fnStart,
  rawStart + 800
);

const selectionStart = routingBlock.indexOf(
  "let sector ="
);
assert.notEqual(
  selectionStart,
  -1,
  "Sector-selection block missing"
);

const selectionBlock = routingBlock.slice(
  selectionStart
);

const electionIndex = selectionBlock.indexOf(
  "electionViolencePriority.matched"
);
const institutionIndex = selectionBlock.indexOf(
  "institutionPriority.matched"
);
const explicitIndex = selectionBlock.indexOf(
  "requestedSector"
);
const antiIndex = selectionBlock.indexOf(
  "complaintPriority.sector"
);
const civilIndex = selectionBlock.indexOf(
  "preSectorRouting.matched"
);

for (const [label, value] of Object.entries({
  electionIndex,
  institutionIndex,
  explicitIndex,
  antiIndex,
  civilIndex,
})) {
  assert.ok(value >= 0, `${label} missing from routing block`);
}

assert.ok(
  electionIndex < institutionIndex,
  "Election-violence safety priority must remain first"
);
assert.ok(
  institutionIndex < antiIndex,
  "Known institution must beat generic anti-corruption keywords"
);
assert.ok(
  institutionIndex < civilIndex,
  "Known institution must beat generic civil-dispute keywords"
);
assert.ok(
  explicitIndex < antiIndex,
  "Explicit sector must beat generic anti-corruption keywords"
);
assert.ok(
  explicitIndex < civilIndex,
  "Explicit sector must beat generic civil-dispute keywords"
);

assert.match(
  routingBlock,
  /source\s*===\s*"pre_sector_jurisdiction"[\s\S]*?\?\s*preSectorRouting[\s\S]*?:\s*resolveJurisdictionRouting/
);

const strictPrimaryPlan = resolveDeliveryPlan({
  routingDecision: {
    matched: true,
    primaryInstitution:
      "Example Verified Authority",
    ccInstitutions: [],
    deliveryMethod:
      "official_institution_channel_resolution_required",
    emailRoutingExpected: false,
    contactEmails: [],
    contactAddress: "",
    submissionUrl: "",
    sourceUrls: [],
  },
  catalogToItems: [
    {
      name:
        "Wrong Catalogue Authority",
      emails: [
        "wrong@example.gov.ng",
      ],
      primaryAddress:
        "99 Wrong Street, Abuja",
    },
    {
      name:
        "Example Verified Authority",
      aliases: [
        "EVA",
      ],
      emails: [
        "verified@example.gov.ng",
      ],
      primaryAddress:
        "1 Correct Street, Abuja",
    },
  ],
});

assert.deepEqual(
  strictPrimaryPlan.toEmails,
  ["verified@example.gov.ng"]
);
assert.equal(
  strictPrimaryPlan.emailRoutingAvailable,
  true
);
assert.equal(
  strictPrimaryPlan.submissionRoute.contactAddress,
  "1 Correct Street, Abuja"
);
assert.equal(
  strictPrimaryPlan.toEmails.includes(
    "wrong@example.gov.ng"
  ),
  false
);

const portalOnlyPlan = resolveDeliveryPlan({
  routingDecision: {
    matched: true,
    primaryInstitution:
      "Example Portal Authority",
    ccInstitutions: [],
    deliveryMethod:
      "official_complaint_portal",
    emailRoutingExpected: false,
    contactEmails: [],
    contactAddress: "",
    submissionUrl:
      "https://example.gov.ng/complaints",
    sourceUrls: [
      "https://example.gov.ng/complaints",
    ],
  },
  catalogToItems: [
    {
      name:
        "Example Portal Authority",
      emails: [
        "portal-email-that-must-not-be-used@example.gov.ng",
      ],
    },
  ],
});

assert.deepEqual(
  portalOnlyPlan.toEmails,
  []
);
assert.equal(
  portalOnlyPlan.emailRoutingAvailable,
  false
);
assert.equal(
  portalOnlyPlan.submissionRoute.portalRoutingAvailable,
  true
);

const physicalOnlyPlan = resolveDeliveryPlan({
  routingDecision: {
    matched: true,
    primaryInstitution:
      "Example Physical Registry",
    ccInstitutions: [],
    deliveryMethod:
      "physical_filing",
    emailRoutingExpected: false,
    contactEmails: [],
    contactAddress:
      "2 Registry Road, Abuja",
    submissionUrl: "",
    sourceUrls: [],
  },
  catalogToItems: [
    {
      name:
        "Example Physical Registry",
      emails: [
        "physical-email-that-must-not-be-used@example.gov.ng",
      ],
    },
  ],
});

assert.deepEqual(
  physicalOnlyPlan.toEmails,
  []
);
assert.equal(
  physicalOnlyPlan.emailRoutingAvailable,
  false
);
assert.equal(
  physicalOnlyPlan.submissionRoute.physicalRoutingAvailable,
  true
);

console.log(
  "✅ FORENSIC ROUTING REGRESSIONS PASSED"
);

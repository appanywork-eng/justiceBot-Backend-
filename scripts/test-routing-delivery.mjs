import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";

import {
  buildStructuredComplaintPrompt,
  resolveDeliveryPlan,
} from "../lib/routingDelivery.mjs";

import {
  resolveBankingRouting,
} from "../lib/regulatedSectorJurisdiction.mjs";

import {
  resolveGeneralRouting,
} from "../lib/finalSectorJurisdiction.mjs";

const draftingPrompt =
  buildStructuredComplaintPrompt({
    complaint:
      "A transfer failed and the money has not been reversed.",

    institutionName:
      "GTBank",

    issueLocation:
      "Kubwa, Abuja",

    institutionLevel:
      "private_regulated",

    escalationStage:
      "unresolved",

    priorComplaintReference:
      "GTB-45879",

    country:
      "Nigeria",
  });

assert.match(
  draftingPrompt,
  /GTBank/
);

assert.match(
  draftingPrompt,
  /Kubwa, Abuja/
);

assert.match(
  draftingPrompt,
  /unresolved/
);

assert.match(
  draftingPrompt,
  /GTB-45879/
);

const bankDecision =
  resolveBankingRouting({
    institutionName:
      "GTBank",

    complaint:
      "I have a disputed transfer.",

    escalationStage:
      "initial",

    country:
      "Nigeria",
  });

const bankPlan =
  resolveDeliveryPlan({
    routingDecision:
      bankDecision,

    legacyToEmails: [
      "wrong-legacy@example.com",
    ],
  });

assert.equal(
  bankPlan.matched,
  true
);

assert.equal(
  bankPlan.emailRoutingAvailable,
  true
);

assert.deepEqual(
  bankPlan.toEmails,
  [
    "gtbankmailsupport@gtbank.com",
  ]
);

assert.equal(
  bankPlan.toEmails.includes(
    "wrong-legacy@example.com"
  ),
  false
);

const portalPlan =
  resolveDeliveryPlan({
    routingDecision: {
      matched: true,

      primaryInstitution:
        "Example Portal Authority",

      ccInstitutions: [],

      deliveryMethod:
        "official_complaint_portal",

      emailRoutingExpected:
        false,

      contactEmails: [
        "must-not-be-used@example.com",
      ],

      submissionUrl:
        "https://example.gov.ng/complaints",

      contactAddress: "",

      sourceUrls: [
        "https://example.gov.ng/complaints",
      ],
    },

    legacyToEmails: [
      "legacy@example.com",
    ],
  });

assert.deepEqual(
  portalPlan.toEmails,
  []
);

assert.equal(
  portalPlan.emailRoutingAvailable,
  false
);

assert.equal(
  portalPlan.submissionRoute
    .portalRoutingAvailable,
  true
);

const physicalPlan =
  resolveDeliveryPlan({
    routingDecision: {
      matched: true,

      primaryInstitution:
        "Example Physical Registry",

      ccInstitutions: [],

      deliveryMethod:
        "physical_filing",

      emailRoutingExpected:
        false,

      contactEmails: [],

      submissionUrl: "",

      contactAddress:
        "1 Example Street, Abuja, Nigeria",

      sourceUrls: [
        "https://example.gov.ng/contact",
      ],
    },
  });

assert.equal(
  physicalPlan.submissionRoute
    .physicalRoutingAvailable,
  true
);

assert.equal(
  physicalPlan.primaryItem
    .primaryAddress,
  "1 Example Street, Abuja, Nigeria"
);

const generalDecision =
  resolveGeneralRouting({
    institutionName:
      "Example Federal Ministry",

    complaint:
      "The ministry delayed my application and refused to respond.",

    country:
      "Nigeria",
  });

const generalPlan =
  resolveDeliveryPlan({
    routingDecision:
      generalDecision,
  });

assert.equal(
  generalPlan.emailRoutingAvailable,
  true
);

assert.ok(
  generalPlan.toEmails.includes(
    "complaint@pcc.gov.ng"
  )
);

const serverSource =
  readFileSync(
    new URL(
      "../server.mjs",
      import.meta.url
    ),
    "utf8"
  );

assert.match(
  serverSource,
  /buildStructuredComplaintPrompt/
);

assert.match(
  serverSource,
  /resolveDeliveryPlan/
);

assert.match(
  serverSource,
  /submissionRoute/
);

console.log(
  "✅ ROUTING DELIVERY PIPELINE PASSED"
);

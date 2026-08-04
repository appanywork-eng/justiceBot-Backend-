import assert from "node:assert/strict";

import {
  findRegisteredBankingProvider,
} from "../lib/nigeriaBankingRegistry.mjs";

import {
  resolveBankingRouting,
} from "../lib/regulatedSectorJurisdiction.mjs";


const stanbic =
  findRegisteredBankingProvider(
    "stanbic"
  );

assert.ok(
  stanbic,
  "Stanbic registry record was not found"
);

assert.equal(
  stanbic.name,
  "Stanbic IBTC Bank Limited"
);

assert.equal(
  stanbic
    .verification
    .direct_email_verified,
  true
);

assert.ok(
  stanbic.contact.emails.includes(
    "CustomerCareNigeria@stanbicibtc.com"
  )
);

assert.ok(
  stanbic.contact.phones.includes(
    "+234 700 909 9099"
  )
);

assert.match(
  stanbic.contact.complaint_form,
  /^https:\/\/www\.stanbicibtcbank\.com\//
);

assert.match(
  stanbic.contact.address,
  /Walter Carrington Crescent/i
);

assert.ok(
  stanbic
    .verification
    .source_urls
    .length >= 3
);

console.log(
  "✅ STANBIC VERIFIED CONTACT RECORD IS COMPLETE"
);


const stanbicRoute =
  resolveBankingRouting({
    complaint:
      "I cannot withdraw money from my Stanbic account.",

    institutionName:
      "Stanbic",

    issueLocation:
      "Lagos",

    escalationStage:
      "initial",

    country:
      "Nigeria",
  });

assert.equal(
  stanbicRoute.routeKey,
  "bank_provider_first"
);

assert.equal(
  stanbicRoute.primaryInstitution,
  "Stanbic IBTC Bank Limited"
);

assert.equal(
  stanbicRoute.emailRoutingExpected,
  true
);

assert.ok(
  stanbicRoute.contactEmails.includes(
    "CustomerCareNigeria@stanbicibtc.com"
  )
);

assert.ok(
  stanbicRoute.contactPhoneNumbers.includes(
    "+234 700 909 9099"
  )
);

assert.match(
  stanbicRoute.submissionUrl,
  /^https:\/\/www\.stanbicibtcbank\.com\//
);

assert.match(
  stanbicRoute.contactAddress,
  /Victoria Island/i
);

assert.ok(
  stanbicRoute.sourceUrls.length >= 3
);

console.log(
  "✅ STANBIC FIRST COMPLAINT EXPOSES VERIFIED DELIVERY CHANNELS"
);


const accessRoute =
  resolveBankingRouting({
    complaint:
      "I have an account complaint.",

    institutionName:
      "Access Bank",

    escalationStage:
      "initial",

    country:
      "Nigeria",
  });

assert.equal(
  accessRoute.emailRoutingExpected,
  false
);

assert.deepEqual(
  accessRoute.contactEmails,
  []
);

console.log(
  "✅ UNENRICHED BANKS RETAIN SAFE NO-EMAIL ROUTING"
);


const unknownRoute =
  resolveBankingRouting({
    complaint:
      "I have an account complaint.",

    institutionName:
      "Example Community Bank",

    escalationStage:
      "initial",

    country:
      "Nigeria",
  });

assert.equal(
  unknownRoute.emailRoutingExpected,
  false
);

assert.deepEqual(
  unknownRoute.contactEmails,
  []
);

assert.equal(
  unknownRoute.submissionUrl,
  ""
);

console.log(
  "✅ UNKNOWN FINANCIAL-INSTITUTION CONTACTS ARE NEVER INVENTED"
);

console.log(
  "✅ BANKING DELIVERY-QUALITY PILOT PASSED"
);

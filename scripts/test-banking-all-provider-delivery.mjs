import assert from "node:assert/strict";
import fs from "node:fs";

import {
  NIGERIAN_BANKING_PROVIDERS,
} from "../lib/nigeriaBankingRegistry.mjs";

import {
  VERIFIED_BANKING_CHANNELS,
} from "../lib/nigeriaVerifiedBankingChannels.mjs";

import {
  resolveBankingRouting,
} from "../lib/regulatedSectorJurisdiction.mjs";


assert.equal(
  NIGERIAN_BANKING_PROVIDERS.length,
  41
);

assert.equal(
  Object.keys(
    VERIFIED_BANKING_CHANNELS
  ).length,
  38
);


const uniqueKeys =
  new Set(
    NIGERIAN_BANKING_PROVIDERS.map(
      item => item.key
    )
  );

assert.equal(
  uniqueKeys.size,
  NIGERIAN_BANKING_PROVIDERS.length,
  "Banking provider keys must remain unique"
);


for (
  const provider
  of NIGERIAN_BANKING_PROVIDERS
) {
  assert.equal(
    provider
      .verification
      .direct_email_verified,
    true,
    `${provider.key} must have a verified direct email`
  );

  assert.ok(
    Array.isArray(
      provider.contact.emails
    ) &&
    provider.contact.emails.length,
    `${provider.key} must expose at least one email`
  );

  assert.ok(
    Array.isArray(
      provider.verification.source_urls
    ) &&
    provider.verification.source_urls.length,
    `${provider.key} must retain official source URLs`
  );

  assert.ok(
    provider.contact.website ||
    provider.contact.complaint_portal ||
    provider.contact.complaint_form,
    `${provider.key} must expose an official submission channel`
  );


  const route =
    resolveBankingRouting({
      complaint:
        `I have an unresolved account or transaction complaint against ${provider.name}.`,

      institutionName:
        provider.name,

      issueLocation:
        "Abuja",

      escalationStage:
        "initial",

      country:
        "Nigeria",
    });


  assert.equal(
    route.routeKey,
    "bank_provider_first",
    `${provider.key} must use provider-first routing`
  );

  assert.equal(
    route.primaryInstitution,
    provider.name,
    `${provider.key} resolved to the wrong institution`
  );

  assert.equal(
    route.emailRoutingExpected,
    true,
    `${provider.key} must expose its verified email route`
  );

  assert.deepEqual(
    route.contactEmails,
    [
      ...provider.contact.emails,
    ],
    `${provider.key} runtime emails differ from its registry`
  );

  assert.ok(
    route.submissionUrl,
    `${provider.key} must expose an official submission URL`
  );

  assert.ok(
    Array.isArray(
      route.sourceUrls
    ) &&
    route.sourceUrls.length,
    `${provider.key} runtime route has no verification sources`
  );
}


const catalogue =
  JSON.parse(
    fs.readFileSync(
      new URL(
        "../data/banking.json",
        import.meta.url
      ),
      "utf8"
    )
  );


assert.equal(
  catalogue.players.length,
  41
);


for (
  const provider
  of NIGERIAN_BANKING_PROVIDERS
) {
  const catalogueRecord =
    catalogue.players.find(
      item =>
        item.key ===
        provider.key
    );

  assert.ok(
    catalogueRecord,
    `${provider.key} is missing from data/banking.json`
  );

  assert.deepEqual(
    catalogueRecord.contact.emails,
    [
      ...provider.contact.emails,
    ],
    `${provider.key} catalogue and runtime emails have drifted`
  );

  assert.equal(
    catalogueRecord
      .verification
      .direct_email_verified,
    true,
    `${provider.key} catalogue verification flag is incorrect`
  );
}


const unknownRoute =
  resolveBankingRouting({
    complaint:
      "I have an account complaint.",

    institutionName:
      "Example Unregistered Community Finance Institution",

    issueLocation:
      "Nigeria",

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
  "✅ 41 BANKING AND PAYMENT PROVIDERS ARE ROUTABLE"
);

console.log(
  "✅ ALL 41 PROVIDERS EXPOSE VERIFIED DIRECT EMAIL ROUTES"
);

console.log(
  "✅ BANKING CATALOGUE AND RUNTIME REGISTRY ARE SYNCHRONISED"
);

console.log(
  "✅ UNREGISTERED FINANCIAL INSTITUTIONS REMAIN SAFE"
);

console.log(
  "✅ BULK BANKING DELIVERY CONTRACT PASSED"
);

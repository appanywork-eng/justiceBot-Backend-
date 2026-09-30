import assert from "node:assert/strict";
import fs from "node:fs";

import {
  NIGERIAN_POWER_PROVIDERS,
} from "../lib/nigeriaPowerRegistry.mjs";

import {
  resolvePowerRouting,
} from "../lib/regulatedSectorJurisdiction.mjs";


assert.equal(
  NIGERIAN_POWER_PROVIDERS.length,
  11
);


const uniqueKeys =
  new Set(
    NIGERIAN_POWER_PROVIDERS.map(
      provider =>
        provider.key
    )
  );


assert.equal(
  uniqueKeys.size,
  11,
  "Power provider keys must remain unique"
);


for (
  const provider
  of NIGERIAN_POWER_PROVIDERS
) {
  assert.equal(
    provider
      .verification
      .status,
    "VERIFIED_OFFICIAL_SOURCE",
    `${provider.key}: verification status missing`
  );

  assert.equal(
    provider
      .verification
      .direct_email_verified,
    true,
    `${provider.key}: verified email flag disabled`
  );

  assert.ok(
    Array.isArray(
      provider.contact.emails
    ) &&
    provider.contact.emails.length,
    `${provider.key}: verified email missing`
  );

  assert.ok(
    Array.isArray(
      provider
        .verification
        .source_urls
    ) &&
    provider
      .verification
      .source_urls
      .length,
    `${provider.key}: official sources missing`
  );


  const route =
    resolvePowerRouting({
      sector:
        "power",

      complaint:
        `I have a billing, meter or electricity-service complaint against ${provider.name}.`,

      institutionName:
        provider.testInput ||
        provider.name,

      issueLocation:
        "Nigeria",

      escalationStage:
        "initial",

      country:
        "Nigeria",
    });


  assert.equal(
    route.matched,
    true,
    `${provider.key}: route did not match`
  );

  assert.equal(
    route.sector,
    "power",
    `${provider.key}: wrong sector`
  );

  assert.equal(
    route.routeKey,
    "power_provider_first",
    `${provider.key}: wrong route key`
  );

  assert.equal(
    route.primaryInstitution,
    provider.name,
    `${provider.key}: wrong recipient`
  );

  assert.equal(
    route.emailRoutingExpected,
    true,
    `${provider.key}: verified email routing disabled`
  );

  assert.deepEqual(
    route.contactEmails,
    [
      ...provider.contact.emails,
    ],
    `${provider.key}: runtime email mismatch`
  );

  assert.deepEqual(
    route.contactPhoneNumbers,
    [
      ...provider
        .contact
        .phone_numbers,
    ],
    `${provider.key}: runtime telephone mismatch`
  );

  assert.ok(
    route.submissionUrl,
    `${provider.key}: submission URL missing`
  );

  assert.ok(
    Array.isArray(
      route.sourceUrls
    ) &&
    route.sourceUrls.length,
    `${provider.key}: runtime sources missing`
  );


  console.log(
    `✅ ${provider.key.toUpperCase()} VERIFIED PROVIDER ROUTE PASSED`
  );
}


const catalogue =
  JSON.parse(
    fs.readFileSync(
      new URL(
        "../data/power.json",
        import.meta.url
      ),
      "utf8"
    )
  );


assert.equal(
  catalogue.players.length,
  11
);


for (
  const provider
  of NIGERIAN_POWER_PROVIDERS
) {
  const catalogueRecord =
    catalogue.players.find(
      item =>
        item.name ===
        provider.name
    );

  assert.ok(
    catalogueRecord,
    `${provider.key}: catalogue record missing`
  );

  assert.deepEqual(
    [
      ...provider.contact.emails,
    ],
    catalogueRecord.contact.emails,
    `${provider.key}: catalogue and runtime emails differ`
  );

  assert.deepEqual(
    [
      ...provider
        .contact
        .phone_numbers,
    ],
    catalogueRecord.contact.phones,
    `${provider.key}: catalogue and runtime telephones differ`
  );

  assert.deepEqual(
    [
      ...provider
        .verification
        .source_urls,
    ],
    catalogueRecord
      .verification
      .source_urls,
    `${provider.key}: catalogue and runtime sources differ`
  );
}


const unknownName =
  "Example Unregistered Electricity Distribution Company";


const unknownRoute =
  resolvePowerRouting({
    sector:
      "power",

    complaint:
      "I have an electricity billing complaint.",

    institutionName:
      unknownName,

    issueLocation:
      "Nigeria",

    escalationStage:
      "initial",

    country:
      "Nigeria",
  });


assert.equal(
  unknownRoute.matched,
  true
);

assert.equal(
  unknownRoute.sector,
  "power"
);

assert.equal(
  unknownRoute.routeKey,
  "power_provider_first"
);

assert.equal(
  unknownRoute.primaryInstitution,
  unknownName
);

assert.equal(
  unknownRoute.emailRoutingExpected,
  false
);

assert.deepEqual(
  unknownRoute.contactEmails,
  []
);

assert.deepEqual(
  unknownRoute.contactPhoneNumbers,
  []
);

assert.equal(
  unknownRoute.submissionUrl,
  ""
);


console.log();
console.log(
  "✅ ALL 11 DISCOS EXPOSE VERIFIED CONTACT CHANNELS"
);

console.log(
  "✅ POWER CATALOGUE AND RUNTIME REGISTRY ARE SYNCHRONISED"
);

console.log(
  "✅ UNKNOWN ELECTRICITY PROVIDERS REMAIN SAFELY ROUTABLE"
);

console.log(
  "✅ POWER PROVIDER DELIVERY CONTRACT PASSED"
);

import assert from "node:assert/strict";
import fs from "node:fs";

import {
  NIGERIAN_POWER_PROVIDERS,
  NIGERIAN_POWER_DETECTION_KEYWORDS,
  TRANSITIONED_STATE_REGULATORS,
} from "../lib/nigeriaPowerRegistry.mjs";

import {
  buildSectorDetectionText,
} from "../lib/sectorDetectionContext.mjs";

import {
  resolvePowerRouting,
} from "../lib/regulatedSectorJurisdiction.mjs";

assert.equal(
  NIGERIAN_POWER_PROVIDERS.length,
  11
);

const initialComplaint =
  "I paid for an electricity token but no token was issued for my metre.";

for (
  const provider
  of NIGERIAN_POWER_PROVIDERS
) {
  const detectionText =
    buildSectorDetectionText({
      complaint:
        initialComplaint,

      institutionName:
        provider.testInput,

      issueLocation:
        "Nigeria",
    });

  const route =
    resolvePowerRouting({
      sector:
        "power",

      complaint:
        detectionText,

      institutionName:
        provider.testInput,

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
    `${provider.key}: provider route did not match`
  );

  assert.equal(
    route.routeKey,
    "power_provider_first",
    `${provider.key}: wrong first-stage route`
  );

  assert.equal(
    route.primaryInstitution,
    provider.name,
    `${provider.key}: wrong primary institution`
  );

  const searchableTerms = [
    provider.name,
    ...provider.aliases,
  ]
    .map(
      value =>
        String(value)
          .toLowerCase()
    );

  const detected =
    searchableTerms.some(
      value =>
        NIGERIAN_POWER_DETECTION_KEYWORDS
          .includes(value)
    );

  assert.equal(
    detected,
    true,
    `${provider.key}: no nationwide detection keyword`
  );

  console.log(
    `✅ ${provider.key.toUpperCase()} FIRST COMPLAINT ROUTES CORRECTLY`
  );
}

const transitionedStateTests = [
  ["Abia", "EEDC", "abia"],
  ["Anambra", "EEDC", "anambra"],
  ["Bayelsa", "PHED", "bayelsa"],
  ["Edo", "BEDC", "edo"],
  ["Ekiti", "IBEDC", "ekiti"],
  ["Enugu", "EEDC", "enugu"],
  ["Gombe", "JED", "gombe"],
  ["Imo", "EEDC", "imo"],
  ["Kogi", "AEDC", "kogi"],
  ["Lagos", "Ikeja Electric", "lagos"],
  ["Nasarawa", "AEDC", "nasarawa"],
  ["Niger State", "AEDC", "niger"],
  ["Ogun", "IBEDC", "ogun"],
  ["Ondo", "BEDC", "ondo"],
  ["Oyo", "IBEDC", "oyo"],
  ["Plateau", "JED", "plateau"],
];

assert.equal(
  Object.keys(
    TRANSITIONED_STATE_REGULATORS
  ).length,
  16
);

for (
  const [
    stateName,
    providerInput,
    stateKey,
  ]
  of transitionedStateTests
) {
  const route =
    resolvePowerRouting({
      sector:
        "power",

      complaint:
        "My written electricity complaint remains unresolved.",

      institutionName:
        providerInput,

      issueLocation:
        stateName,

      escalationStage:
        "unresolved",

      priorComplaintReference:
        `TEST-${stateKey.toUpperCase()}-12345`,

      country:
        "Nigeria",
    });

  const expected =
    TRANSITIONED_STATE_REGULATORS[
      stateKey
    ];

  assert.equal(
    route.matched,
    true,
    `${stateName}: unresolved route did not match`
  );

  assert.equal(
    route.routeKey,
    "state_electricity_regulator",
    `${stateName}: did not route to state regulator`
  );

  assert.equal(
    route.primaryInstitution,
    expected.name,
    `${stateName}: wrong state regulator`
  );

  console.log(
    `✅ ${stateName.toUpperCase()} ROUTES TO ITS STATE REGULATOR`
  );
}

const fctRoute =
  resolvePowerRouting({
    sector:
      "power",

    complaint:
      "My written AEDC complaint remains unresolved.",

    institutionName:
      "AEDC",

    issueLocation:
      "FCT",

    escalationStage:
      "unresolved",

    priorComplaintReference:
      "TEST-FCT-12345",

    country:
      "Nigeria",
  });

assert.equal(
  fctRoute.routeKey,
  "nerc_abuja_forum"
);

assert.equal(
  fctRoute.primaryInstitution,
  "NERC Abuja Forum"
);

console.log(
  "✅ FCT ROUTES TO NERC ABUJA FORUM"
);

const nonTransitionRoute =
  resolvePowerRouting({
    sector:
      "power",

    complaint:
      "My written PHED complaint remains unresolved.",

    institutionName:
      "PHED",

    issueLocation:
      "Rivers State",

    escalationStage:
      "unresolved",

    priorComplaintReference:
      "TEST-RIVERS-12345",

    country:
      "Nigeria",
  });

assert.equal(
  nonTransitionRoute.routeKey,
  "nerc_forum_or_ticket"
);

assert.equal(
  nonTransitionRoute.primaryInstitution,
  "Nigerian Electricity Regulatory Commission (NERC)"
);

console.log(
  "✅ NON-TRANSITIONED STATE USES NERC REDRESS CHANNEL"
);

const powerData =
  JSON.parse(
    fs.readFileSync(
      "data/power.json",
      "utf8"
    )
  );

assert.equal(
  powerData.players.length,
  11
);

for (
  const provider
  of powerData.players
) {
  const emails =
    provider.contact?.emails || [];

  const portal =
    provider.contact
      ?.complaint_portal || "";

  assert.ok(
    emails.length > 0 ||
    portal,
    `${provider.name}: no verified complaint channel`
  );

  assert.equal(
    provider.verification?.status,
    "VERIFIED_OFFICIAL_SOURCE",
    `${provider.name}: verification status missing`
  );

  assert.ok(
    Array.isArray(
      provider.verification
        ?.source_urls
    ) &&
    provider.verification
      .source_urls.length > 0,
    `${provider.name}: official sources missing`
  );
}

const server =
  fs.readFileSync(
    "server.mjs",
    "utf8"
  );

assert.match(
  server,
  /power:\s*NIGERIAN_POWER_DETECTION_KEYWORDS/
);

console.log();
console.log(
  "✅ ALL 11 NIGERIAN DISCOS HAVE FIRST-STAGE ROUTING"
);

console.log(
  "✅ ALL 16 TRANSITIONED STATES HAVE STATE-REGULATOR ROUTING"
);

console.log(
  "✅ FCT AND NON-TRANSITIONED STATES HAVE NERC ROUTING"
);

console.log(
  "✅ ALL DISCOS HAVE VERIFIED CONTACT SOURCES"
);

console.log(
  "✅ POWER ROUTING IS NOW NATIONWIDE"
);

import assert from "node:assert/strict";
import fs from "node:fs";

import {
  buildSectorDetectionText,
} from "../lib/sectorDetectionContext.mjs";

import {
  NIGERIAN_POWER_DETECTION_KEYWORDS,
} from "../lib/nigeriaPowerRegistry.mjs";

import {
  resolvePowerRouting,
} from "../lib/regulatedSectorJurisdiction.mjs";

const detectionText =
  buildSectorDetectionText({
    complaint:
      "I bought a token unit of 5000 naira from AFEDC but no token was issued for my metre number 0011111111.",

    institutionName:
      "AFEDC",

    issueLocation:
      "FCT",
  });

assert.match(
  detectionText,
  /\baedc\b/i
);

assert.match(
  detectionText,
  /\bmeter\b/i
);

assert.match(
  detectionText,
  /\belectricity token\b/i
);

const firstComplaint =
  resolvePowerRouting({
    sector:
      "power",

    complaint:
      detectionText,

    institutionName:
      "AFEDC",

    issueLocation:
      "FCT",

    escalationStage:
      "initial",

    country:
      "Nigeria",
  });

assert.equal(
  firstComplaint.matched,
  true
);

assert.equal(
  firstComplaint.routeKey,
  "power_provider_first"
);

assert.equal(
  firstComplaint.primaryInstitution,
  "Abuja Electricity Distribution Plc (AEDC)"
);

assert.deepEqual(
  firstComplaint.ccInstitutions,
  []
);

const unresolvedComplaint =
  resolvePowerRouting({
    sector:
      "power",

    complaint:
      detectionText,

    institutionName:
      "AFEDC",

    issueLocation:
      "FCT",

    escalationStage:
      "unresolved",

    priorComplaintReference:
      "TEST-POWER-12345",

    country:
      "Nigeria",
  });

assert.equal(
  unresolvedComplaint.matched,
  true
);

assert.equal(
  unresolvedComplaint.routeKey,
  "nerc_abuja_forum"
);

assert.equal(
  unresolvedComplaint.primaryInstitution,
  "NERC Abuja Forum"
);

assert.deepEqual(
  unresolvedComplaint.ccInstitutions,
  [
    "Abuja Electricity Distribution Plc (AEDC)"
  ]
);

const powerData =
  JSON.parse(
    fs.readFileSync(
      "data/power.json",
      "utf8"
    )
  );

const aedc =
  powerData.players.find(
    item =>
      item.name.includes(
        "Abuja Electricity"
      )
  );

assert.ok(
  aedc
);

assert.ok(
  aedc.aliases.includes(
    "AFEDC"
  )
);

assert.deepEqual(
  aedc.contact.emails,
  [
    "customercare@abujaelectricity.com"
  ]
);

assert.equal(
  aedc.contact.complaint_portal,
  "https://aedc-selfcare.convergenceondemand.net"
);

const server =
  fs.readFileSync(
    "server.mjs",
    "utf8"
  );

assert.match(
  server,
  /detectSectorHeuristic\(\s*sectorDetectionText\s*\)/
);

assert.match(
  server,
  /detectSectorSmart\(\s*sectorDetectionText\s*\)/
);

assert.match(
  server,
  /NIGERIAN_POWER_DETECTION_KEYWORDS/
);

assert.ok(
  NIGERIAN_POWER_DETECTION_KEYWORDS
    .includes(
      "electricity token"
    )
);

assert.ok(
  NIGERIAN_POWER_DETECTION_KEYWORDS
    .includes(
      "prepaid token"
    )
);

console.log(
  "✅ AFEDC NORMALISES TO AEDC"
);

console.log(
  "✅ METRE NORMALISES TO METER"
);

console.log(
  "✅ TOKEN-UNIT COMPLAINT IS RECOGNISED AS ELECTRICITY"
);

console.log(
  "✅ FIRST COMPLAINT ROUTES TO AEDC"
);

console.log(
  "✅ UNRESOLVED FCT COMPLAINT ROUTES TO NERC ABUJA FORUM"
);

console.log(
  "✅ AEDC VERIFIED COMPLAINT EMAIL AND PORTAL SAVED"
);

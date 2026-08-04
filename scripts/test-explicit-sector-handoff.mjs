import assert from "node:assert/strict";
import fs from "node:fs";

import {
  resolveJurisdictionRouting,
} from "../lib/jurisdictionEngine.mjs";


const serverSource =
  fs.readFileSync(
    new URL(
      "../server.mjs",
      import.meta.url
    ),
    "utf8"
  );


assert.match(
  serverSource,
  /async function resolveComplaintRouting\(\{\s*sector:\s*requestedSectorInput\s*=\s*""/
);

assert.match(
  serverSource,
  /requestedSector\s*=\s*String\(requestedSectorInput\s*\|\|\s*""\)/
);

assert.match(
  serverSource,
  /else if\s*\(\s*requestedSector\s*\)\s*\{[\s\S]*?source\s*=\s*"explicit_sector"/
);


const endpointStart =
  serverSource.indexOf(
    'app.post(\n  "/routing/resolve"'
  );

assert.notEqual(
  endpointStart,
  -1,
  "/routing/resolve endpoint is missing"
);

const endpointEnd =
  serverSource.indexOf(
    "\napp.",
    endpointStart + 20
  );

const endpointSource =
  serverSource.slice(
    endpointStart,
    endpointEnd === -1
      ? undefined
      : endpointEnd
  );


assert.match(
  endpointSource,
  /const\s*\{\s*sector\s*=\s*""/
);

assert.match(
  endpointSource,
  /resolveComplaintRouting\(\{\s*sector,/
);


const unknownInstitution =
  "Example Unregistered Community Finance Institution";

const unknownRoute =
  resolveJurisdictionRouting({
    sector:
      "banking",

    complaint:
      "I have a complaint concerning my account with this financial institution.",

    institutionName:
      unknownInstitution,

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
  "banking"
);

assert.equal(
  unknownRoute.routeKey,
  "bank_provider_first"
);

assert.equal(
  unknownRoute.primaryInstitution,
  unknownInstitution
);

assert.equal(
  unknownRoute.emailRoutingExpected,
  false
);

assert.deepEqual(
  unknownRoute.contactEmails || [],
  []
);

assert.equal(
  unknownRoute.submissionUrl || "",
  ""
);


const remitaRoute =
  resolveJurisdictionRouting({
    sector:
      "banking",

    complaint:
      "I have an unresolved payment complaint.",

    institutionName:
      "Remita Payment Service Limited",

    issueLocation:
      "Abuja",

    escalationStage:
      "initial",

    country:
      "Nigeria",
  });


assert.equal(
  remitaRoute.primaryInstitution,
  "Remita Payment Service Limited"
);

assert.equal(
  remitaRoute.emailRoutingExpected,
  true
);

assert.ok(
  remitaRoute.contactEmails.includes(
    "support@remita.net"
  )
);


console.log(
  "✅ ROUTING ENDPOINT ACCEPTS EXPLICIT SECTOR"
);

console.log(
  "✅ EXPLICIT BANKING SECTOR PREVENTS PCC FALLBACK"
);

console.log(
  "✅ UNKNOWN FINANCIAL INSTITUTION REMAINS SAFE"
);

console.log(
  "✅ REGISTERED BANKING PROVIDERS REMAIN VERIFIED"
);

console.log(
  "✅ EXPLICIT SECTOR HANDOFF CONTRACT PASSED"
);

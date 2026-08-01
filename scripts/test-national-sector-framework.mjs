import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  NATIONAL_SECTOR_POLICIES,
  NATIONAL_SECTOR_KEYS,
  NATIONAL_SECTOR_DATA_FILES,
  assessInstitutionContactVerification,
} from "../lib/nationalSectorPolicy.mjs";

import {
  getJurisdictionCapabilities,
} from "../lib/jurisdictionEngine.mjs";

const root =
  process.cwd();

const dataDir =
  path.join(
    root,
    "data"
  );

assert.equal(
  NATIONAL_SECTOR_POLICIES.length,
  13
);

assert.equal(
  new Set(
    NATIONAL_SECTOR_KEYS
  ).size,
  13
);

assert.equal(
  new Set(
    NATIONAL_SECTOR_DATA_FILES
  ).size,
  13
);

console.log(
  "✅ ALL 13 ACTIVE SECTORS ARE IN THE NATIONAL POLICY REGISTRY"
);

const activeJsonFiles =
  fs.readdirSync(
    dataDir
  )
    .filter(
      filename =>
        filename.endsWith(
          ".json"
        )
    )
    .sort();

assert.deepEqual(
  activeJsonFiles,
  [
    ...NATIONAL_SECTOR_DATA_FILES,
  ].sort()
);

console.log(
  "✅ ALL ACTIVE SECTOR FILES ARE COVERED BY NATIONAL POLICY"
);

const capabilities =
  getJurisdictionCapabilities(
    NATIONAL_SECTOR_KEYS
  );

for (
  const sector
  of NATIONAL_SECTOR_KEYS
) {
  const capability =
    capabilities.sectors.find(
      item =>
        item.sector ===
        sector
    );

  assert.ok(
    capability,
    `${sector}: jurisdiction capability missing`
  );

  assert.equal(
    capability.status,
    "active",
    `${sector}: jurisdiction resolver is not active`
  );

  assert.equal(
    capability.requiresVerifiedData,
    true,
    `${sector}: verified-data requirement is disabled`
  );

  console.log(
    `✅ ${sector.toUpperCase()} HAS AN ACTIVE NATIONAL JURISDICTION RESOLVER`
  );
}

const verifiedExample = {
  name:
    "Verified Example Authority",

  contact: {
    emails: [
      "complaints@example.gov.ng"
    ],

    address:
      "1 Example Road, Nigeria",
  },

  verification: {
    status:
      "VERIFIED_OFFICIAL_SOURCE",

    verified_on:
      "2026-08-01",

    source_urls: [
      "https://example.gov.ng/contact"
    ],
  },
};

const unverifiedExample = {
  name:
    "Unverified Example Authority",

  contact: {
    emails: [
      "unverified@example.com"
    ],

    address:
      "Unknown Address",
  },
};

const pendingExample = {
  name:
    "Pending Example Authority",

  contact: {
    emails: [
      "pending@example.gov.ng"
    ],
  },

  verification: {
    status:
      "PENDING_VERIFICATION",

    source_urls: [
      "https://example.gov.ng"
    ],
  },
};

const verifiedDecision =
  assessInstitutionContactVerification({
    institution:
      verifiedExample,

    sectorData: {
      verification_policy: {
        official_sources_only:
          true,
      },
    },
  });

assert.equal(
  verifiedDecision
    .directContactAllowed,
  true
);

assert.equal(
  verifiedDecision
    .officialSources.length,
  1
);

console.log(
  "✅ VERIFIED OFFICIAL CONTACTS REMAIN AVAILABLE"
);

const unverifiedDecision =
  assessInstitutionContactVerification({
    institution:
      unverifiedExample,
  });

assert.equal(
  unverifiedDecision
    .directContactAllowed,
  false
);

console.log(
  "✅ UNVERIFIED DIRECT CONTACTS ARE BLOCKED"
);

const pendingDecision =
  assessInstitutionContactVerification({
    institution:
      pendingExample,
  });

assert.equal(
  pendingDecision
    .directContactAllowed,
  false
);

console.log(
  "✅ PENDING CONTACT VERIFICATION CANNOT EXPOSE AN EMAIL ROUTE"
);

function looksLikeInstitution(
  value
) {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(value)
  ) {
    return false;
  }

  const name =
    String(
      value.name ||
      value.institution ||
      value.organisation ||
      value.organization ||
      ""
    ).trim();

  if (!name) {
    return false;
  }

  return [
    "contact",
    "email",
    "emails",
    "address",
    "website",
    "portal",
    "verification",
    "aliases",
    "jurisdiction",
    "role",
    "type",
  ].some(
    key =>
      Object.hasOwn(
        value,
        key
      )
  );
}

function collectInstitutionRecords(
  value,
  records = []
) {
  if (
    Array.isArray(value)
  ) {
    for (
      const item
      of value
    ) {
      collectInstitutionRecords(
        item,
        records
      );
    }

    return records;
  }

  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return records;
  }

  if (
    looksLikeInstitution(
      value
    )
  ) {
    records.push(
      value
    );
  }

  for (
    const child
    of Object.values(
      value
    )
  ) {
    if (
      child &&
      typeof child ===
        "object"
    ) {
      collectInstitutionRecords(
        child,
        records
      );
    }
  }

  return records;
}

function containsEmail(
  value
) {
  if (
    typeof value ===
    "string"
  ) {
    return (
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(
        value
      )
    );
  }

  if (
    Array.isArray(value)
  ) {
    return value.some(
      containsEmail
    );
  }

  if (
    value &&
    typeof value ===
      "object"
  ) {
    return Object.values(
      value
    ).some(
      containsEmail
    );
  }

  return false;
}

console.log();
console.log(
  "NATIONAL SECTOR VERIFICATION READINESS"
);

console.log(
  "--------------------------------------"
);

let totalRecords = 0;
let verifiedContactRecords = 0;
let gatedContactRecords = 0;

for (
  const policy
  of NATIONAL_SECTOR_POLICIES
) {
  const filepath =
    path.join(
      dataDir,
      policy.dataFile
    );

  const sectorData =
    JSON.parse(
      fs.readFileSync(
        filepath,
        "utf8"
      )
    );

  const records =
    collectInstitutionRecords(
      sectorData
    );

  let sectorVerified = 0;
  let sectorGated = 0;

  for (
    const record
    of records
  ) {
    if (
      !containsEmail(
        record
      )
    ) {
      continue;
    }

    const verification =
      assessInstitutionContactVerification({
        institution:
          record,

        sectorData,
      });

    if (
      verification
        .directContactAllowed
    ) {
      sectorVerified += 1;
    } else {
      sectorGated += 1;
    }
  }

  totalRecords +=
    records.length;

  verifiedContactRecords +=
    sectorVerified;

  gatedContactRecords +=
    sectorGated;

  console.log();
  console.log(
    policy.label
  );

  console.log(
    `  Records: ${records.length}`
  );

  console.log(
    `  Verified direct-contact records: ${sectorVerified}`
  );

  console.log(
    `  Unverified direct-contact records gated: ${sectorGated}`
  );
}

const server =
  fs.readFileSync(
    "server.mjs",
    "utf8"
  );

assert.match(
  server,
  /assessInstitutionContactVerification/
);

assert.match(
  server,
  /contactVerification[\s\S]*directContactAllowed/
);

assert.match(
  server,
  /discoveredEmails/
);

assert.match(
  server,
  /discoveredAddresses/
);

console.log();
console.log(
  `Total institution records inspected: ${totalRecords}`
);

console.log(
  `Verified direct-contact records: ${verifiedContactRecords}`
);

console.log(
  `Unverified contact records safely gated: ${gatedContactRecords}`
);

console.log();
console.log(
  "✅ UNVERIFIED EMAILS AND ADDRESSES CANNOT BE EXPOSED BY THE CATALOGUE"
);

console.log(
  "✅ ALL 13 SECTORS USE THE SAME NATIONAL SAFETY FOUNDATION"
);

console.log(
  "✅ PETITIONDESK NATIONAL SECTOR FRAMEWORK PASSED"
);

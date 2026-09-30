import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import path from "node:path";

import {
  NATIONAL_SECTOR_POLICIES,
  assessInstitutionContactVerification,
} from "../lib/nationalSectorPolicy.mjs";

const root = process.cwd();
const auditDate = new Date("2026-09-28T00:00:00Z");
const staleAfterDays = 90;

function slug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "unspecified";
}

function recordName(value) {
  return String(
    value?.name ||
    value?.institution ||
    value?.organisation ||
    value?.organization ||
    ""
  ).trim();
}

function looksLikeInstitution(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  if (!recordName(value)) return false;

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
  ].some((key) => Object.hasOwn(value, key));
}

function collectInstitutionRecords(value, trail = [], output = []) {
  if (Array.isArray(value)) {
    value.forEach((child, index) => {
      collectInstitutionRecords(child, [...trail, String(index)], output);
    });
    return output;
  }

  if (!value || typeof value !== "object") return output;

  if (looksLikeInstitution(value)) {
    output.push({ record: value, trail });
  }

  for (const [key, child] of Object.entries(value)) {
    if (child && typeof child === "object") {
      collectInstitutionRecords(child, [...trail, key], output);
    }
  }

  return output;
}

function collectStrings(value, trail = [], output = []) {
  if (typeof value === "string") {
    output.push({ value: value.trim(), trail });
    return output;
  }

  if (Array.isArray(value)) {
    value.forEach((child, index) => {
      collectStrings(child, [...trail, String(index)], output);
    });
    return output;
  }

  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      collectStrings(child, [...trail, key], output);
    }
  }

  return output;
}

function emailsIn(value) {
  const emails = [];
  for (const item of collectStrings(value)) {
    emails.push(
      ...(item.value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [])
    );
  }
  return [...new Set(emails.map((email) => email.toLowerCase()))].sort();
}

function urlsIn(value) {
  const urls = [];
  for (const item of collectStrings(value)) {
    urls.push(...(item.value.match(/https?:\/\/[^\s"'<>]+/gi) || []));
  }
  return [...new Set(urls)].sort();
}

function functionalChannels(record) {
  const channels = new Set();
  const contactStrings = collectStrings(record).filter(
    ({ trail }) => !trail.includes("verification")
  );

  for (const { value, trail } of contactStrings) {
    const key = trail.join(".").toLowerCase();
    if (/@/.test(value) || key.includes("email")) channels.add("email");
    if (/phone|telephone|hotline|call/.test(key)) channels.add("telephone");
    if (/address|office|headquarters/.test(key)) channels.add("physical");
    if (/portal|form|ticket|directory|website|url|page|service/.test(key)) {
      channels.add("official-web-channel");
    }
  }

  return [...channels].sort();
}

function verificationDate(record) {
  return String(
    record?.verification?.verified_on ||
    record?.verified_on ||
    ""
  ).trim();
}

function issue(issues, recordKey, message) {
  issues.push(`${recordKey}: ${message}`);
}

const issues = [];
const warnings = [];
const allKeys = new Set();
const sectorSummaries = [];
let totalRecords = 0;
let directRecords = 0;
let portalOnlyRecords = 0;
let gatedRecords = 0;
let totalSources = 0;

assert.equal(NATIONAL_SECTOR_POLICIES.length, 16);

for (const policy of NATIONAL_SECTOR_POLICIES) {
  const dataPath = path.join(root, "data", policy.dataFile);
  const sectorData = JSON.parse(readFileSync(dataPath, "utf8"));
  const records = collectInstitutionRecords(sectorData);
  const sectorKeys = new Set();
  let sectorDirect = 0;
  let sectorPortalOnly = 0;
  let sectorGated = 0;

  for (const { record, trail } of records) {
    const name = recordName(record);
    const role =
      record.key ||
      record.role ||
      record.type ||
      record.jurisdiction ||
      trail.at(-1) ||
      "institution";
    const recordKey = `${policy.key}:${slug(name)}:${slug(role)}`;

    if (sectorKeys.has(recordKey) || allKeys.has(recordKey)) {
      issue(issues, recordKey, "duplicate stable institution/channel key");
    }
    sectorKeys.add(recordKey);
    allKeys.add(recordKey);

    const verification = assessInstitutionContactVerification({
      institution: record,
      sectorData,
    });
    const sources = verification.officialSources;
    const emails = emailsIn(record).filter(
      (email) => !emailsIn(record.verification || {}).includes(email)
    );
    const channels = functionalChannels(record);
    const verifiedOn = verificationDate(record);

    if (!/^(verified_official_source|verified)$/i.test(verification.status)) {
      issue(issues, recordKey, `unsupported verification status '${verification.status}'`);
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(verifiedOn)) {
      issue(issues, recordKey, "missing or invalid verification date");
    } else {
      const date = new Date(`${verifiedOn}T00:00:00Z`);
      if (Number.isNaN(date.getTime()) || date > auditDate) {
        issue(issues, recordKey, `impossible verification date '${verifiedOn}'`);
      } else {
        const ageDays = Math.floor((auditDate - date) / 86400000);
        if (ageDays > staleAfterDays) {
          warnings.push(`${recordKey}: verification is ${ageDays} days old`);
        }
      }
    }

    if (sources.length === 0) {
      issue(issues, recordKey, "no cited official source URL");
    }

    for (const source of sources) {
      let parsed;
      try {
        parsed = new URL(source);
      } catch {
        issue(issues, recordKey, `invalid source URL '${source}'`);
        continue;
      }

      if (parsed.protocol !== "https:") {
        issue(issues, recordKey, `official source is not HTTPS '${source}'`);
      }

      if (
        !parsed.hostname ||
        /(^|\.)(example|invalid|localhost)(\.|$)/i.test(parsed.hostname)
      ) {
        issue(issues, recordKey, `placeholder source host '${parsed.hostname}'`);
      }
    }

    for (const email of emails) {
      if (/(^|[.@_-])(example|placeholder|invalid|test)([.@_-]|$)/i.test(email)) {
        issue(issues, recordKey, `placeholder email '${email}'`);
      }
    }

    for (const url of urlsIn(record)) {
      if (/https?:\/\/(?:[^/]*\.)?(?:example|invalid|localhost)(?:[./]|$)/i.test(url)) {
        issue(issues, recordKey, `placeholder URL '${url}'`);
      }
    }

    if (verification.directContactAllowed && channels.length === 0) {
      issue(issues, recordKey, "verified record has no functional channel label");
    }

    if (emails.length > 0 && verification.directContactAllowed) {
      sectorDirect += 1;
    } else if (emails.length > 0) {
      sectorGated += 1;
    } else {
      sectorPortalOnly += 1;
    }

    totalSources += sources.length;
  }

  totalRecords += records.length;
  directRecords += sectorDirect;
  portalOnlyRecords += sectorPortalOnly;
  gatedRecords += sectorGated;
  sectorSummaries.push({
    sector: policy.key,
    records: records.length,
    direct: sectorDirect,
    portalOnly: sectorPortalOnly,
    gated: sectorGated,
  });
}

for (const summary of sectorSummaries) {
  console.log(
    `${summary.sector.padEnd(24)} records=${String(summary.records).padStart(3)} ` +
    `direct=${String(summary.direct).padStart(3)} ` +
    `portal-only=${String(summary.portalOnly).padStart(3)} ` +
    `gated=${String(summary.gated).padStart(3)}`
  );
}

console.log(`TOTAL_SECTORS=${sectorSummaries.length}`);
console.log(`TOTAL_RECORDS=${totalRecords}`);
console.log(`TOTAL_SOURCE_REFERENCES=${totalSources}`);
console.log(`VERIFIED_DIRECT_RECORDS=${directRecords}`);
console.log(`PORTAL_OR_NON_EMAIL_RECORDS=${portalOnlyRecords}`);
console.log(`UNVERIFIED_EMAIL_RECORDS_GATED=${gatedRecords}`);
console.log(`WARNINGS=${warnings.length}`);
for (const warning of warnings) console.warn(`WARN ${warning}`);

if (issues.length > 0) {
  throw new assert.AssertionError({
    message: `Routing source inventory found ${issues.length} issue(s):\n${issues.join("\n")}`,
    actual: issues.length,
    expected: 0,
    operator: "strictEqual",
  });
}

console.log("✅ ALL 16 SECTORS HAVE UNIQUE, TRACEABLE INSTITUTION RECORDS");
console.log("✅ OFFICIAL SOURCES, VERIFICATION DATES AND CHANNEL LABELS ARE VALID");
console.log("✅ PLACEHOLDER AND UNVERIFIED DIRECT CONTACTS CANNOT SHIP");

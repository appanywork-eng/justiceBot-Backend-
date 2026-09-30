import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const cloudBuild = fs.readFileSync("cloudbuild.yaml", "utf8");
const smoke = fs.readFileSync("scripts/smoke-release.mjs", "utf8");
const promotion = fs.readFileSync("scripts/promote-cloud-run.sh", "utf8");

const candidateTag = execFileSync(
  "bash",
  [
    "scripts/cloud-run-candidate-tag.sh",
    "petitiondesk-backend",
    "61de1745-c83a-44e5-9b8d-620127d8fb33",
  ],
  { encoding: "utf8" }
).trim();

assert.equal(candidateTag, "candidate-61de1745c83a");
assert.ok(
  "petitiondesk-backend".length + candidateTag.length <= 63,
  "Cloud Run service name and traffic tag must fit the platform limit."
);
assert.match(candidateTag, /^[a-z][a-z0-9-]*[a-z0-9]$/);

const trafficFixture = [
  "safety-staging\tpetitiondesk-backend-00014-yud\thttps://safety.example.run.app",
  "candidate-1e3e00f9b54e\tpetitiondesk-backend-00058-qwv\thttps://candidate.example.run.app",
].join("\n");
const taggedRecord = spawnSync(
  "bash",
  [
    "scripts/select-cloud-run-traffic.sh",
    "tag",
    "candidate-1e3e00f9b54e",
  ],
  { encoding: "utf8", input: trafficFixture }
);
assert.equal(taggedRecord.status, 0, taggedRecord.stderr);
assert.equal(
  taggedRecord.stdout.trim(),
  "petitiondesk-backend-00058-qwv\thttps://candidate.example.run.app"
);

const percentRecord = spawnSync(
  "bash",
  ["scripts/select-cloud-run-traffic.sh", "percent", "100"],
  {
    encoding: "utf8",
    input: [
      "100\tpetitiondesk-backend-00014-yud",
      "\tpetitiondesk-backend-00058-qwv",
    ].join("\n"),
  }
);
assert.equal(percentRecord.status, 0, percentRecord.stderr);
assert.equal(percentRecord.stdout.trim(), "petitiondesk-backend-00014-yud");

const readyCondition = spawnSync(
  "bash",
  ["scripts/select-cloud-run-traffic.sh", "condition", "Ready"],
  {
    encoding: "utf8",
    input: [
      "ConfigurationsReady\tTrue",
      "Ready\tTrue",
      "RoutesReady\tTrue",
    ].join("\n"),
  }
);
assert.equal(readyCondition.status, 0, readyCondition.stderr);
assert.equal(readyCondition.stdout.trim(), "True");

const promotionTestRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "petitiondesk-promotion-")
);
try {
  const fakeBin = path.join(promotionTestRoot, "bin");
  const commandLog = path.join(promotionTestRoot, "commands.log");
  const trafficState = path.join(promotionTestRoot, "candidate-serving");
  fs.mkdirSync(fakeBin);
  fs.writeFileSync(
    path.join(fakeBin, "gcloud"),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$PROMOTION_TEST_LOG"

if [[ "$*" == *"run revisions describe"* ]]; then
  if [[ "$*" == *"--flatten=status.conditions[]"* ]]; then
    printf 'ConfigurationsReady\\tTrue\\nReady\\tTrue\\nRoutesReady\\tTrue\\n'
  fi
elif [[ "$*" == *"run services describe"* && "$*" == *"status.traffic.percent"* ]]; then
  if [[ -f "$PROMOTION_TEST_STATE" ]]; then
    printf '100\\tpetitiondesk-backend-00059-soc\\n'
  else
    printf '100\\tpetitiondesk-backend-00014-yud\\n'
  fi
elif [[ "$*" == *"run services describe"* && "$*" == *"value(status.url)"* ]]; then
  printf 'https://petitiondesk.example.run.app\\n'
elif [[ "$*" == *"run services update-traffic"* ]]; then
  touch "$PROMOTION_TEST_STATE"
else
  printf 'Unexpected gcloud command: %s\\n' "$*" >&2
  exit 3
fi
`,
    { mode: 0o755 }
  );
  fs.writeFileSync(
    path.join(fakeBin, "node"),
    `#!/usr/bin/env bash
set -euo pipefail
printf 'node %s\\n' "$*" >> "$PROMOTION_TEST_LOG"
`,
    { mode: 0o755 }
  );

  const promotionResult = spawnSync(
    "bash",
    ["scripts/promote-cloud-run.sh"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH}`,
        PROJECT_ID: "petitiondesk-backend",
        REGION: "europe-west1",
        SERVICE: "petitiondesk-backend",
        CANDIDATE_REVISION: "petitiondesk-backend-00059-soc",
        CANDIDATE_URL: "https://candidate.example.run.app",
        PROMOTION_TEST_LOG: commandLog,
        PROMOTION_TEST_STATE: trafficState,
      },
    }
  );
  assert.equal(promotionResult.status, 0, promotionResult.stderr);
  assert.match(
    promotionResult.stdout,
    /Final traffic revision: petitiondesk-backend-00059-soc/
  );
} finally {
  fs.rmSync(promotionTestRoot, { recursive: true, force: true });
}

assert.match(cloudBuild, /node:22-bookworm/);
assert.match(cloudBuild, /npm ci --ignore-scripts/);
assert.match(cloudBuild, /npm test/);
assert.match(cloudBuild, /npm audit --omit=dev/);
assert.match(cloudBuild, /image_summary\.digest/);
assert.match(cloudBuild, /@sha256:/);
assert.match(cloudBuild, /--no-traffic/);
assert.match(cloudBuild, /cloud-run-candidate-tag\.sh/);
assert.match(cloudBuild, /--tag="\$\$CANDIDATE_TAG"/);
assert.match(cloudBuild, /--flatten='status\.traffic\[\]'/);
assert.match(
  cloudBuild,
  /value\(status\.traffic\.tag,status\.traffic\.revisionName,status\.traffic\.url\)/
);
assert.match(cloudBuild, /select-cloud-run-traffic\.sh tag/);
assert.doesNotMatch(cloudBuild, /status\.traffic\[\?tag=/);
assert.doesNotMatch(cloudBuild, /latestCreatedRevisionName/);
assert.match(cloudBuild, /candidate-url/);
assert.match(cloudBuild, /EXPECTED_REVISION/);
assert.match(cloudBuild, /scripts\/smoke-release\.mjs/);
assert.doesNotMatch(cloudBuild, /run services update-traffic/);
assert.doesNotMatch(cloudBuild, /--to-latest/);
assert.doesNotMatch(cloudBuild, /GEMINI_API_KEY=|FLW_SECRET_KEY=|FLW_WEBHOOK_HASH=|ADMIN_UNLOCK_KEY=/);

assert.match(smoke, /process\.env\.BASE_URL/);
assert.match(smoke, /process\.env\.EXPECTED_REVISION/);
assert.match(smoke, /\/health/);
assert.match(smoke, /\/ready/);
assert.match(smoke, /\/routing\/capabilities/);
assert.match(smoke, /totalSectors[^\n]*16|assert\.equal\([^\n]*totalSectors[^\n]*16/s);
assert.match(smoke, /activeResolvers[^\n]*16|assert\.equal\([^\n]*activeResolvers[^\n]*16/s);
assert.match(smoke, /capabilities\.sectors\.length, 16/);

assert.match(promotion, /set -euo pipefail/);
for (const variable of [
  "PROJECT_ID",
  "REGION",
  "SERVICE",
  "CANDIDATE_REVISION",
  "CANDIDATE_URL",
]) {
  assert.match(promotion, new RegExp(`require_env ${variable}`));
}
assert.match(promotion, /run revisions describe/);
assert.match(promotion, /Ready/);
assert.match(promotion, /PREVIOUS_REVISION/);
assert.equal(
  (promotion.match(/--flatten='status\.traffic\[\]'/g) || []).length,
  2,
  "Promotion must flatten traffic records for both rollback capture and final verification."
);
assert.equal(
  (promotion.match(/select-cloud-run-traffic\.sh percent 100/g) || []).length,
  2,
  "Promotion must select the exact 100%-serving revision twice."
);
assert.doesNotMatch(promotion, /status\.traffic\[percent=100\]/);
assert.match(promotion, /--to-revisions="\$\{CANDIDATE_REVISION\}=100"/);
assert.match(promotion, /--to-revisions="\$\{PREVIOUS_REVISION\}=100"/);
assert.match(promotion, /BASE_URL="\$CANDIDATE_URL" EXPECTED_REVISION="\$CANDIDATE_REVISION"/);
assert.match(promotion, /if ! BASE_URL="\$PRODUCTION_URL"/);
assert.match(promotion, /Rollback completed/);

console.log("✅ CLOUD BUILD VERIFIES INSTALL, TESTS AND PRODUCTION AUDIT BEFORE BUILD");
console.log("✅ CANDIDATE DEPLOYS BY IMMUTABLE DIGEST WITH ZERO TRAFFIC");
console.log("✅ CANDIDATE REVISION AND URL ARE CAPTURED AND SMOKED");
console.log("✅ CANDIDATE TAGS FIT THE CLOUD RUN COMBINED-NAME LIMIT");
console.log("✅ CLOUD BUILD CONTAINS NO PRODUCTION TRAFFIC MUTATION OR INLINE SECRETS");
console.log("✅ PETITIONDESK DEPLOYMENT CONTRACT PASSED");

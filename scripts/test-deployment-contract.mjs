import assert from "node:assert/strict";
import fs from "node:fs";

const cloudBuild = fs.readFileSync("cloudbuild.yaml", "utf8");
const smoke = fs.readFileSync("scripts/smoke-release.mjs", "utf8");
const promotion = fs.readFileSync("scripts/promote-cloud-run.sh", "utf8");

assert.match(cloudBuild, /node:22-bookworm/);
assert.match(cloudBuild, /npm ci --ignore-scripts/);
assert.match(cloudBuild, /npm test/);
assert.match(cloudBuild, /npm audit --omit=dev/);
assert.match(cloudBuild, /image_summary\.digest/);
assert.match(cloudBuild, /@sha256:/);
assert.match(cloudBuild, /--no-traffic/);
assert.match(cloudBuild, /--tag=candidate-/);
assert.match(cloudBuild, /latestCreatedRevisionName/);
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
assert.match(promotion, /status\.traffic\[percent=100\]\.revisionName/);
assert.match(promotion, /--to-revisions="\$\{CANDIDATE_REVISION\}=100"/);
assert.match(promotion, /--to-revisions="\$\{PREVIOUS_REVISION\}=100"/);
assert.match(promotion, /BASE_URL="\$CANDIDATE_URL" EXPECTED_REVISION="\$CANDIDATE_REVISION"/);
assert.match(promotion, /if ! BASE_URL="\$PRODUCTION_URL"/);
assert.match(promotion, /Rollback completed/);

console.log("✅ CLOUD BUILD VERIFIES INSTALL, TESTS AND PRODUCTION AUDIT BEFORE BUILD");
console.log("✅ CANDIDATE DEPLOYS BY IMMUTABLE DIGEST WITH ZERO TRAFFIC");
console.log("✅ CANDIDATE REVISION AND URL ARE CAPTURED AND SMOKED");
console.log("✅ CLOUD BUILD CONTAINS NO PRODUCTION TRAFFIC MUTATION OR INLINE SECRETS");
console.log("✅ PETITIONDESK DEPLOYMENT CONTRACT PASSED");

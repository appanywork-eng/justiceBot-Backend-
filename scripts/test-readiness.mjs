import assert from "node:assert/strict";
import fs from "node:fs";

import { evaluateReadiness } from "../lib/readiness.mjs";

const fullyReady = {
  production: true,
  firestoreEnabled: true,
  firestoreReachable: true,
  geminiConfigured: true,
  paymentConfigured: true,
  webhookConfigured: true,
};

assert.deepEqual(evaluateReadiness(fullyReady), {
  ready: true,
  checks: {
    firestore: true,
    gemini: true,
    payment: true,
    webhook: true,
  },
  missing: [],
});

for (const [field, missingLabel] of [
  ["firestoreEnabled", "firestore"],
  ["firestoreReachable", "firestore"],
  ["geminiConfigured", "gemini"],
  ["paymentConfigured", "payment"],
  ["webhookConfigured", "webhook"],
]) {
  const result = evaluateReadiness({ ...fullyReady, [field]: false });
  assert.equal(result.ready, false, `${field} must block production readiness`);
  assert.ok(result.missing.includes(missingLabel));
}

const multipleFailures = evaluateReadiness({
  ...fullyReady,
  firestoreReachable: false,
  paymentConfigured: false,
  webhookConfigured: false,
});
assert.equal(multipleFailures.ready, false);
assert.deepEqual(multipleFailures.missing, ["firestore", "payment", "webhook"]);

assert.deepEqual(
  evaluateReadiness({
    production: false,
    firestoreEnabled: false,
    firestoreReachable: false,
    geminiConfigured: false,
    paymentConfigured: false,
    webhookConfigured: false,
  }),
  {
    ready: true,
    checks: {
      firestore: true,
      gemini: true,
      payment: true,
      webhook: true,
    },
    missing: [],
  }
);

const serverSource = fs.readFileSync("server.mjs", "utf8");
const firestoreSource = fs.readFileSync("lib/firestoreRedisCompat.mjs", "utf8");

assert.match(serverSource, /app\.get\(\s*"\/ready"/);
assert.match(serverSource, /readiness\.ready\s*\?\s*200\s*:\s*503/);
assert.match(serverSource, /process\.env\.K_REVISION/);
assert.match(firestoreSource, /async healthCheck\(/);
assert.match(firestoreSource, /\.limit\(1\)\s*\.get\(\)/s);
assert.match(firestoreSource, /Promise\.race/);

const serialized = JSON.stringify(multipleFailures);
assert.doesNotMatch(serialized, /secret|provider error|api[_-]?key/i);

console.log("✅ PRODUCTION READINESS REQUIRES FIRESTORE AND ALL PROVIDER CONFIGURATION");
console.log("✅ LOCAL DEVELOPMENT REMAINS USABLE WITHOUT PRODUCTION DEPENDENCIES");
console.log("✅ READINESS OUTPUT CONTAINS STATUS LABELS ONLY");
console.log("✅ FIRESTORE READINESS USES A BOUNDED NON-MUTATING READ");
console.log("✅ PETITIONDESK READINESS CONTRACT PASSED");

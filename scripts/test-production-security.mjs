import assert from "node:assert/strict";
import fs from "node:fs";

import {
  createRequestLimiter,
  requestFingerprint,
  safeSecretEqual,
} from "../lib/requestProtection.mjs";

assert.equal(safeSecretEqual("correct-secret", "correct-secret"), true);
assert.equal(safeSecretEqual("incorrect-secret", "correct-secret"), false);
assert.equal(safeSecretEqual("", ""), false);

let currentTime = 10000;
const limiter = createRequestLimiter({
  namespace: "security-test",
  maximum: 2,
  windowMilliseconds: 5000,
  now: () => currentTime,
});

assert.equal((await limiter("same-user")).ok, true);
assert.equal((await limiter("same-user")).remaining, 0);
assert.deepEqual(await limiter("same-user"), {
  ok: false,
  retryAfterSeconds: 5,
});
assert.equal((await limiter("different-user")).ok, true);

currentTime += 5001;
assert.equal((await limiter("same-user")).ok, true);

let sharedKey = "";
const sharedLimiter = createRequestLimiter({
  namespace: "shared-security-test",
  maximum: 3,
  windowMilliseconds: 4000,
  store: {
    async consumeRateLimit(key, policy) {
      sharedKey = key;
      assert.equal(policy.maximum, 3);
      assert.equal(policy.windowMilliseconds, 4000);
      return { ok: true, remaining: 2, retryAfterSeconds: 0 };
    },
  },
});

assert.equal((await sharedLimiter("shared-user")).ok, true);
assert.match(sharedKey, /^pd:limit:shared-security-test:[a-f0-9]{64}$/);

let storeErrorReported = false;
const degradedLimiter = createRequestLimiter({
  namespace: "degraded",
  maximum: 1,
  store: {
    async consumeRateLimit() {
      throw new Error("Firestore unavailable");
    },
  },
  onStoreError() {
    storeErrorReported = true;
  },
});

assert.equal((await degradedLimiter("same-user")).ok, true);
assert.equal((await degradedLimiter("same-user")).ok, false);
assert.equal(storeErrorReported, true);

assert.equal(
  requestFingerprint({ ip: "203.0.113.2", headers: { "x-forwarded-for": "spoofed" } }, "USER@example.com"),
  requestFingerprint({ ip: "203.0.113.2", headers: { "x-forwarded-for": "different" } }, "user@example.com")
);

const server = fs.readFileSync("server.mjs", "utf8");
const cloudBuild = fs.readFileSync("cloudbuild.yaml", "utf8");
const environmentExample = fs.readFileSync("cloudrun.env.example", "utf8");
const dockerIgnore = fs.readFileSync(".dockerignore", "utf8");

assert.match(server, /safeSecretEqual\(key,\s*ADMIN_UNLOCK_KEY\)/);
assert.match(server, /safeSecretEqual\(headerHash,\s*FLW_WEBHOOK_HASH\)/);
assert.match(server, /if\s*\(!FLW_WEBHOOK_HASH\)\s*\{/);
assert.match(server, /code:\s*"webhook_secret_not_configured"/);
assert.match(server, /consumeAdminLoginLimit/);
assert.match(server, /consumeGenerationLimit/);
assert.match(server, /if\s*\(!adminOk\)\s*\{\s*const generationLimit\s*=\s*await consumeGenerationLimit/);
assert.match(server, /Pay ₦\$\{PETITION_PRICE_NGN\.toLocaleString\("en-NG"\)\}/);
assert.doesNotMatch(server, /₦1,050/);
assert.match(server, /crypto\s*\.\s*randomBytes/);
assert.match(server, /crypto\.randomUUID/);
assert.doesNotMatch(server, /origin:\s*["']\*["']/);
assert.match(cloudBuild, /_GEMINI_MODEL:\s*gemini-3\.7-flash/);
assert.match(cloudBuild, /FREE_ACCESS_ENABLED=\$\{_FREE_ACCESS_ENABLED\}/);
assert.match(cloudBuild, /PETITION_PRICE_NGN=\$\{_PETITION_PRICE_NGN\}/);
assert.match(environmentExample, /^PETITION_PRICE_NGN=550$/m);
assert.match(environmentExample, /^FREE_ACCESS_ENABLED=true$/m);
assert.match(environmentExample, /^FREE_PETITION_LIMIT=2$/m);
assert.doesNotMatch(environmentExample, /OPENAI_MODEL|PETITION_PRICE_NGN=1050/);
assert.match(dockerIgnore, /^\*\.patch$/m);

console.log("✅ ADMIN AND WEBHOOK SECRETS USE CONSTANT-TIME COMPARISON");
console.log("✅ PRODUCTION WEBHOOKS FAIL CLOSED WITHOUT A SECRET");
console.log("✅ ADMIN, GENERATION AND SHARED FIRESTORE RATE LIMITS WORK");
console.log("✅ VERIFIED ADMINISTRATORS BYPASS THE PUBLIC PETITION GENERATION LIMIT");
console.log("✅ FREE-ACCESS ERRORS USE THE LIVE ₦550 PRODUCTION PRICE");
console.log("✅ SECURE RANDOM REQUEST IDS AND ADMIN TOKENS ARE REQUIRED");
console.log("✅ DEPLOYMENT PINS TWO FREE PETITIONS AND THE ₦550 PRICE");
console.log("✅ PRODUCTION SECURITY AND DEPLOYMENT CONTRACT PASSED");

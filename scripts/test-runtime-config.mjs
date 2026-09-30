import assert from "node:assert/strict";

import {
  loadRuntimeConfig,
  parseIntegerEnv,
} from "../lib/runtimeConfig.mjs";

function parse(value, overrides = {}) {
  return parseIntegerEnv(value, {
    name: "EXAMPLE_LIMIT",
    defaultValue: 8,
    min: 0,
    max: 20,
    ...overrides,
  });
}

assert.equal(parse(undefined), 8);
assert.equal(parse(null), 8);
assert.equal(parse(""), 8);
assert.equal(parse("   "), 8);
assert.equal(parse("12"), 12);
assert.equal(parse(" 12 "), 12);
assert.equal(parse(0), 0);
assert.equal(parse("0"), 0);

for (const value of ["2.5", 2.5, "NaN", Number.NaN, "Infinity", Infinity]) {
  assert.throws(
    () => parse(value),
    /EXAMPLE_LIMIT must be an integer between 0 and 20/
  );
}

for (const value of [-1, "-1", 21, "21"]) {
  assert.throws(
    () => parse(value),
    /EXAMPLE_LIMIT must be an integer between 0 and 20/
  );
}

assert.throws(
  () => parseIntegerEnv(undefined, {
    name: "BROKEN_DEFAULT",
    defaultValue: -1,
    min: 0,
    max: 10,
  }),
  /BROKEN_DEFAULT default must be an integer between 0 and 10/
);

const defaults = loadRuntimeConfig({});

assert.deepEqual(defaults, {
  geminiTimeoutMs: 30000,
  geminiTotalTimeoutMs: 45000,
  geminiMaxRetries: 0,
  supportRateLimitMax: 5,
  supportRateLimitWindowMs: 900000,
  petitionPriceNgn: 550,
  petitionTtlSeconds: 7200,
  freePetitionLimit: 2,
  adminSessionTtlSeconds: 7200,
  adminLoginRateLimitMax: 8,
  generationRateLimitMax: 12,
  pdfRateLimitMax: 20,
  securityRateLimitWindowMs: 900000,
  flwTimeoutMs: 20000,
  verifyPendingWindowMs: 900000,
  jsonBodyLimit: "256kb",
});
assert.equal(Object.isFrozen(defaults), true);

const configured = loadRuntimeConfig({
  GEMINI_TIMEOUT_MS: "4000",
  GEMINI_TOTAL_TIMEOUT_MS: "3000",
  GEMINI_MAX_RETRIES: "4",
  SUPPORT_RATE_LIMIT_MAX: "10",
  SUPPORT_RATE_LIMIT_WINDOW_MS: "60000",
  PETITION_PRICE_NGN: "750",
  PETITION_TTL_SECONDS: "3600",
  FREE_PETITION_LIMIT: "0",
  ADMIN_SESSION_TTL_SECONDS: "1800",
  ADMIN_LOGIN_RATE_LIMIT_MAX: "3",
  GENERATION_RATE_LIMIT_MAX: "4",
  PDF_RATE_LIMIT_MAX: "5",
  SECURITY_RATE_LIMIT_WINDOW_MS: "120000",
  FLW_TIMEOUT_MS: "5000",
  VERIFY_PENDING_WINDOW_MS: "60000",
});

assert.deepEqual(configured, {
  geminiTimeoutMs: 4000,
  geminiTotalTimeoutMs: 4000,
  geminiMaxRetries: 4,
  supportRateLimitMax: 10,
  supportRateLimitWindowMs: 60000,
  petitionPriceNgn: 750,
  petitionTtlSeconds: 3600,
  freePetitionLimit: 0,
  adminSessionTtlSeconds: 1800,
  adminLoginRateLimitMax: 3,
  generationRateLimitMax: 4,
  pdfRateLimitMax: 5,
  securityRateLimitWindowMs: 120000,
  flwTimeoutMs: 5000,
  verifyPendingWindowMs: 60000,
  jsonBodyLimit: "256kb",
});

const invalidEnvironmentCases = [
  ["PETITION_PRICE_NGN", "free"],
  ["PETITION_TTL_SECONDS", "59"],
  ["FREE_PETITION_LIMIT", "-1"],
  ["ADMIN_SESSION_TTL_SECONDS", "1.5"],
  ["ADMIN_LOGIN_RATE_LIMIT_MAX", "0"],
  ["GENERATION_RATE_LIMIT_MAX", "Infinity"],
  ["PDF_RATE_LIMIT_MAX", "NaN"],
  ["SECURITY_RATE_LIMIT_WINDOW_MS", "59999"],
  ["SUPPORT_RATE_LIMIT_MAX", "0"],
  ["SUPPORT_RATE_LIMIT_WINDOW_MS", "1000"],
  ["FLW_TIMEOUT_MS", "999"],
  ["VERIFY_PENDING_WINDOW_MS", "0"],
  ["GEMINI_TIMEOUT_MS", "999"],
  ["GEMINI_TOTAL_TIMEOUT_MS", "180001"],
  ["GEMINI_MAX_RETRIES", "5"],
];

for (const [name, value] of invalidEnvironmentCases) {
  assert.throws(
    () => loadRuntimeConfig({ [name]: value }),
    new RegExp(`${name} must be an integer between`),
    `${name}=${value} must fail closed`
  );
}

console.log("✅ RUNTIME INTEGER CONFIGURATION IS FINITE AND BOUNDED");
console.log("✅ PETITIONDESK PRICE, FREE LIMIT, TTLS AND TIMEOUT DEFAULTS ARE PINNED");
console.log("✅ INVALID SUPPLIED NUMERIC CONFIGURATION FAILS STARTUP");

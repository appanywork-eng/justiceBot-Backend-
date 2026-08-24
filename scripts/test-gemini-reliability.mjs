import assert from "node:assert/strict";

import {
  DEFAULT_GEMINI_FALLBACK_MODELS,
  DEFAULT_GEMINI_MODEL,
  GeminiRequestError,
  generateGeminiText,
} from "../lib/geminiClient.mjs";

function response(status, data, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return headers[String(name).toLowerCase()] || null;
      },
    },
    async json() {
      return data;
    },
  };
}

function success(text) {
  return response(200, {
    candidates: [{
      content: {
        parts: [{ text }],
      },
    }],
  });
}

assert.equal(DEFAULT_GEMINI_MODEL, "gemini-3.7-flash");
assert.deepEqual(DEFAULT_GEMINI_FALLBACK_MODELS, [
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
]);

{
  const events = [];
  const calls = [];
  const text = await generateGeminiText({
    apiKey: "test-key",
    prompt: "Draft a petition",
    onAttempt: (event) => events.push(event),
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return success("Completed legal petition");
    },
  });

  assert.equal(text, "Completed legal petition");
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /gemini-3\.7-flash/);
  assert.equal(calls[0].options.headers["x-goog-api-key"], "test-key");
  assert.equal(events.at(-1).type, "success");
}

{
  const responses = [
    response(503, { error: { status: "UNAVAILABLE", message: "Capacity unavailable" } }),
    success("Recovered after retry"),
  ];
  const delays = [];

  const text = await generateGeminiText({
    apiKey: "test-key",
    prompt: "Draft a petition",
    fallbackModels: [],
    random: () => 0,
    sleep: async (delay) => delays.push(delay),
    fetchImpl: async () => responses.shift(),
  });

  assert.equal(text, "Recovered after retry");
  assert.deepEqual(delays, [750]);
}

{
  const requestedModels = [];
  const events = [];

  const text = await generateGeminiText({
    apiKey: "test-key",
    prompt: "Draft a petition",
    sleep: async () => {},
    onAttempt: (event) => events.push(event),
    fetchImpl: async (url) => {
      const model = url.match(/models\/([^:]+)/)?.[1];
      requestedModels.push(model);

      return model === "gemini-3.7-flash"
        ? response(503, { error: { status: "UNAVAILABLE" } })
        : success("Recovered using fallback model");
    },
  });

  assert.equal(text, "Recovered using fallback model");
  assert.deepEqual(requestedModels, [
    "gemini-3.7-flash",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
  ]);
  assert.equal(events.some((event) => event.type === "fallback"), true);
}

{
  const delays = [];
  const responses = [
    response(429, { error: { status: "RESOURCE_EXHAUSTED" } }, { "retry-after": "2" }),
    success("Recovered from provider rate limit"),
  ];

  const text = await generateGeminiText({
    apiKey: "test-key",
    prompt: "Draft a petition",
    fallbackModels: [],
    sleep: async (delay) => delays.push(delay),
    fetchImpl: async () => responses.shift(),
  });

  assert.equal(text, "Recovered from provider rate limit");
  assert.deepEqual(delays, [2000]);
}

{
  let attempts = 0;

  await assert.rejects(
    () => generateGeminiText({
      apiKey: "invalid-key",
      prompt: "Draft a petition",
      fetchImpl: async () => {
        attempts += 1;
        return response(403, { error: { status: "PERMISSION_DENIED" } });
      },
    }),
    (error) => error instanceof GeminiRequestError && error.status === 403 && !error.retryable
  );

  assert.equal(attempts, 1);
}

{
  const requestedModels = [];

  const text = await generateGeminiText({
    apiKey: "test-key",
    prompt: "Draft a petition",
    fetchImpl: async (url) => {
      const model = url.match(/models\/([^:]+)/)?.[1];
      requestedModels.push(model);
      return model === "gemini-3.7-flash"
        ? response(404, { error: { status: "NOT_FOUND" } })
        : success("Recovered from unavailable primary model");
    },
  });

  assert.equal(text, "Recovered from unavailable primary model");
  assert.deepEqual(requestedModels, ["gemini-3.7-flash", "gemini-3.6-flash"]);
}

await assert.rejects(
  () => generateGeminiText({ prompt: "Draft a petition" }),
  (error) => error instanceof GeminiRequestError && error.code === "GEMINI_NOT_CONFIGURED"
);

await assert.rejects(
  () => generateGeminiText({
    apiKey: "test-key",
    prompt: "Draft a petition",
    fetchImpl: async () => response(200, {
      candidates: [{ finishReason: "SAFETY" }],
    }),
  }),
  (error) => error instanceof GeminiRequestError && error.code === "GEMINI_RESPONSE_BLOCKED"
);

console.log("✅ GEMINI 3.7 FLASH IS THE PRIMARY STABLE MODEL");
console.log("✅ TEMPORARY 503 FAILURES RETRY WITH EXPONENTIAL BACKOFF");
console.log("✅ PROVIDER 429 RETRY-AFTER IS RESPECTED");
console.log("✅ OVERLOADED OR MISSING MODELS FALL BACK AUTOMATICALLY");
console.log("✅ INVALID API KEYS AND SAFETY BLOCKS DO NOT RETRY");
console.log("✅ GEMINI PRODUCTION RELIABILITY CONTRACT PASSED");

function missing(value) {
  return value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "");
}

function validInteger(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

export function parseIntegerEnv(value, {
  name,
  defaultValue,
  min,
  max,
}) {
  if (!validInteger(defaultValue, min, max)) {
    throw new RangeError(
      `${name} default must be an integer between ${min} and ${max}`
    );
  }

  if (missing(value)) {
    return defaultValue;
  }

  const parsed = typeof value === "string"
    ? Number(value.trim())
    : Number(value);

  if (!validInteger(parsed, min, max)) {
    throw new RangeError(
      `${name} must be an integer between ${min} and ${max}`
    );
  }

  return parsed;
}

export function loadRuntimeConfig(env = {}) {
  const geminiTimeoutMs = parseIntegerEnv(env.GEMINI_TIMEOUT_MS, {
    name: "GEMINI_TIMEOUT_MS",
    defaultValue: 30000,
    min: 1000,
    max: 120000,
  });

  const requestedGeminiTotalTimeoutMs = parseIntegerEnv(
    env.GEMINI_TOTAL_TIMEOUT_MS,
    {
      name: "GEMINI_TOTAL_TIMEOUT_MS",
      defaultValue: 45000,
      min: 1000,
      max: 180000,
    }
  );

  return Object.freeze({
    geminiTimeoutMs,
    geminiTotalTimeoutMs: Math.max(
      requestedGeminiTotalTimeoutMs,
      geminiTimeoutMs
    ),
    geminiMaxRetries: parseIntegerEnv(env.GEMINI_MAX_RETRIES, {
      name: "GEMINI_MAX_RETRIES",
      defaultValue: 0,
      min: 0,
      max: 4,
    }),
    supportRateLimitMax: parseIntegerEnv(env.SUPPORT_RATE_LIMIT_MAX, {
      name: "SUPPORT_RATE_LIMIT_MAX",
      defaultValue: 5,
      min: 1,
      max: 1000,
    }),
    supportRateLimitWindowMs: parseIntegerEnv(
      env.SUPPORT_RATE_LIMIT_WINDOW_MS,
      {
        name: "SUPPORT_RATE_LIMIT_WINDOW_MS",
        defaultValue: 15 * 60 * 1000,
        min: 60 * 1000,
        max: 24 * 60 * 60 * 1000,
      }
    ),
    petitionPriceNgn: parseIntegerEnv(env.PETITION_PRICE_NGN, {
      name: "PETITION_PRICE_NGN",
      defaultValue: 550,
      min: 1,
      max: 10_000_000,
    }),
    petitionTtlSeconds: parseIntegerEnv(env.PETITION_TTL_SECONDS, {
      name: "PETITION_TTL_SECONDS",
      defaultValue: 2 * 60 * 60,
      min: 60,
      max: 7 * 24 * 60 * 60,
    }),
    freePetitionLimit: parseIntegerEnv(env.FREE_PETITION_LIMIT, {
      name: "FREE_PETITION_LIMIT",
      defaultValue: 2,
      min: 0,
      max: 100,
    }),
    adminSessionTtlSeconds: parseIntegerEnv(
      env.ADMIN_SESSION_TTL_SECONDS,
      {
        name: "ADMIN_SESSION_TTL_SECONDS",
        defaultValue: 2 * 60 * 60,
        min: 60,
        max: 24 * 60 * 60,
      }
    ),
    adminLoginRateLimitMax: parseIntegerEnv(
      env.ADMIN_LOGIN_RATE_LIMIT_MAX,
      {
        name: "ADMIN_LOGIN_RATE_LIMIT_MAX",
        defaultValue: 8,
        min: 1,
        max: 1000,
      }
    ),
    generationRateLimitMax: parseIntegerEnv(env.GENERATION_RATE_LIMIT_MAX, {
      name: "GENERATION_RATE_LIMIT_MAX",
      defaultValue: 12,
      min: 1,
      max: 10000,
    }),
    pdfRateLimitMax: parseIntegerEnv(env.PDF_RATE_LIMIT_MAX, {
      name: "PDF_RATE_LIMIT_MAX",
      defaultValue: 20,
      min: 1,
      max: 10000,
    }),
    securityRateLimitWindowMs: parseIntegerEnv(
      env.SECURITY_RATE_LIMIT_WINDOW_MS,
      {
        name: "SECURITY_RATE_LIMIT_WINDOW_MS",
        defaultValue: 15 * 60 * 1000,
        min: 60 * 1000,
        max: 24 * 60 * 60 * 1000,
      }
    ),
    flwTimeoutMs: parseIntegerEnv(env.FLW_TIMEOUT_MS, {
      name: "FLW_TIMEOUT_MS",
      defaultValue: 20000,
      min: 1000,
      max: 120000,
    }),
    verifyPendingWindowMs: parseIntegerEnv(env.VERIFY_PENDING_WINDOW_MS, {
      name: "VERIFY_PENDING_WINDOW_MS",
      defaultValue: 15 * 60 * 1000,
      min: 1000,
      max: 24 * 60 * 60 * 1000,
    }),
    jsonBodyLimit: "256kb",
  });
}

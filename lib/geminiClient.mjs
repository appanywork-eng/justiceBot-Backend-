export const DEFAULT_GEMINI_MODEL = "gemini-3.7-flash";

export const DEFAULT_GEMINI_FALLBACK_MODELS = Object.freeze([
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
]);

const RETRYABLE_HTTP_STATUSES = new Set([
  408, 429, 500, 502, 503, 504,
]);

export class GeminiRequestError extends Error {
  constructor(message, {
    status = 502,
    code = "GEMINI_API_ERROR",
    retryable = false,
    model = "",
    attempts = 0,
    cause,
  } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "GeminiRequestError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.model = model;
    this.attempts = attempts;
  }
}

function extractGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];

  return parts
    .map((part) => typeof part?.text === "string" ? part.text : "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

function normalizeModels(primary, fallbackModels) {
  const fallbacks = Array.isArray(fallbackModels)
    ? fallbackModels
    : String(fallbackModels || "").split(",");

  return [...new Set([
    String(primary || DEFAULT_GEMINI_MODEL).trim(),
    ...fallbacks.map((candidate) => String(candidate || "").trim()),
  ].filter(Boolean))];
}

function parseRetryAfterMilliseconds(value, now) {
  const clean = String(value || "").trim();
  if (!clean) return 0;

  const seconds = Number(clean);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }

  const timestamp = Date.parse(clean);
  return Number.isFinite(timestamp)
    ? Math.max(timestamp - now(), 0)
    : 0;
}

function normalizeRequestError(error, model, attempts) {
  if (error instanceof GeminiRequestError) {
    error.model ||= model;
    error.attempts = attempts;
    return error;
  }

  if (error?.name === "AbortError" || error?.name === "TimeoutError") {
    return new GeminiRequestError("Gemini request timed out", {
      status: 504,
      code: "GEMINI_TIMEOUT",
      retryable: true,
      model,
      attempts,
      cause: error,
    });
  }

  const status = Number(error?.status || 0);

  return new GeminiRequestError(
    error?.message || "Gemini request failed",
    {
      status: status || 503,
      code: error?.code || (status ? "GEMINI_API_ERROR" : "GEMINI_NETWORK_ERROR"),
      retryable: !status || RETRYABLE_HTTP_STATUSES.has(status),
      model,
      attempts,
      cause: error,
    }
  );
}

export async function generateGeminiText({
  apiKey,
  model = DEFAULT_GEMINI_MODEL,
  fallbackModels = DEFAULT_GEMINI_FALLBACK_MODELS,
  systemInstruction = "",
  prompt = "",
  maxOutputTokens = 4096,
  timeoutMs = 30000,
  totalTimeoutMs = 110000,
  maxRetries = 1,
  baseDelayMs = 750,
  retryBaseDelayMs,
  maxDelayMs = 5000,
  onAttempt = () => {},
  fetchImpl = globalThis.fetch,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  random = Math.random,
  now = Date.now,
} = {}) {
  const cleanApiKey = String(apiKey || "").trim();

  if (!cleanApiKey) {
    throw new GeminiRequestError("GOOGLE_API_KEY is not configured", {
      status: 503,
      code: "GEMINI_NOT_CONFIGURED",
    });
  }

  if (!String(prompt || "").trim()) {
    throw new GeminiRequestError("Gemini prompt cannot be empty", {
      status: 400,
      code: "GEMINI_EMPTY_PROMPT",
    });
  }

  if (typeof fetchImpl !== "function") {
    throw new GeminiRequestError("Fetch is not available in this runtime", {
      status: 500,
      code: "GEMINI_FETCH_UNAVAILABLE",
    });
  }

  const requestBody = {
    contents: [{
      role: "user",
      parts: [{ text: String(prompt) }],
    }],
    generationConfig: {
      maxOutputTokens: Number(maxOutputTokens) || 4096,
    },
  };

  if (String(systemInstruction || "").trim()) {
    requestBody.system_instruction = {
      parts: [{ text: String(systemInstruction) }],
    };
  }

  const models = normalizeModels(model, fallbackModels);
  const deadline = now() + Math.max(Number(totalTimeoutMs) || 110000, 1000);
  const retryLimit = Math.max(Math.min(Number(maxRetries) || 0, 4), 0);
  let attempts = 0;
  let lastError;

  for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
    const currentModel = models[modelIndex];

    if (modelIndex > 0) {
      onAttempt({ type: "fallback", model: currentModel, previousModel: models[modelIndex - 1], attempts });
    }

    for (let retry = 0; retry <= retryLimit; retry += 1) {
      const remaining = deadline - now();

      if (remaining <= 0) {
        throw new GeminiRequestError("Gemini generation exceeded the request time limit", {
          status: 504,
          code: "GEMINI_DEADLINE_EXCEEDED",
          retryable: true,
          model: currentModel,
          attempts,
          cause: lastError,
        });
      }

      attempts += 1;
      const controller = new AbortController();
      const attemptTimeout = Math.max(
        Math.min(Number(timeoutMs) || 30000, remaining),
        1
      );
      const timer = setTimeout(() => controller.abort(), attemptTimeout);

      try {
        onAttempt({ type: "attempt", model: currentModel, attempt: attempts, retry });

        const response = await fetchImpl(
          "https://generativelanguage.googleapis.com/v1beta/models/" +
            encodeURIComponent(currentModel) +
            ":generateContent",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": cleanApiKey,
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          }
        );

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          const requestError = new GeminiRequestError(
            data?.error?.message || `Gemini request failed with HTTP ${response.status}`,
            {
              status: response.status,
              code: data?.error?.status || "GEMINI_API_ERROR",
              retryable: RETRYABLE_HTTP_STATUSES.has(response.status),
              model: currentModel,
              attempts,
            }
          );
          requestError.retryAfterMs = parseRetryAfterMilliseconds(
            response.headers?.get?.("retry-after"),
            now
          );
          throw requestError;
        }

        const text = extractGeminiText(data);

        if (!text) {
          const finishReason = data?.candidates?.[0]?.finishReason || "unknown";
          const blocked = /safety|blocked|prohibited|recitation/i.test(finishReason);

          throw new GeminiRequestError(
            `Gemini returned no text. Finish reason: ${finishReason}`,
            {
              status: blocked ? 422 : 502,
              code: blocked ? "GEMINI_RESPONSE_BLOCKED" : "GEMINI_EMPTY_RESPONSE",
              retryable: !blocked,
              model: currentModel,
              attempts,
            }
          );
        }

        onAttempt({ type: "success", model: currentModel, attempt: attempts, fallback: modelIndex > 0 });
        return text;
      } catch (error) {
        lastError = normalizeRequestError(error, currentModel, attempts);
        const modelUnavailable = lastError.status === 404;

        onAttempt({
          type: "failure",
          model: currentModel,
          attempt: attempts,
          status: lastError.status,
          code: lastError.code,
          retryable: lastError.retryable,
        });

        if (!lastError.retryable && !modelUnavailable) {
          throw lastError;
        }

        if (modelUnavailable || retry >= retryLimit) {
          break;
        }

        const configuredBaseDelay = Number(retryBaseDelayMs ?? baseDelayMs) || 750;
        const exponentialDelay = configuredBaseDelay * (2 ** retry);
        const jitter = Math.round(exponentialDelay * 0.35 * Math.max(Math.min(random(), 1), 0));
        const requestedDelay = Math.max(exponentialDelay + jitter, lastError.retryAfterMs || 0);
        const delay = Math.min(
          requestedDelay,
          Number(maxDelayMs) || 5000,
          Math.max(deadline - now(), 0)
        );

        if (delay > 0) {
          onAttempt({ type: "retry", model: currentModel, attempt: attempts, delayMs: delay });
          await sleep(delay);
        }
      } finally {
        clearTimeout(timer);
      }
    }
  }

  throw lastError || new GeminiRequestError("Gemini request failed", {
    status: 503,
    code: "GEMINI_UNAVAILABLE",
    retryable: true,
    attempts,
  });
}

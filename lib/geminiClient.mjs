const DEFAULT_PRIMARY_MODEL =
  "gemini-3.6-flash";

const DEFAULT_FALLBACK_MODEL =
  "gemini-3.5-flash";

const RETRYABLE_HTTP_STATUSES =
  new Set([
    429,
    500,
    502,
    503,
    504,
  ]);

const RETRYABLE_GEMINI_CODES =
  new Set([
    "RESOURCE_EXHAUSTED",
    "UNKNOWN",
    "INTERNAL",
    "UNAVAILABLE",
    "DEADLINE_EXCEEDED",
  ]);


function extractGeminiText(data) {
  const parts =
    data?.candidates?.[0]
      ?.content?.parts || [];

  return parts
    .map((part) =>
      typeof part?.text === "string"
        ? part.text
        : ""
    )
    .filter(Boolean)
    .join("\n")
    .trim();
}


function wait(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(
      resolve,
      Math.max(
        0,
        Number(milliseconds) || 0
      )
    );
  });
}


function isRetryableGeminiError(error) {
  const status =
    Number(error?.status) || 0;

  const code =
    String(error?.code || "")
      .trim()
      .toUpperCase();

  return (
    RETRYABLE_HTTP_STATUSES.has(
      status
    ) ||
    RETRYABLE_GEMINI_CODES.has(
      code
    )
  );
}


function normaliseFallbackModels(
  primaryModel,
  fallbackModels
) {
  const values =
    Array.isArray(fallbackModels)
      ? fallbackModels
      : String(
          fallbackModels || ""
        ).split(",");

  const models = [
    primaryModel,
  ];

  for (const value of values) {
    const model =
      String(value || "").trim();

    if (
      model &&
      !models.includes(model)
    ) {
      models.push(model);
    }
  }

  return models;
}


function attachAttemptInformation(
  error,
  attemptedModels
) {
  const safeError =
    error instanceof Error
      ? error
      : new Error(
          String(
            error ||
            "Gemini request failed"
          )
        );

  safeError.attemptedModels =
    [...attemptedModels];

  safeError.attemptCount =
    attemptedModels.length;

  return safeError;
}


async function requestGeminiOnce({
  apiKey,
  model,
  systemInstruction,
  prompt,
  maxOutputTokens,
  timeoutMs,
}) {
  const controller =
    new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  try {
    const requestBody = {
      contents: [
        {
          role:
            "user",

          parts: [
            {
              text:
                String(prompt),
            },
          ],
        },
      ],

      generationConfig: {
        maxOutputTokens:
          Number(maxOutputTokens) ||
          4096,
      },
    };

    if (
      String(
        systemInstruction || ""
      ).trim()
    ) {
      requestBody.system_instruction = {
        parts: [
          {
            text:
              String(
                systemInstruction
              ),
          },
        ],
      };
    }

    const endpoint =
      "https://generativelanguage.googleapis.com/" +
      "v1beta/models/" +
      encodeURIComponent(model) +
      ":generateContent";

    const response =
      await fetch(
        endpoint,
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",

            "x-goog-api-key":
              apiKey,
          },

          body:
            JSON.stringify(
              requestBody
            ),

          signal:
            controller.signal,
        }
      );

    const data =
      await response
        .json()
        .catch(() => ({}));

    if (!response.ok) {
      const message =
        data?.error?.message ||
        (
          "Gemini request failed " +
          `with HTTP ${response.status}`
        );

      const error =
        new Error(message);

      error.status =
        response.status;

      error.code =
        data?.error?.status ||
        "GEMINI_API_ERROR";

      error.model =
        model;

      throw error;
    }

    const text =
      extractGeminiText(data);

    if (!text) {
      const finishReason =
        data?.candidates?.[0]
          ?.finishReason ||
        "unknown";

      const error =
        new Error(
          "Gemini returned no text. " +
          `Finish reason: ${finishReason}`
        );

      error.code =
        "GEMINI_EMPTY_RESPONSE";

      error.model =
        model;

      throw error;
    }

    return text;
  } catch (error) {
    if (
      error?.name ===
      "AbortError"
    ) {
      const timeoutError =
        new Error(
          "Gemini request timed out"
        );

      timeoutError.status =
        504;

      timeoutError.code =
        "DEADLINE_EXCEEDED";

      timeoutError.model =
        model;

      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}


export async function generateGeminiText({
  apiKey,

  model =
    DEFAULT_PRIMARY_MODEL,

  fallbackModels =
    process.env
      .GEMINI_FALLBACK_MODEL ||
    DEFAULT_FALLBACK_MODEL,

  systemInstruction = "",

  prompt = "",

  maxOutputTokens = 4096,

  timeoutMs = 120000,

  retryBaseDelayMs = 1200,
}) {
  const cleanApiKey =
    String(apiKey || "").trim();

  const cleanPrimaryModel =
    String(
      model ||
      DEFAULT_PRIMARY_MODEL
    ).trim();

  if (!cleanApiKey) {
    throw new Error(
      "GOOGLE_API_KEY is not configured"
    );
  }

  if (
    !String(prompt || "").trim()
  ) {
    throw new Error(
      "Gemini prompt cannot be empty"
    );
  }

  const models =
    normaliseFallbackModels(
      cleanPrimaryModel,
      fallbackModels
    );

  /*
   * Maximum of three total requests:
   *
   * 1. Primary model
   * 2. One retry on the primary model
   * 3. One fallback-model request
   *
   * This prevents uncontrolled retry storms.
   */
  const attemptPlan = [
    models[0],
    models[0],
    models[1] || models[0],
  ];

  const attemptedModels = [];

  let lastError;

  for (
    let index = 0;
    index < attemptPlan.length;
    index += 1
  ) {
    const currentModel =
      attemptPlan[index];

    if (index > 0) {
      const delay =
        Math.max(
          1,
          Number(
            retryBaseDelayMs
          ) || 1200
        ) *
        Math.pow(
          2,
          index - 1
        );

      await wait(delay);
    }

    attemptedModels.push(
      currentModel
    );

    try {
      return await requestGeminiOnce({
        apiKey:
          cleanApiKey,

        model:
          currentModel,

        systemInstruction,

        prompt,

        maxOutputTokens,

        timeoutMs,
      });
    } catch (error) {
      lastError = error;

      const hasAnotherAttempt =
        index <
        attemptPlan.length - 1;

      if (
        !hasAnotherAttempt ||
        !isRetryableGeminiError(
          error
        )
      ) {
        throw attachAttemptInformation(
          error,
          attemptedModels
        );
      }
    }
  }

  throw attachAttemptInformation(
    lastError,
    attemptedModels
  );
}

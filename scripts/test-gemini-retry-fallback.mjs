import assert from "node:assert/strict";

import {
  generateGeminiText,
} from "../lib/geminiClient.mjs";


function mockResponse(
  status,
  payload
) {
  return {
    ok:
      status >= 200 &&
      status < 300,

    status,

    async json() {
      return payload;
    },
  };
}


const originalFetch =
  globalThis.fetch;


try {
  const requestUrls = [];

  globalThis.fetch =
    async (url) => {
      requestUrls.push(
        String(url)
      );

      if (
        requestUrls.length <= 2
      ) {
        return mockResponse(
          503,
          {
            error: {
              code:
                503,

              message:
                "Model is experiencing high demand",

              status:
                "UNAVAILABLE",
            },
          }
        );
      }

      return mockResponse(
        200,
        {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text:
                      "Fallback petition generated.",
                  },
                ],
              },
            },
          ],
        }
      );
    };

  const result =
    await generateGeminiText({
      apiKey:
        "test-api-key",

      model:
        "gemini-3.6-flash",

      fallbackModels:
        "gemini-3.5-flash",

      prompt:
        "Generate a test petition.",

      retryBaseDelayMs:
        1,

      timeoutMs:
        1000,
    });

  assert.equal(
    result,
    "Fallback petition generated."
  );

  assert.equal(
    requestUrls.length,
    3
  );

  assert.match(
    requestUrls[0],
    /gemini-3\.6-flash/
  );

  assert.match(
    requestUrls[1],
    /gemini-3\.6-flash/
  );

  assert.match(
    requestUrls[2],
    /gemini-3\.5-flash/
  );

  console.log(
    "✅ GEMINI 503 RETRIES PRIMARY MODEL"
  );

  console.log(
    "✅ GEMINI 503 FALLS BACK TO SECONDARY MODEL"
  );


  let nonRetryableCalls = 0;

  globalThis.fetch =
    async () => {
      nonRetryableCalls += 1;

      return mockResponse(
        400,
        {
          error: {
            code:
              400,

            message:
              "Invalid request",

            status:
              "INVALID_ARGUMENT",
          },
        }
      );
    };

  await assert.rejects(
    () =>
      generateGeminiText({
        apiKey:
          "test-api-key",

        prompt:
          "Invalid request test",

        retryBaseDelayMs:
          1,

        timeoutMs:
          1000,
      }),

    /Invalid request/
  );

  assert.equal(
    nonRetryableCalls,
    1
  );

  console.log(
    "✅ NON-RETRYABLE GEMINI ERRORS FAIL IMMEDIATELY"
  );

  console.log(
    "✅ GEMINI RETRY AND FALLBACK REGRESSION PASSED"
  );
} finally {
  globalThis.fetch =
    originalFetch;
}

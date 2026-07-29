function extractGeminiText(data) {
  const parts =
    data?.candidates?.[0]?.content?.parts || [];

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

export async function generateGeminiText({
  apiKey,
  model = "gemini-3.6-flash",
  systemInstruction = "",
  prompt = "",
  maxOutputTokens = 4096,
  timeoutMs = 120000,
}) {
  const cleanApiKey =
    String(apiKey || "").trim();

  const cleanModel =
    String(model || "gemini-3.6-flash")
      .trim();

  if (!cleanApiKey) {
    throw new Error(
      "GOOGLE_API_KEY is not configured"
    );
  }

  if (!String(prompt || "").trim()) {
    throw new Error(
      "Gemini prompt cannot be empty"
    );
  }

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
          role: "user",
          parts: [
            {
              text: String(prompt),
            },
          ],
        },
      ],

      generationConfig: {
        maxOutputTokens:
          Number(maxOutputTokens) || 4096,
      },
    };

    if (
      String(systemInstruction || "")
        .trim()
    ) {
      requestBody.system_instruction = {
        parts: [
          {
            text: String(
              systemInstruction
            ),
          },
        ],
      };
    }

    const endpoint =
      "https://generativelanguage.googleapis.com/" +
      "v1beta/models/" +
      encodeURIComponent(cleanModel) +
      ":generateContent";

    const response = await fetch(
      endpoint,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          "x-goog-api-key":
            cleanApiKey,
        },

        body: JSON.stringify(
          requestBody
        ),

        signal: controller.signal,
      }
    );

    const data =
      await response
        .json()
        .catch(() => ({}));

    if (!response.ok) {
      const message =
        data?.error?.message ||
        `Gemini request failed with HTTP ${response.status}`;

      const error =
        new Error(message);

      error.status =
        response.status;

      error.code =
        data?.error?.status ||
        "GEMINI_API_ERROR";

      throw error;
    }

    const text =
      extractGeminiText(data);

    if (!text) {
      const finishReason =
        data?.candidates?.[0]
          ?.finishReason ||
        "unknown";

      throw new Error(
        `Gemini returned no text. Finish reason: ${finishReason}`
      );
    }

    return text;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(
        "Gemini request timed out"
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

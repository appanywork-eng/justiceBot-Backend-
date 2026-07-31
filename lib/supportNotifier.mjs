function cleanText(
  value,
  maximumLength = 500
) {
  return String(
    value ??
    ""
  )
    .replace(
      /\u0000/g,
      ""
    )
    .trim()
    .slice(
      0,
      maximumLength
    );
}

function parseRecipients(
  value
) {
  return String(
    value ||
    ""
  )
    .split(",")
    .map(
      (
        item
      ) =>
        item.trim()
    )
    .filter(Boolean)
    .slice(
      0,
      10
    );
}

function safeTagValue(
  value
) {
  return cleanText(
    value,
    200
  )
    .replace(
      /[^a-zA-Z0-9_-]/g,
      "-"
    )
    .replace(
      /-+/g,
      "-"
    )
    .replace(
      /^[-_]+|[-_]+$/g,
      ""
    )
    .slice(
      0,
      200
    ) ||
    "unknown";
}

export class SupportNotifier {
  constructor({
    enabled = false,
    apiKey = "",
    to = "",
    from = "",
    adminUrl = "",
    fetchImpl =
      globalThis.fetch,
  } = {}) {
    this.enabled =
      Boolean(enabled);

    this.apiKey =
      cleanText(
        apiKey,
        500
      );

    this.to =
      parseRecipients(
        to
      );

    this.from =
      cleanText(
        from,
        300
      );

    this.adminUrl =
      cleanText(
        adminUrl,
        1000
      );

    this.fetchImpl =
      fetchImpl;
  }

  missingConfiguration() {
    const missing = [];

    if (!this.apiKey) {
      missing.push(
        "RESEND_API_KEY"
      );
    }

    if (!this.to.length) {
      missing.push(
        "SUPPORT_ALERT_TO"
      );
    }

    if (!this.from) {
      missing.push(
        "SUPPORT_ALERT_FROM"
      );
    }

    if (!this.adminUrl) {
      missing.push(
        "SUPPORT_ADMIN_URL"
      );
    }

    if (
      typeof this.fetchImpl !==
      "function"
    ) {
      missing.push(
        "fetch"
      );
    }

    return missing;
  }

  isConfigured() {
    return (
      this.enabled &&
      this
        .missingConfiguration()
        .length === 0
    );
  }

  async notifyNewTicket(
    ticket
  ) {
    if (!this.enabled) {
      return {
        sent: false,
        skipped: true,
        reason:
          "disabled",
      };
    }

    const missing =
      this
        .missingConfiguration();

    if (missing.length) {
      return {
        sent: false,
        skipped: true,
        reason:
          "not_configured",
        missing,
      };
    }

    const supportRef =
      cleanText(
        ticket?.supportRef,
        100
      );

    const category =
      cleanText(
        ticket?.category,
        80
      ) ||
      "other";

    const createdAt =
      cleanText(
        ticket
          ?.createdAtIso,
        100
      ) ||
      new Date()
        .toISOString();

    /*
     * Privacy rule:
     * Never place the user's full name,
     * email, phone number, message,
     * petition reference, payment
     * reference or evidence inside the
     * notification email.
     */
    const notificationText = [
      "A new PetitionDesk support request was received.",
      "",
      `Reference: ${supportRef}`,
      `Category: ${category}`,
      `Received: ${createdAt}`,
      "",
      "Open the protected Support Inbox:",
      this.adminUrl,
      "",
      "The user's message and personal information are available only inside the protected admin inbox.",
    ].join(
      "\n"
    );

    const response =
      await this.fetchImpl(
        "https://api.resend.com/emails",
        {
          method:
            "POST",

          headers: {
            Authorization:
              `Bearer ${this.apiKey}`,

            "Content-Type":
              "application/json",

            "Idempotency-Key":
              `petitiondesk-support-${supportRef}`,
          },

          body:
            JSON.stringify({
              from:
                this.from,

              to:
                this.to,

              subject:
                `New PetitionDesk support request — ${supportRef}`,

              text:
                notificationText,

              tags: [
                {
                  name:
                    "support_ref",

                  value:
                    safeTagValue(
                      supportRef
                    ),
                },
                {
                  name:
                    "category",

                  value:
                    safeTagValue(
                      category
                    ),
                },
              ],
            }),
        }
      );

    const data =
      await response
        .json()
        .catch(
          () => ({})
        );

    if (!response.ok) {
      const error =
        new Error(
          cleanText(
            data?.message ||
            data?.error ||
            `Support notification failed with HTTP ${response.status}`,
            500
          )
        );

      error.status =
        response.status;

      throw error;
    }

    return {
      sent: true,
      skipped: false,

      id:
        cleanText(
          data?.id,
          200
        ),
    };
  }
}

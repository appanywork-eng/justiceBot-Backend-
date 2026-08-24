import crypto from "node:crypto";
import express from "express";

const SUPPORT_CATEGORIES = Object.freeze([
  {
    id: "petition_generation",
    label: "Petition generation problem",
  },
  {
    id: "payment_unlock",
    label: "Payment or unlock problem",
  },
  {
    id: "pdf_download",
    label: "PDF download problem",
  },
  {
    id: "wrong_routing",
    label: "Wrong institution, email or address",
  },
  {
    id: "information_request",
    label: "Request for information",
  },
  {
    id: "privacy_data",
    label: "Privacy or personal-data enquiry",
  },
  {
    id: "partnership_media",
    label: "Partnership or media enquiry",
  },
  {
    id: "other",
    label: "Other",
  },
]);

const SUPPORT_CATEGORY_IDS = new Set(
  SUPPORT_CATEGORIES.map((category) => category.id)
);

const SUPPORT_STATUSES = new Set([
  "open",
  "in_progress",
  "resolved",
  "closed",
]);

function cleanText(value, maximumLength) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, maximumLength);
}

function clientAddress(req) {
  const forwarded = String(
    req.headers["x-forwarded-for"] || ""
  )
    .split(",")[0]
    .trim();

  return (
    forwarded ||
    req.ip ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

function rateLimitKey(req, email) {
  return crypto
    .createHash("sha256")
    .update(
      [
        clientAddress(req),
        String(email || "").trim().toLowerCase(),
      ].join("|")
    )
    .digest("hex");
}

function supportReference() {
  const date = new Date()
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "");

  const random = crypto
    .randomBytes(6)
    .toString("hex")
    .toUpperCase();

  return `PDS-${date}-${random}`;
}

function safeTicket(ticket) {
  if (!ticket || typeof ticket !== "object") {
    return ticket;
  }

  const {
    requestFingerprint,
    ...safe
  } = ticket;

  return safe;
}

function buildRateLimiter({
  maximum,
  windowMilliseconds,
}) {
  const buckets = new Map();

  return function consume(key) {
    const now = Date.now();

    const existing = buckets.get(key) || [];

    const active = existing.filter(
      (timestamp) =>
        now - timestamp < windowMilliseconds
    );

    if (active.length >= maximum) {
      const oldest = active[0] || now;

      const retryAfterSeconds = Math.max(
        Math.ceil(
          (
            windowMilliseconds -
            (now - oldest)
          ) / 1000
        ),
        1
      );

      buckets.set(key, active);

      return {
        ok: false,
        retryAfterSeconds,
      };
    }

    active.push(now);
    buckets.set(key, active);

    return {
      ok: true,
      retryAfterSeconds: 0,
    };
  };
}

export function createSupportRouter({
  supportStore,
  supportEmail = "info@petitiondesk.com",
  isEmail,
  isAdminTokenValid,
  incrementSupportMetric = async () => {},

  notifySupportTicket =
    async () => ({
      sent: false,
      skipped: true,
      reason: "disabled",
    }),

  rateLimitMax = 5,
  rateLimitWindowMs = 15 * 60 * 1000,
  consumeSharedRateLimit = null,
}) {
  if (!supportStore) {
    throw new Error(
      "SupportStore is required"
    );
  }

  if (typeof isEmail !== "function") {
    throw new Error(
      "isEmail validator is required"
    );
  }

  if (
    typeof isAdminTokenValid !==
    "function"
  ) {
    throw new Error(
      "Admin-token validator is required"
    );
  }

  const router = express.Router();

  const consumeRateLimit =
    buildRateLimiter({
      maximum: Math.max(
        Number(rateLimitMax) || 5,
        1
      ),
      windowMilliseconds: Math.max(
        Number(rateLimitWindowMs) ||
          15 * 60 * 1000,
        60 * 1000
      ),
    });

  router.get(
    "/support/config",
    (req, res) => {
      return res.json({
        ok: true,
        supportEmail,
        categories:
          SUPPORT_CATEGORIES,
      });
    }
  );

  router.post(
    "/support/tickets",
    async (req, res) => {
      try {
        const body = req.body || {};

        /*
         * Hidden anti-bot field.
         * Real users leave it empty.
         */
        const honeypot = cleanText(
          body.website,
          200
        );

        if (honeypot) {
          return res
            .status(202)
            .json({
              ok: true,
              supportRef:
                supportReference(),
              message:
                "Your support request has been received.",
            });
        }

        const fullName = cleanText(
          body.fullName,
          120
        );

        const email = cleanText(
          body.email,
          200
        ).toLowerCase();

        const phone = cleanText(
          body.phone,
          40
        );

        const category = cleanText(
          body.category,
          80
        );

        const subject = cleanText(
          body.subject,
          160
        );

        const message = cleanText(
          body.message,
          5000
        );

        const petitionRef = cleanText(
          body.petitionRef,
          120
        );

        const paymentRef = cleanText(
          body.paymentRef,
          120
        );

        const consent =
          body.consent === true;

        const formStartedAt = Number(
          body.formStartedAt || 0
        );

        if (fullName.length < 2) {
          return res
            .status(400)
            .json({
              ok: false,
              error:
                "Your full name is required.",
            });
        }

        if (!isEmail(email)) {
          return res
            .status(400)
            .json({
              ok: false,
              error:
                "A valid email address is required.",
            });
        }

        if (
          !SUPPORT_CATEGORY_IDS.has(
            category
          )
        ) {
          return res
            .status(400)
            .json({
              ok: false,
              error:
                "Select a valid support category.",
            });
        }

        if (subject.length < 3) {
          return res
            .status(400)
            .json({
              ok: false,
              error:
                "The subject must contain at least 3 characters.",
            });
        }

        if (message.length < 10) {
          return res
            .status(400)
            .json({
              ok: false,
              error:
                "The message must contain at least 10 characters.",
            });
        }

        if (!consent) {
          return res
            .status(400)
            .json({
              ok: false,
              error:
                "You must consent to the use of your information for support.",
            });
        }

        if (
          formStartedAt > 0 &&
          Date.now() - formStartedAt <
            1500
        ) {
          return res
            .status(429)
            .json({
              ok: false,
              error:
                "Please wait briefly before submitting the form.",
            });
        }

        const links =
          message.match(
            /https?:\/\/|www\./gi
          ) || [];

        if (links.length > 3) {
          return res
            .status(400)
            .json({
              ok: false,
              error:
                "The message contains too many links.",
            });
        }

        const fingerprint =
          rateLimitKey(req, email);

        const rate =
          typeof consumeSharedRateLimit === "function"
            ? await consumeSharedRateLimit(fingerprint)
            : consumeRateLimit(fingerprint);

        if (!rate.ok) {
          res.setHeader(
            "Retry-After",
            String(
              rate.retryAfterSeconds
            )
          );

          return res
            .status(429)
            .json({
              ok: false,
              error:
                "Too many support requests. Please try again later.",
              retryAfterSeconds:
                rate.retryAfterSeconds,
            });
        }

        let createdTicket = null;

        /*
         * Retry extremely unlikely
         * reference collisions.
         */
        for (
          let attempt = 1;
          attempt <= 3;
          attempt += 1
        ) {
          const now = new Date();

          const supportRef =
            supportReference();

          const ticket = {
            supportRef,
            fullName,
            email,
            phone,
            category,
            subject,
            message,
            petitionRef,
            paymentRef,
            status: "open",
            adminNotes: "",
            source:
              "web_contact_form",
            supportEmail,
            privacyConsent: true,
            notificationStatus:
              "stored_in_admin_inbox",
            createdAtIso:
              now.toISOString(),
            createdAtMillis:
              now.getTime(),
            updatedAtIso:
              now.toISOString(),
            updatedAtMillis:
              now.getTime(),
            requestFingerprint:
              fingerprint.slice(0, 24),
            userAgent: cleanText(
              req.get("user-agent"),
              300
            ),
          };

          try {
            createdTicket =
              await supportStore.create(
                ticket
              );

            break;
          } catch (error) {
            const messageText =
              String(
                error?.message ||
                  error ||
                  ""
              ).toLowerCase();

            const collision =
              messageText.includes(
                "already exists"
              ) ||
              messageText.includes(
                "already_exists"
              ) ||
              error?.code === 6;

            if (
              !collision ||
              attempt === 3
            ) {
              throw error;
            }
          }
        }

        await incrementSupportMetric();

        /*
         * Email notification is best-effort.
         * A notification-provider failure must
         * never discard a safely stored ticket.
         */
        let notificationResult = {
          sent: false,
          skipped: true,
          reason: "disabled",
        };

        try {
          notificationResult =
            await notifySupportTicket(
              safeTicket(
                createdTicket
              )
            );
        } catch (
          notificationError
        ) {
          notificationResult = {
            sent: false,
            skipped: false,
            reason:
              "provider_error",
          };

          console.error(
            "Support notification error:",
            notificationError
              ?.message ||
            notificationError
          );
        }

        const notificationStatus =
          notificationResult
            ?.sent
            ? "email_sent"
            : notificationResult
                ?.skipped
            ? (
                notificationResult
                  ?.reason ===
                "disabled"
                  ? "email_disabled"
                  : "email_not_configured"
              )
            : "email_failed";

        try {
          const notificationTime =
            new Date();

          const updatedTicket =
            await supportStore
              .update(
                createdTicket
                  .supportRef,
                {
                  notificationStatus,

                  notificationId:
                    String(
                      notificationResult
                        ?.id ||
                      ""
                    )
                      .trim()
                      .slice(
                        0,
                        200
                      ),

                  notificationAttemptedAtIso:
                    notificationTime
                      .toISOString(),

                  notificationAttemptedAtMillis:
                    notificationTime
                      .getTime(),
                }
              );

          if (updatedTicket) {
            createdTicket =
              updatedTicket;
          }
        } catch (
          updateError
        ) {
          console.error(
            "Support notification-status update error:",
            updateError
              ?.message ||
            updateError
          );
        }

        return res
          .status(201)
          .json({
            ok: true,
            supportRef:
              createdTicket.supportRef,
            status:
              createdTicket.status,
            supportEmail,
            message:
              "Your support request has been received.",
          });
      } catch (error) {
        console.error(
          "Support submission error:",
          error?.message || error
        );

        return res
          .status(500)
          .json({
            ok: false,
            error:
              "Support request could not be submitted. Please try again.",
          });
      }
    }
  );

  router.get(
    "/admin/support/tickets",
    async (req, res) => {
      try {
        const token = String(
          req.headers[
            "x-admin-token"
          ] || ""
        ).trim();

        const valid =
          await isAdminTokenValid(
            token
          );

        if (!valid) {
          return res
            .status(401)
            .json({
              ok: false,
              error: "Unauthorized",
            });
        }

        const limit = Math.min(
          Math.max(
            Number(
              req.query.limit || 100
            ),
            1
          ),
          100
        );

        const requestedStatus =
          cleanText(
            req.query.status,
            40
          );

        let tickets =
          await supportStore.list({
            limit,
          });

        if (
          requestedStatus &&
          SUPPORT_STATUSES.has(
            requestedStatus
          )
        ) {
          tickets =
            tickets.filter(
              (ticket) =>
                ticket.status ===
                requestedStatus
            );
        }

        return res.json({
          ok: true,
          supportEmail,
          count: tickets.length,
          tickets:
            tickets.map(
              safeTicket
            ),
        });
      } catch (error) {
        console.error(
          "Support inbox error:",
          error?.message || error
        );

        return res
          .status(500)
          .json({
            ok: false,
            error:
              "Could not load support tickets.",
          });
      }
    }
  );

  router.patch(
    "/admin/support/tickets/:supportRef",
    async (req, res) => {
      try {
        const token = String(
          req.headers[
            "x-admin-token"
          ] || ""
        ).trim();

        const valid =
          await isAdminTokenValid(
            token
          );

        if (!valid) {
          return res
            .status(401)
            .json({
              ok: false,
              error: "Unauthorized",
            });
        }

        const reference = cleanText(
          req.params.supportRef,
          80
        ).toUpperCase();

        const status = cleanText(
          req.body?.status,
          40
        );

        const hasAdminNotes =
          Object.prototype
            .hasOwnProperty.call(
              req.body || {},
              "adminNotes"
            );

        const adminNotes =
          cleanText(
            req.body?.adminNotes,
            2000
          );

        if (
          status &&
          !SUPPORT_STATUSES.has(
            status
          )
        ) {
          return res
            .status(400)
            .json({
              ok: false,
              error:
                "Invalid support status.",
            });
        }

        if (
          !status &&
          !hasAdminNotes
        ) {
          return res
            .status(400)
            .json({
              ok: false,
              error:
                "No support-ticket changes were supplied.",
            });
        }

        const now = new Date();

        const updates = {
          ...(status
            ? { status }
            : {}),
          ...(hasAdminNotes
            ? { adminNotes }
            : {}),
          updatedAtIso:
            now.toISOString(),
          updatedAtMillis:
            now.getTime(),
        };

        const updated =
          await supportStore.update(
            reference,
            updates
          );

        if (!updated) {
          return res
            .status(404)
            .json({
              ok: false,
              error:
                "Support ticket was not found.",
            });
        }

        return res.json({
          ok: true,
          ticket:
            safeTicket(updated),
        });
      } catch (error) {
        console.error(
          "Support update error:",
          error?.message || error
        );

        return res
          .status(500)
          .json({
            ok: false,
            error:
              "Could not update support ticket.",
          });
      }
    }
  );

  return router;
}

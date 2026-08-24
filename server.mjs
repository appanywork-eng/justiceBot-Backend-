// server.mjs
import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import {
  DEFAULT_GEMINI_FALLBACK_MODELS,
  DEFAULT_GEMINI_MODEL,
  generateGeminiText,
} from "./lib/geminiClient.mjs";
import {
  createRequestLimiter,
  requestFingerprint,
  safeSecretEqual,
} from "./lib/requestProtection.mjs";
import {
  sanitizeLegalDraft,
} from "./lib/legalDraftSafety.mjs";
import {
  buildSectorDetectionText,
} from "./lib/sectorDetectionContext.mjs";
import {
  evaluateComplaintStageConsistency,
} from "./lib/complaintStageConsistency.mjs";
import {
  assessInstitutionContactVerification,
} from "./lib/nationalSectorPolicy.mjs";
import {
  NIGERIAN_BANKING_DETECTION_KEYWORDS,
} from "./lib/nigeriaBankingRegistry.mjs";
import {
  NIGERIAN_POWER_DETECTION_KEYWORDS,
} from "./lib/nigeriaPowerRegistry.mjs";
import {
  NIGERIAN_TELECOM_DETECTION_KEYWORDS,
} from "./lib/nigeriaTelecomRegistry.mjs";
import {
  NIGERIAN_AVIATION_DETECTION_KEYWORDS,
} from "./lib/nigeriaAviationRegistry.mjs";
import {
  NIGERIAN_HEALTH_DETECTION_KEYWORDS,
} from "./lib/nigeriaHealthRegistry.mjs";
import {
  NIGERIAN_EDUCATION_DETECTION_KEYWORDS,
} from "./lib/nigeriaEducationRegistry.mjs";
import {
  NIGERIAN_ANTI_CORRUPTION_DETECTION_KEYWORDS,
} from "./lib/nigeriaAntiCorruptionRegistry.mjs";
import {
  NIGERIAN_DIASPORA_DETECTION_KEYWORDS,
} from "./lib/nigeriaDiasporaRegistry.mjs";
import {
  NIGERIAN_SECURITY_DETECTION_KEYWORDS,
} from "./lib/nigeriaSecurityRegistry.mjs";
import {
  NIGERIAN_JUDICIARY_DETECTION_KEYWORDS,
} from "./lib/nigeriaJudiciaryRegistry.mjs";
import {
  NIGERIAN_INTERNATIONAL_ESCALATION_DETECTION_KEYWORDS,
} from "./lib/nigeriaInternationalEscalationRegistry.mjs";
import {
  NIGERIAN_INSURANCE_DETECTION_KEYWORDS,
  NIGERIAN_PENSION_DETECTION_KEYWORDS,
  NIGERIAN_URBAN_PLANNING_DETECTION_KEYWORDS,
} from "./lib/nigeriaAdditionalSectorRegistry.mjs";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import PDFDocument from "pdfkit";
import { FirestoreRedisCompat } from "./lib/firestoreRedisCompat.mjs";
import { VisitorAnalyticsStore } from "./lib/visitorAnalyticsStore.mjs";
import { SupportStore } from "./lib/supportStore.mjs";
import { SupportNotifier } from "./lib/supportNotifier.mjs";
import { createSupportRouter } from "./lib/supportRoutes.mjs";
import {
  FirebaseIdentityError,
  listFirebaseUsers,
  requireVerifiedFirebaseUser,
  updateFirebaseUserStatus,
} from "./lib/firebaseIdentity.mjs";
import {
  FreeEntitlementStore,
} from "./lib/freeEntitlementStore.mjs";
import {
  extractAddressesDeep,
  isLikelyAddress,
} from "./lib/institutionContactUtils.mjs";
import {
  getJurisdictionCapabilities,
  resolveJurisdictionRouting,
  resolvePreSectorJurisdiction,
} from "./lib/jurisdictionEngine.mjs";
import {
  buildStructuredComplaintPrompt,
  resolveDeliveryPlan,
} from "./lib/routingDelivery.mjs";
import {
  detectInstitutionSector,
  INSTITUTION_SECTOR_PRIORITY_VERSION,
} from "./lib/institutionSectorPriority.mjs";
import {
  assessElectionViolenceRisk,
} from "./lib/electionViolenceEligibility.mjs";

dotenv.config();

const app = express();
app.set("trust proxy", 1);

app.use((req, res, next) => {
  const supplied = String(req.headers["x-request-id"] || "").trim();
  req.requestId = /^[a-zA-Z0-9._-]{8,100}$/.test(supplied)
    ? supplied
    : crypto.randomUUID();
  res.setHeader("x-request-id", req.requestId);
  next();
});

/*
 * Firebase Hosting forwards the complete original path to Cloud Run.
 * This allows both direct routes such as /health and Firebase routes
 * such as /api/health to use the same Express handlers.
 */
app.use((req, res, next) => {
  if (req.url === "/api") {
    req.url = "/";
  } else if (req.url.startsWith("/api/")) {
    req.url = req.url.slice(4);
  }

  next();
});

/* ======================================================
   CORE CONFIG
====================================================== */
const GEMINI_API_KEY = String(
  process.env.GOOGLE_API_KEY || ""
).trim();

const GEMINI_MODEL = String(
  process.env.GEMINI_MODEL ||
    DEFAULT_GEMINI_MODEL
).trim();

const GEMINI_FALLBACK_MODELS = String(
  process.env.GEMINI_FALLBACK_MODELS ||
    process.env.GEMINI_FALLBACK_MODEL ||
    DEFAULT_GEMINI_FALLBACK_MODELS.join(",")
)
  .split(",")
  .map((candidate) => candidate.trim())
  .filter((candidate) => candidate && candidate !== GEMINI_MODEL);

const GEMINI_TIMEOUT_MS = Math.max(
  Number(process.env.GEMINI_TIMEOUT_MS || 30000),
  1000
);

const GEMINI_TOTAL_TIMEOUT_MS = Math.max(
  Number(process.env.GEMINI_TOTAL_TIMEOUT_MS || 45000),
  GEMINI_TIMEOUT_MS
);

const GEMINI_MAX_RETRIES = Math.max(
  Math.min(Number(process.env.GEMINI_MAX_RETRIES ?? 0), 4),
  0
);

const IS_PRODUCTION =
  process.env.NODE_ENV === "production" ||
  Boolean(process.env.K_SERVICE);

const FIRESTORE_COLLECTION = String(
  process.env.FIRESTORE_COLLECTION || "petitiondesk_runtime"
).trim();

const FIRESTORE_ENABLED =
  String(
    process.env.FIRESTORE_ENABLED ||
      (process.env.K_SERVICE ? "true" : "false")
  ).toLowerCase() === "true";

const SUPPORT_EMAIL = String(
  process.env.SUPPORT_EMAIL ||
    "info@petitiondesk.com"
).trim();

const SUPPORT_TICKET_COLLECTION =
  String(
    process.env.SUPPORT_TICKET_COLLECTION ||
      "petitiondesk_support_tickets"
  ).trim();

const SUPPORT_RATE_LIMIT_MAX =
  Math.max(
    Number(
      process.env.SUPPORT_RATE_LIMIT_MAX ||
        5
    ),
    1
  );

const SUPPORT_RATE_LIMIT_WINDOW_MS =
  Math.max(
    Number(
      process.env
        .SUPPORT_RATE_LIMIT_WINDOW_MS ||
        15 * 60 * 1000
    ),
    60 * 1000
  );

const FLW_SECRET_KEY = String(process.env.FLW_SECRET_KEY || "").trim();
// ✅ dedicated webhook secret (recommended)
const FLW_WEBHOOK_HASH = String(process.env.FLW_WEBHOOK_HASH || "").trim();

const FRONTEND_BASE_URL = String(process.env.FRONTEND_BASE_URL || "https://petitiondesk.com")
  .trim()
  .replace(/\/+$/, "");

const SUPPORT_ALERT_ENABLED =
  String(
    process.env
      .SUPPORT_ALERT_ENABLED ||
    "false"
  ).toLowerCase() ===
  "true";

const SUPPORT_ALERT_TO =
  String(
    process.env
      .SUPPORT_ALERT_TO ||
    ""
  ).trim();

const SUPPORT_ALERT_FROM =
  String(
    process.env
      .SUPPORT_ALERT_FROM ||
    ""
  ).trim();

const RESEND_API_KEY =
  String(
    process.env
      .RESEND_API_KEY ||
    ""
  ).trim();

const SUPPORT_ADMIN_URL =
  String(
    process.env
      .SUPPORT_ADMIN_URL ||
    `${FRONTEND_BASE_URL}/admin/support`
  )
    .trim()
    .replace(
      /\/+$/,
      ""
    );

const PETITION_PRICE_NGN = Number(process.env.PETITION_PRICE_NGN || 550);
const PETITION_TTL_SECONDS = Number(process.env.PETITION_TTL_SECONDS || 2 * 60 * 60); // default 2 hours

/*
 * The feature remains disabled until Firebase
 * email-link authentication and the matching
 * frontend flow are configured.
 */
const FREE_ACCESS_ENABLED =
  String(
    process.env
      .FREE_ACCESS_ENABLED ||
    "false"
  ).toLowerCase() ===
  "true";

const FREE_PETITION_LIMIT =
  Math.max(
    Number(
      process.env
        .FREE_PETITION_LIMIT ||
      2
    ),
    0
  );

const FREE_ENTITLEMENT_COLLECTION =
  String(
    process.env
      .FREE_ENTITLEMENT_COLLECTION ||
    "petitiondesk_entitlements"
  )
    .trim()
    .replace(
      /[^a-zA-Z0-9_-]/g,
      "_"
    ) ||
  "petitiondesk_entitlements";

const ADMIN_UNLOCK_KEY = String(process.env.ADMIN_UNLOCK_KEY || "").trim();
const ADMIN_SESSION_TTL_SECONDS = Number(process.env.ADMIN_SESSION_TTL_SECONDS || 2 * 60 * 60); // default 2 hours
const ADMIN_LOGIN_RATE_LIMIT_MAX = Math.max(
  Number(process.env.ADMIN_LOGIN_RATE_LIMIT_MAX || 8),
  1
);
const GENERATION_RATE_LIMIT_MAX = Math.max(
  Number(process.env.GENERATION_RATE_LIMIT_MAX || 12),
  1
);
const SECURITY_RATE_LIMIT_WINDOW_MS = Math.max(
  Number(process.env.SECURITY_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  60 * 1000
);

const FLW_TIMEOUT_MS = Number(process.env.FLW_TIMEOUT_MS || 20000); // default 20s
const VERIFY_PENDING_WINDOW_MS = Number(process.env.VERIFY_PENDING_WINDOW_MS || 15 * 60 * 1000); // 15 mins

// Optional safety toggles
const AI_SECTOR_CLASSIFY = String(process.env.AI_SECTOR_CLASSIFY || "").toLowerCase() === "true";
const DEBUG_SECTOR = String(process.env.DEBUG_SECTOR || "").toLowerCase() === "true";
const DEBUG_PAYMENT = String(process.env.DEBUG_PAYMENT || "").toLowerCase() === "true";

/* ======================================================
   MIDDLEWARE
====================================================== */
const ALLOWED_ORIGINS = new Set([
  FRONTEND_BASE_URL,
  "https://petitiondesk.com",
  "https://www.petitiondesk.com",
  ...String(
    process.env.ALLOWED_ORIGINS ||
      process.env.CORS_ALLOWED_ORIGINS ||
      ""
  )
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean),
  ...(!IS_PRODUCTION
    ? ["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:5173"]
    : []),
]);

app.use(
  cors({
    origin(origin, callback) {
      callback(null, !origin || ALLOWED_ORIGINS.has(String(origin).replace(/\/+$/, "")));
    },
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-admin-token", "x-request-id"],
    exposedHeaders: ["x-request-id", "retry-after"],
    maxAge: 600,
  })
);

// Keep rawBody for webhook signature verification
app.use(
  express.json({
    limit: "5mb",
    verify: (req, res, buf) => {
      req.rawBody = buf ? buf.toString("utf8") : "";
    },
  })
);

/* ======================================================
   GEMINI AI CONFIGURATION
====================================================== */
console.log(
  `AI provider: Gemini | Model: ${GEMINI_MODEL} | Fallbacks: ${GEMINI_FALLBACK_MODELS.join(", ") || "none"}`
);

/* ======================================================
   PATHS
====================================================== */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "data");

/* ======================================================
   FIRESTORE PERSISTENCE (GOOGLE CLOUD)
====================================================== */
let redis = null;

if (FIRESTORE_ENABLED) {
  try {
    redis = new FirestoreRedisCompat({
      collection: FIRESTORE_COLLECTION,
    });

    console.log(
      `✅ Firestore persistence enabled: ${FIRESTORE_COLLECTION}`
    );
  } catch (error) {
    console.error(
      "Firestore initialization error:",
      error?.message || error
    );

    redis = null;
  }
} else {
  console.log(
    "ℹ️ Firestore disabled — using in-memory storage for local testing"
  );
}

const supportStore =
  new SupportStore({
    enabled: FIRESTORE_ENABLED,
    collection:
      SUPPORT_TICKET_COLLECTION,
  });

const supportNotifier =
  new SupportNotifier({
    enabled:
      SUPPORT_ALERT_ENABLED,

    apiKey:
      RESEND_API_KEY,

    to:
      SUPPORT_ALERT_TO,

    from:
      SUPPORT_ALERT_FROM,

    adminUrl:
      SUPPORT_ADMIN_URL,
  });

const freeEntitlementStore =
  new FreeEntitlementStore({
    enabled:
      FIRESTORE_ENABLED,

    collection:
      FREE_ENTITLEMENT_COLLECTION,

    freeLimit:
      FREE_PETITION_LIMIT,
  });

const visitorAnalyticsStore =
  new VisitorAnalyticsStore({
    enabled: FIRESTORE_ENABLED,
    collection:
      process.env.VISITOR_ANALYTICS_COLLECTION ||
      "petitiondesk_visitors",
  });

/* ======================================================
   FIRESTORE-COMPATIBLE HELPERS
====================================================== */
const localMetricCounters = new Map();
const localMetricSets = new Map();

async function redisIncr(key) {
  if (redis) {
    try {
      return await redis.incr(key);
    } catch (error) {
      console.warn("Metric persistence failed:", error?.message || error);
    }
  }

  const value = Number(localMetricCounters.get(key) || 0) + 1;
  localMetricCounters.set(key, value);
  return value;
}
async function redisSAdd(key, value) {
  if (redis) {
    try {
      return await redis.sadd(key, value);
    } catch (error) {
      console.warn("Set metric persistence failed:", error?.message || error);
    }
  }

  const values = localMetricSets.get(key) || new Set();
  values.add(String(value));
  localMetricSets.set(key, values);
  return values.size;
}
async function redisGetInt(key) {
  if (redis) {
    try {
      const value = await redis.get(key);
      return Number(value || 0);
    } catch {}
  }

  return Number(localMetricCounters.get(key) || 0);
}
async function redisSCard(key) {
  if (redis) {
    try {
      const value = await redis.scard(key);
      return Number(value || 0);
    } catch {}
  }

  return Number(localMetricSets.get(key)?.size || 0);
}

function anonymousVisitorHash(value) {
  const clean = String(value || "").trim();

  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(clean)) {
    return "";
  }

  return crypto
    .createHash("sha256")
    .update(clean)
    .digest("hex");
}

async function recordAnonymousVisit(visitorId) {
  const visitorHash = anonymousVisitorHash(visitorId);

  if (!visitorHash) {
    return { tracked: false, isNew: false };
  }

  return visitorAnalyticsStore.record(
    visitorHash
  );
}

async function getAnonymousVisitorStats() {
  return visitorAnalyticsStore.stats();
}

/* ======================================================
   METRICS
====================================================== */
const METRICS = {
  visits: "pd:metrics:visits",
  generated: "pd:metrics:generated",
  previewed: "pd:metrics:previewed",
  paymentInitiated: "pd:metrics:payment_initiated",
  paymentSuccess: "pd:metrics:payment_success",
  unlockedPaid: "pd:metrics:unlocked_paid",
  unlockedFree: "pd:metrics:unlocked_free",
  adminSessions: "pd:metrics:admin_sessions",
  supportSubmitted:
    "pd:metrics:support_submitted",
  generationFailed: "pd:metrics:generation_failed",
  generationRateLimited: "pd:metrics:generation_rate_limited",
  aiAttempts: "pd:metrics:ai_attempts",
  aiFallbacks: "pd:metrics:ai_fallbacks",
  adminLoginFailed: "pd:metrics:admin_login_failed",
  webhookRejected: "pd:metrics:webhook_rejected",
  uniquePayInit: "pd:set:payinit_txrefs",
  uniquePaySuccess: "pd:set:paysuccess_txrefs",
};

const runtimeDiagnostics = {
  startedAt: new Date().toISOString(),
  lastAiAttemptAt: null,
  lastAiSuccessAt: null,
  lastAiFailureAt: null,
  lastAiModel: null,
  lastAiErrorCode: null,
  lastAiErrorStatus: null,
};

function recordAiAttempt(event) {
  const timestamp = new Date().toISOString();

  if (event.type === "attempt") {
    runtimeDiagnostics.lastAiAttemptAt = timestamp;
    runtimeDiagnostics.lastAiModel = event.model;
    void redisIncr(METRICS.aiAttempts);
  } else if (event.type === "fallback") {
    void redisIncr(METRICS.aiFallbacks);
    console.warn("Gemini fallback activated", {
      model: event.model,
      previousModel: event.previousModel,
    });
  } else if (event.type === "success") {
    runtimeDiagnostics.lastAiSuccessAt = timestamp;
    runtimeDiagnostics.lastAiModel = event.model;
  } else if (event.type === "failure") {
    runtimeDiagnostics.lastAiFailureAt = timestamp;
    runtimeDiagnostics.lastAiErrorCode = event.code;
    runtimeDiagnostics.lastAiErrorStatus = event.status;
  }
}

function logRateLimitStoreError(error) {
  console.warn("Shared rate-limit storage unavailable; using local protection:", error?.message || error);
}

const consumeAdminLoginLimit = createRequestLimiter({
  namespace: "admin_login",
  maximum: ADMIN_LOGIN_RATE_LIMIT_MAX,
  windowMilliseconds: SECURITY_RATE_LIMIT_WINDOW_MS,
  store: redis,
  onStoreError: logRateLimitStoreError,
});

const consumeGenerationLimit = createRequestLimiter({
  namespace: "petition_generation",
  maximum: GENERATION_RATE_LIMIT_MAX,
  windowMilliseconds: SECURITY_RATE_LIMIT_WINDOW_MS,
  store: redis,
  onStoreError: logRateLimitStoreError,
});

const consumeSupportLimit = createRequestLimiter({
  namespace: "support",
  maximum: SUPPORT_RATE_LIMIT_MAX,
  windowMilliseconds: SUPPORT_RATE_LIMIT_WINDOW_MS,
  store: redis,
  onStoreError: logRateLimitStoreError,
});

/* ======================================================
   OVERSIGHT EMAILS (ENV)
====================================================== */
const OVERSIGHT_EMAILS = {
  PCC: String(
    process.env.PCC_EMAIL ||
      "complaint@pcc.gov.ng"
  ).trim(),

  NHRC: String(
    process.env.NHRC_EMAIL ||
      "info@nhrc.gov.ng"
  ).trim(),

  FCCPC: String(
    process.env.FCCPC_EMAIL ||
      "contact@fccpc.gov.ng"
  ).trim(),

  SERVICOM: String(
    process.env.SERVICOM_EMAIL ||
      "info@servicom.gov.ng"
  ).trim(),

  AGF: String(
    process.env.AGF_EMAIL || ""
  ).trim(),
};

// Official PCC contacts verified from pcc.gov.ng.
// JSON routing remains the preferred source.
const PCC_FALLBACK_EMAILS = [
  "complaint@pcc.gov.ng",
  "info@pcc.gov.ng",
];

/* ======================================================
   IN-MEMORY FALLBACK STORAGE
====================================================== */
// Note: Cloud Run instances are ephemeral; Firestore provides durable storage.
const petitionStore = new Map(); // tx_ref -> record
const USED_TX_REFS = new Set(); // webhook/verify confirmed tx_ref (memory)
const USED_TX_SUCCESS = new Set(); // prevent double unlock in-memory

function scheduleMemoryExpiry(tx_ref) {
  setTimeout(() => petitionStore.delete(tx_ref), PETITION_TTL_SECONDS * 1000).unref?.();
}

/* ======================================================
   INPUT VALIDATION
====================================================== */
function bad(msg) {
  return { ok: false, error: msg };
}
function isNonEmptyString(v, min = 1, max = 100000) {
  return typeof v === "string" && v.trim().length >= min && v.trim().length <= max;
}
function isEmail(s) {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}
function validateGenerateBody(body) {
  const complaint = body?.complaint;
  const petitioner = body?.petitioner || {};
  if (!isNonEmptyString(complaint, 3, 10000)) return bad("Complaint is required (3-10000 chars).");

  const providedAny =
    isNonEmptyString(petitioner?.fullName, 1, 120) ||
    isNonEmptyString(petitioner?.address, 1, 250) ||
    isNonEmptyString(petitioner?.email, 1, 200) ||
    isNonEmptyString(petitioner?.phone, 1, 40);

  if (providedAny) {
    if (!isNonEmptyString(petitioner?.fullName, 2, 120)) return bad("Petitioner fullName is required (2-120).");
    if (!isNonEmptyString(petitioner?.address, 5, 250)) return bad("Petitioner address is required (5-250).");
    if (!isEmail(String(petitioner?.email || ""))) return bad("Petitioner email is required and must be valid.");
    if (!isNonEmptyString(petitioner?.phone, 5, 40)) return bad("Petitioner phone is required (5-40).");
  }

  return { ok: true };
}
function validateTxRef(body) {
  const tx_ref = String(body?.tx_ref || "").trim();
  if (!/^pd_\d{10,20}_[A-Za-z0-9_-]{8,80}$/.test(tx_ref)) {
    return { ok: false, error: "Invalid tx_ref" };
  }

  const transaction_id = body?.transaction_id != null ? String(body.transaction_id).trim() : "";

  if (transaction_id && !/^\d{1,30}$/.test(transaction_id)) {
    return { ok: false, error: "Invalid transaction_id" };
  }

  return { ok: true, tx_ref, transaction_id };
}

function sendFirebaseIdentityError(
  response,
  error
) {
  const status =
    error instanceof
      FirebaseIdentityError
      ? error.status
      : 401;

  return response
    .status(status)
    .json({
      ok: false,

      error:
        error?.message ||
        "Email verification is required.",

      code:
        error?.code ||
        "firebase_identity_error",

      requiresVerification:
        true,
    });
}

async function requireMatchingPetitionOwner(
  request,
  ownerUid
) {
  const cleanOwnerUid =
    String(
      ownerUid ||
      ""
    ).trim();

  if (!cleanOwnerUid) {
    throw new FirebaseIdentityError(
      "This petition is not linked to a verified account. Generate it again.",
      {
        status: 403,

        code:
          "petition_owner_missing",
      }
    );
  }

  const user =
    await requireVerifiedFirebaseUser(
      request
    );

  if (
    user.uid !==
    cleanOwnerUid
  ) {
    throw new FirebaseIdentityError(
      "This petition belongs to another verified account.",
      {
        status: 403,

        code:
          "petition_owner_mismatch",
      }
    );
  }

  return user;
}

function publicUnlockedPayload(
  payload
) {
  if (
    !payload ||
    typeof payload !==
      "object"
  ) {
    return payload;
  }

  const {
    _ownerUid,
    ...publicPayload
  } = payload;

  return publicPayload;
}

/* ======================================================
   ADMIN SESSION
====================================================== */
function randomToken(bytes = 32) {
  return crypto
    .randomBytes(Math.max(16, Number(bytes) || 32))
    .toString("base64url");
}

async function createAdminSession() {
  const token = `pdadm_${randomToken(32)}`;

  if (redis) {
    await redis.set(`pd:admin:${token}`, "1", "EX", ADMIN_SESSION_TTL_SECONDS);
  } else {
    petitionStore.set(`__admin__:${token}`, { ok: true, expiresAt: Date.now() + ADMIN_SESSION_TTL_SECONDS * 1000 });
    setTimeout(() => petitionStore.delete(`__admin__:${token}`), ADMIN_SESSION_TTL_SECONDS * 1000).unref?.();
  }

  return token;
}

async function isAdminTokenValid(token) {
  const t = String(token || "").trim();
  if (!t) return false;

  if (redis) {
    try {
      const ok = await redis.get(`pd:admin:${t}`);
      return ok === "1";
    } catch {
      return false;
    }
  }

  const rec = petitionStore.get(`__admin__:${t}`);
  if (!rec) return false;
  if (rec.expiresAt && Date.now() > rec.expiresAt) {
    petitionStore.delete(`__admin__:${t}`);
    return false;
  }
  return true;
}

/* ======================================================
   FETCH HELPERS
====================================================== */
async function getFetch() {
  if (typeof fetch === "function") return fetch;
  const mod = await import("node-fetch");
  return mod.default;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ✅ HARD PAYMENT DEBUG FIX:
// - always read response text (Flutterwave sometimes returns non-JSON on errors)
// - return real Flutterwave message to frontend
async function flwFetch(url, options = {}) {
  if (!FLW_SECRET_KEY) throw new Error("FLW_SECRET_KEY missing");
  const _fetch = await getFetch();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FLW_TIMEOUT_MS);

  try {
    const res = await _fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${FLW_SECRET_KEY}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    const rawText = await res.text().catch(() => "");
    const parsed = rawText ? safeJsonParse(rawText) : null;
    const data = parsed || (rawText ? { raw: rawText } : {});

    if (DEBUG_PAYMENT) {
      console.log("💳 FLW DEBUG:", {
        url,
        ok: res.ok,
        status: res.status,
        message: data?.message,
        statusText: data?.status,
      });
    }

    return { ok: res.ok, status: res.status, data, rawText };
  } finally {
    clearTimeout(timer);
  }
}

/* ======================================================
   UTILITIES
====================================================== */
function safeUniq(arr) {
  return [...new Set((arr || []).filter(Boolean))];
}

function extractSubjectFromPetition(petitionText = "") {
  const m =
    petitionText.match(/^\s*subject\s*:\s*(.+)\s*$/im) ||
    petitionText.match(/^\s*re\s*:\s*(.+)\s*$/im);
  return (m?.[1] || "").trim() || "Petition Regarding Complaint";
}

function buildMailto({ to = [], cc = [], subject = "", body = "" }) {
  const toList = safeUniq(to).filter(isEmail).slice(0, 10).join(",");
  const ccList = safeUniq(cc).filter(isEmail).slice(0, 10).join(",");
  if (!toList) return null;

  const s = encodeURIComponent(subject || "Petition");
  const b = encodeURIComponent(body || "");
  const ccParam = ccList ? `&cc=${encodeURIComponent(ccList)}` : "";
  return `mailto:${toList}?subject=${s}&body=${b}${ccParam}`;
}

function buildFrontendRedirectUrl(tx_ref) {
  return `${FRONTEND_BASE_URL}/?tx_ref=${encodeURIComponent(tx_ref)}`;
}

// return user to a specific frontend path
function buildFrontendRedirectUrlWithReturn(tx_ref, return_to) {
  const clean = String(return_to || "").trim();
  if (!clean || !clean.startsWith("/")) return buildFrontendRedirectUrl(tx_ref);
  const join = `${FRONTEND_BASE_URL}${clean}`;
  const sep = join.includes("?") ? "&" : "?";
  return `${join}${sep}tx_ref=${encodeURIComponent(tx_ref)}`;
}

function isPendingStatus(s) {
  const v = String(s || "").toLowerCase();
  return v === "pending" || v === "processing" || v === "queued";
}

function isSuccessStatus(s) {
  const v = String(s || "").toLowerCase();
  // Flutterwave usually returns "successful"
  return v === "successful" || v === "success" || v === "completed";
}

/* ======================================================
   SECTOR JSON LOADING
====================================================== */
function sectorKeyCandidates(sector) {
  const s = String(sector || "").trim();
  if (!s) return [];
  return safeUniq([s, s.replace(/_/g, "-"), s.replace(/-/g, "_")]).filter(Boolean);
}

function loadSectorJson(sector) {
  const candidates = sectorKeyCandidates(sector);
  for (const key of candidates) {
    const filePath = path.join(DATA_DIR, `${key}.json`);
    if (!fs.existsSync(filePath)) continue;
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
      return null;
    }
  }
  return null;
}

function listJsonSectorsFromDataDir() {
  try {
    return fs
      .readdirSync(DATA_DIR)
      .filter((f) => /\.json$/i.test(f))
      .map((f) => f.replace(/\.json$/i, ""))
      .filter(Boolean);
  } catch {
    return [];
  }
}

/* ======================================================
   SECTOR DETECTION
====================================================== */
function buildSectorKeywordsIndex() {
  const index = new Map(); // sector -> keywords[]
  const sectors = listJsonSectorsFromDataDir();

  for (const sec of sectors) {
    const sj = loadSectorJson(sec);
    const kw = Array.isArray(sj?.keywords)
      ? sj.keywords
      : Array.isArray(sj?.routing_keywords)
      ? sj.routing_keywords
      : [];
    const cleaned = safeUniq(kw.map((x) => String(x || "").toLowerCase().trim())).filter(Boolean);
    if (cleaned.length) index.set(sec, cleaned);
  }
  return index;
}

let SECTOR_KEYWORDS_INDEX = buildSectorKeywordsIndex();

function builtInKeywordMap() {
  return {
    pensions:
      NIGERIAN_PENSION_DETECTION_KEYWORDS,
    insurance:
      NIGERIAN_INSURANCE_DETECTION_KEYWORDS,
    urban_planning:
      NIGERIAN_URBAN_PLANNING_DETECTION_KEYWORDS,
    power:
      NIGERIAN_POWER_DETECTION_KEYWORDS,
    aviation:
      NIGERIAN_AVIATION_DETECTION_KEYWORDS,
    banking:
      NIGERIAN_BANKING_DETECTION_KEYWORDS,
    telecoms:
      NIGERIAN_TELECOM_DETECTION_KEYWORDS,
    education:
      NIGERIAN_EDUCATION_DETECTION_KEYWORDS,
    health:
      NIGERIAN_HEALTH_DETECTION_KEYWORDS,
    security:
      NIGERIAN_SECURITY_DETECTION_KEYWORDS,
    judiciary:
      NIGERIAN_JUDICIARY_DETECTION_KEYWORDS,
    international_escalation:
      NIGERIAN_INTERNATIONAL_ESCALATION_DETECTION_KEYWORDS,
    anti_corruption:
      NIGERIAN_ANTI_CORRUPTION_DETECTION_KEYWORDS,
    diaspora_report:
      NIGERIAN_DIASPORA_DETECTION_KEYWORDS,
  };
}

// safe matching for short tokens (atm/pos/cbn/un/au/etc.)
function keywordHit(lower, kw) {
  const w = String(kw || "").toLowerCase().trim();
  if (!w) return false;

  // short simple tokens should use word-boundary
  if (w.length <= 4 && /^[a-z0-9]+$/.test(w)) {
    const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    return re.test(lower);
  }
  return lower.includes(w);
}

// ✅ Smart sector detection (heuristic + priority override + AI)
function detectSectorHeuristic(text) {
  const lower = String(text || "").toLowerCase();

  // Priority override: international escalation signals should win
  const intlSignals = [
    "united states congress",
    "u.s. congress",
    "us congress",
    "congress",
    "senate",
    "house committee",
    "foreign affairs committee",
    "house foreign affairs",
    "senate foreign relations",
    "tom lantos",
    "uk parliament",
    "united kingdom parliament",
    "house of commons",
    "foreign, commonwealth",
    "fcdo",
    "european union",
    "eu parliament",
    "european parliament",
    "united nations",
    "un human rights",
    "ohchr",
    "human rights council",
    "special procedures",
    "icc",
    "international criminal court",
    "the hague",
    "ecowas",
    "african union",
    "au",
    "international escalation",
    "international",
  ];
  if (intlSignals.some((w) => keywordHit(lower, w))) {
    return { sector: "international_escalation", score: 999, reason: "intl_override" };
  }

  const candidates = [];

  // Score JSON keywords (strong)
  for (const [sector, words] of SECTOR_KEYWORDS_INDEX.entries()) {
    let score = 0;
    for (const w of words) {
      if (keywordHit(lower, w)) score += 25;
    }
    if (score > 0) candidates.push({ sector, score, reason: "json_keywords" });
  }

  // Score built-in keywords (single hit must be enough)
  const map = builtInKeywordMap();
  for (const [sector, words] of Object.entries(map)) {
    let hits = 0;
    for (const w of words) {
      if (keywordHit(lower, w)) hits++;
    }
    if (hits > 0) {
      const score = 40 + hits * 15; // single hit => 55
      candidates.push({ sector, score, reason: "builtin_keywords" });
    }
  }

  if (!candidates.length) return { sector: "general", score: 0, reason: "no_match" };

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

async function detectSectorSmart(text) {
  const heuristic = detectSectorHeuristic(text);

  // If AI classifier is disabled or Gemini is unavailable, use heuristic
  if (!AI_SECTOR_CLASSIFY || !GEMINI_API_KEY) return heuristic.sector || "general";

  // Ask AI only if general OR weak evidence
  const shouldAskAI = heuristic.sector === "general" || heuristic.score < 60;
  if (!shouldAskAI) return heuristic.sector;

  const aiSector = await detectSectorAI(text);
  if (aiSector && aiSector !== "unknown") return aiSector;

  return heuristic.sector || "general";
}

// Keep old function name for compatibility (not used in generate anymore)
function detectSector(text) {
  return detectSectorHeuristic(text).sector || "general";
}

async function detectSectorAI(text) {
  if (!GEMINI_API_KEY) {
    return "unknown";
  }

  const allowed =
    listJsonSectorsFromDataDir();

  if (!allowed.length) {
    return "unknown";
  }

  try {
    const output =
      await generateGeminiText({
        apiKey: GEMINI_API_KEY,
        model: GEMINI_MODEL,
        fallbackModels: GEMINI_FALLBACK_MODELS,
        timeoutMs: GEMINI_TIMEOUT_MS,
        totalTimeoutMs: GEMINI_TOTAL_TIMEOUT_MS,
        maxRetries: GEMINI_MAX_RETRIES,
        onAttempt: recordAiAttempt,

        systemInstruction:
          `You are a strict classifier. ` +
          `Choose exactly ONE sector from this list:\n` +
          allowed
            .map((sector) => `- ${sector}`)
            .join("\n") +
          `\n\nReturn ONLY the sector key. ` +
          `If none fits, return "unknown".`,

        prompt: String(text || ""),

        maxOutputTokens: 64,
      });

    const sector =
      String(output || "")
        .trim()
        .replace(/^["'`]+|["'`]+$/g, "");

    return allowed.includes(sector)
      ? sector
      : "unknown";
  } catch (error) {
    console.error(
      "Gemini sector classification error:",
      error?.message || error
    );

    return "unknown";
  }
}

async function resolveComplaintRouting({
  sector: requestedSectorInput = "",
  complaint = "",
  issueLocation = "",
  petitionerAddress = "",
  institutionName = "",
  institutionLevel = "",
  escalationStage = "",
  priorComplaintReference = "",
  priorComplaintDate = "",
  bankingComplaintType = "",
  providerResponseStatus = "",
  country = "Nigeria",
} = {}) {
  const requestedSector =
    String(requestedSectorInput || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/-/g, "_");

  const preSectorRouting =
    resolvePreSectorJurisdiction({
      complaint,
      issueLocation,
      petitionerAddress,
      institutionName,
      institutionLevel,
      escalationStage,
      priorComplaintReference,
      priorComplaintDate,
      bankingComplaintType,
      providerResponseStatus,
      country,
    });

  const sectorDetectionText =
    buildSectorDetectionText({
      complaint,
      institutionName,
      issueLocation,
    });

  const institutionPriority =
    detectInstitutionSector(
      institutionName
    );

  const complaintPriority =
    detectSectorHeuristic(
      complaint
    );

  const electionViolencePriority =
    assessElectionViolenceRisk(
      sectorDetectionText
    );

  const combinedHeuristic =
    preSectorRouting.matched
      ? {
          sector:
            preSectorRouting.sector ||
            "civil_disputes",

          score: 1000,

          reason:
            "jurisdiction_override",
        }
      : detectSectorHeuristic(
          sectorDetectionText
        );

  let sector = "";
  let source = "";

  if (electionViolencePriority.matched) {
    sector =
      electionViolencePriority.sector;

    source =
      "election_violence_safety_priority";
  } else if (preSectorRouting.matched) {
    sector =
      preSectorRouting.sector ||
      "civil_disputes";

    source =
      "pre_sector_jurisdiction";
  } else if (
    complaintPriority.sector ===
      "anti_corruption" &&
    complaintPriority.score > 0
  ) {
    sector =
      "anti_corruption";

    source =
      "complaint_anti_corruption_priority";
  } else if (
    institutionPriority.matched
  ) {
    sector =
      institutionPriority.sector;

    source =
      "institution_priority";
  } else if (
    requestedSector
  ) {
    sector =
      requestedSector;

    source =
      "explicit_sector";
  } else {
    sector =
      await detectSectorSmart(
        sectorDetectionText
      );

    source =
      "combined_heuristic_or_ai";
  }

  if (
    !sector ||
    sector === "unknown"
  ) {
    sector = "general";
    source =
      "general_fallback";
  }

  const jurisdictionRouting =
    preSectorRouting.matched &&
    !electionViolencePriority.matched
      ? preSectorRouting
      : resolveJurisdictionRouting({
          sector,
          complaint,
          issueLocation,
          petitionerAddress,
          institutionName,
          institutionLevel,
          escalationStage,
          priorComplaintReference,
          priorComplaintDate,
          bankingComplaintType,
          providerResponseStatus,
          country,
        });

  const sectorDetection = {
    source,

    requestedSector,

    selectedSector:
      sector,

    institutionPriority: {
      matched:
        institutionPriority.matched,

      sector:
        institutionPriority.sector,

      score:
        institutionPriority.score,

      evidence:
        institutionPriority.evidence,

      version:
        institutionPriority.version,
    },

    electionViolencePriority,

    combinedHeuristic: {
      sector:
        combinedHeuristic.sector,

      score:
        combinedHeuristic.score,

      reason:
        combinedHeuristic.reason,
    },
  };

  return {
    sector,
    sectorDetection,
    jurisdictionRouting,
    heuristic:
      combinedHeuristic,
  };
}

function inferCaseType(sector) {
  if (sector === "civil_disputes") {
    return "civil_dispute";
  }

  if (
    sector === "security" ||
    sector === "judiciary"
  ) {
    return "human_rights";
  }

  if (
    [
      "health",
      "telecoms",
      "aviation",
      "banking",
      "power",
      "education",
    ].includes(sector)
  ) {
    return "service_delivery";
  }

  if (
    sector ===
    "international_escalation"
  ) {
    return "international";
  }

  if (
    sector ===
    "anti_corruption"
  ) {
    return "anti_corruption";
  }

  if (
    sector ===
    "diaspora_report"
  ) {
    return "diaspora";
  }

  return "other";
}

function inferGeneralOversightInstitutions(complaint) {
  const lower = String(complaint || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  const names = [];

  const humanRightsSignals = [
    "human rights",
    "rights violation",
    "violation of my rights",
    "unlawful arrest",
    "unlawful detention",
    "illegal detention",
    "torture",
    "police brutality",
    "discrimination",
    "inhuman treatment",
    "degrading treatment",
    "freedom of expression",
    "freedom of speech",
  ];

  const publicServiceSignals = [
    "ministry",
    "government agency",
    "government office",
    "public office",
    "public institution",
    "public servant",
    "civil service",
    "administrative delay",
    "refusal to act",
    "failure to respond",
    "failure to acknowledge",
    "no acknowledgement",
    "no acknowledgment",
    "government application",
    "public service",
    "federal government",
    "state government",
    "local government",
  ];

  const consumerSignals = [
    "consumer",
    "customer",
    "service provider",
    "private company",
    "merchant",
    "product",
    "refund",
    "warranty",
    "billing dispute",
    "unfair charge",
    "subscription",
    "defective product",
    "poor service",
    "consumer complaint",
  ];

  if (
    humanRightsSignals.some(
      (signal) => lower.includes(signal)
    )
  ) {
    names.push(
      "National Human Rights Commission (NHRC)"
    );
  }

  if (
    publicServiceSignals.some(
      (signal) => lower.includes(signal)
    )
  ) {
    names.push("SERVICOM");
  }

  if (
    consumerSignals.some(
      (signal) => lower.includes(signal)
    )
  ) {
    names.push(
      "Federal Competition and Consumer Protection Commission (FCCPC)"
    );
  }

  return safeUniq(names);
}

function buildAdminOversightCC({ sector, caseType }) {
  const cc = [];

  // PCC is not automatically copied on
  // general or private civil disputes.
  if (
    sector !==
      "international_escalation" &&
    sector !== "general" &&
    sector !==
      "civil_disputes" &&
    OVERSIGHT_EMAILS.PCC
  ) {
    cc.push(
      OVERSIGHT_EMAILS.PCC
    );
  }

  if (caseType === "human_rights" && OVERSIGHT_EMAILS.NHRC) cc.push(OVERSIGHT_EMAILS.NHRC);

  if (caseType === "service_delivery") {
    if (OVERSIGHT_EMAILS.SERVICOM) cc.push(OVERSIGHT_EMAILS.SERVICOM);
    if (OVERSIGHT_EMAILS.FCCPC) cc.push(OVERSIGHT_EMAILS.FCCPC);
  }

  if (sector === "international_escalation" && OVERSIGHT_EMAILS.AGF) cc.push(OVERSIGHT_EMAILS.AGF);

  return safeUniq(cc).filter(isEmail);
}

/* ======================================================
   CATALOG + MATCHING (JSON-only)
====================================================== */
function extractEmailsFromString(str) {
  if (typeof str !== "string") return [];
  const s = str.trim();
  if (!s) return [];
  const matches = s.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return matches.map((m) => m.trim());
}

function extractEmailsDeep(value, out = []) {
  if (!value) return out;

  if (typeof value === "string") {
    const emails = extractEmailsFromString(value);
    if (emails.length) out.push(...emails);
    return out;
  }

  if (Array.isArray(value)) {
    value.forEach((v) => extractEmailsDeep(v, out));
    return out;
  }

  if (typeof value === "object" && value !== null) {
    Object.values(value).forEach((v) => extractEmailsDeep(v, out));
    return out;
  }

  return out;
}

// Verified address extraction is implemented in
// lib/institutionContactUtils.mjs.
// Only explicitly labelled address fields are accepted.

function normalizeName(s = "") {
  return String(s)
    .toLowerCase()
    .replace(/[\u2019’]/g, "'")
    .replace(/[^a-z0-9\s().,&/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripCorporateSuffixes(s = "") {
  return normalizeName(s)
    .replace(/\b(plc|ltd|limited|inc|llc|company|co)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractParenAbbr(name = "") {
  const out = [];
  const re = /\(([A-Z0-9]{2,12})\)/g;
  let m;
  while ((m = re.exec(name)) !== null) out.push(m[1]);
  return out;
}

function autoAliasesForInternationalTopKey(k = "") {
  const key = String(k || "").trim();
  switch (key) {
    case "United_States":
      return [
        "United States Congress",
        "US Congress",
        "U.S. Congress",
        "United States Senate",
        "US Senate",
        "U.S. Senate",
        "House of Representatives",
        "U.S. House of Representatives",
        "Senate Foreign Relations Committee",
        "Foreign Relations Committee",
        "SFRC",
        "House Foreign Affairs Committee",
        "Foreign Affairs Committee",
        "Tom Lantos Human Rights Commission",
        "TLHRC",
      ];
    case "United_Kingdom":
      return [
        "UK Parliament",
        "United Kingdom Parliament",
        "House of Commons",
        "House of Lords",
        "Foreign Affairs Committee",
        "FAC",
        "FCDO",
        "Foreign, Commonwealth and Development Office",
        "Foreign Commonwealth & Development Office",
      ];
    case "European_Union":
      return [
        "European Union",
        "EU Parliament",
        "European Parliament",
        "EEAS",
        "European External Action Service",
        "EU Delegation to Nigeria",
        "DROI",
        "Subcommittee on Human Rights",
        "PETI",
        "Committee on Petitions",
      ];
    case "United_Nations":
      return [
        "United Nations",
        "UN",
        "UN Human Rights",
        "OHCHR",
        "Human Rights Council",
        "Special Procedures",
        "Special Procedures Branch",
      ];
    case "International_Criminal_Court":
      return [
        "International Criminal Court",
        "ICC",
        "Office of the Prosecutor",
        "OTP",
        "The Hague",
        "ICC Prosecutor",
      ];
    case "Canada":
      return [
        "Parliament of Canada",
        "House of Commons Canada",
        "Global Affairs Canada",
        "Standing Committee on Foreign Affairs and International Development",
        "FAAE",
      ];
    default:
      return [];
  }
}

function buildInstitutionCatalog(sectorJson) {
  const items = [];
  const seen = new Set(); // norm de-dupe

  function addItem(name, obj, extraAliases = []) {
    if (!name) return;

    const contactVerification =
      assessInstitutionContactVerification({
        institution:
          obj || {},

        sectorData:
          sectorJson || {},
      });

    const discoveredEmails =
      safeUniq(
        extractEmailsDeep(
          obj
        )
      ).filter(
        isEmail
      );

    const discoveredAddresses =
      safeUniq(
        extractAddressesDeep(
          obj
        )
      ).filter(
        isLikelyAddress
      );

    /*
     * Names and aliases remain available
     * for correct jurisdiction matching.
     *
     * Direct email and physical-address
     * delivery details are exposed only
     * where the record contains verified
     * official-source metadata.
     */
    const emails =
      contactVerification
        .directContactAllowed
        ? discoveredEmails
        : [];

    const addresses =
      contactVerification
        .directContactAllowed
        ? discoveredAddresses
        : [];

    const primaryAddress =
      addresses[0] || "";

    const aliases = safeUniq([
      ...(Array.isArray(obj?.aliases) ? obj.aliases : []),
      ...extraAliases,
      ...extractParenAbbr(String(name)),
      ...(typeof obj?.committee === "string" ? [obj.committee] : []),
      ...(typeof obj?.bodies === "string" ? [obj.bodies] : []),
      ...(typeof obj?.mandate === "string" ? [obj.mandate] : []),
    ]).filter(Boolean);

    const norm = normalizeName(name);
    if (!norm) return;
    if (seen.has(norm)) return;
    seen.add(norm);

    const aliasNorms = safeUniq(aliases.map((a) => normalizeName(a))).filter(Boolean);

    const shortNorm = stripCorporateSuffixes(name);
    const shortAliasNorms = safeUniq([shortNorm, ...aliasNorms.map(stripCorporateSuffixes)]).filter(Boolean);

    items.push({
      name: String(name),
      norm,
      shortNorm,
      aliasNorms,
      shortAliasNorms,
      emails,
      addresses,
      primaryAddress,

      contactVerified:
        contactVerification
          .directContactAllowed,

      contactVerificationStatus:
        contactVerification
          .status,

      contactVerificationReason:
        contactVerification
          .reason,

      officialContactSources:
        contactVerification
          .officialSources,
    });
  }

  if (!sectorJson || typeof sectorJson !== "object") return items;

  const oversightNode = sectorJson.oversight || sectorJson.oversight_ministry || sectorJson.oversightMinistry;
  if (oversightNode && typeof oversightNode === "object") {
    for (const key of Object.keys(oversightNode)) {
      const node = oversightNode[key];
      addItem(node?.name || key, node, [key]);
    }
  }

  const arrayKeys = [
    "core_institutions",
    "regulators",
    "watchdogs",
    "players",
    "institutions",
    "bodies",
    "agencies",
    "committees",
    "entities",
    "contacts",
  ];
  for (const key of arrayKeys) {
    const arr = sectorJson[key];
    if (Array.isArray(arr)) {
      arr.forEach((inst) => addItem(inst?.name || inst, inst, [key]));
    }
  }

  const nde = sectorJson.Nigeria_Domestic_Escalation;
  if (nde && Array.isArray(nde.bodies)) {
    nde.bodies.forEach((inst) => addItem(inst?.name || inst, inst, ["Nigeria Domestic Escalation"]));
  }

  const ignoreTopKeys = new Set([
    "sector",
    "version",
    "scope",
    "last_updated",
    "purpose",
    "routing_rules",
    "routing_keywords",
    "minimum_petition_pack",
    "Nigeria_Domestic_Escalation",
  ]);

  for (const [k, v] of Object.entries(sectorJson)) {
    if (ignoreTopKeys.has(k)) continue;
    if (!v || typeof v !== "object" || Array.isArray(v)) continue;

    const hasEmails = extractEmailsDeep(v).some((e) => isEmail(e));
    const hasAddress = typeof v?.address === "string" && isLikelyAddress(String(v.address || ""));
    if (!hasEmails && !hasAddress) continue;

    const keyAlias = String(k).replace(/_/g, " ").replace(/\s+/g, " ").trim();
    const auto = autoAliasesForInternationalTopKey(k);
    addItem(v?.name || keyAlias, v, [keyAlias, ...auto]);
  }

  function walk(node, pathKey = "") {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach((x) => walk(x, pathKey));
      return;
    }
    if (typeof node !== "object") return;

    const nm = typeof node.name === "string" ? node.name.trim() : "";
    if (nm) {
      const hasEmails = extractEmailsDeep(node).some((e) => isEmail(e));
      const hasAddress = typeof node?.address === "string" && isLikelyAddress(String(node.address || ""));
      if (hasEmails || hasAddress) addItem(nm, node, pathKey ? [pathKey] : []);
    }

    for (const [k, v] of Object.entries(node)) {
      if (ignoreTopKeys.has(k)) continue;
      if (
        ["routing_rules", "routing_keywords", "purpose", "minimum_petition_pack", "version", "scope", "last_updated", "sector"].includes(
          k
        )
      )
        continue;
      walk(v, k);
    }
  }
  walk(sectorJson, "");

  return items;
}

function matchInstitutionNameToCatalogWithScore(name, catalog) {
  const q = normalizeName(name);
  const qShort = stripCorporateSuffixes(name);
  if (!q) return { item: null, score: 0 };

  let best = null;
  let bestScore = 0;

  const qTokens = new Set(q.split(" ").filter((w) => w.length > 2));
  const qShortTokens = new Set(qShort.split(" ").filter((w) => w.length > 2));

  for (const item of catalog) {
    if (!item?.norm) continue;

    let score = 0;

    if (q === item.norm || (qShort && qShort === item.shortNorm)) score += 100;
    if (item.aliasNorms.includes(q) || (qShort && item.shortAliasNorms.includes(qShort))) score += 90;

    if (q.includes(item.norm) || item.norm.includes(q)) score += 40;
    if (qShort && (qShort.includes(item.shortNorm) || item.shortNorm.includes(qShort))) score += 35;

    let overlap = 0;
    for (const t of item.shortNorm.split(" ")) {
      if (qTokens.has(t) || qShortTokens.has(t)) overlap++;
    }
    if (overlap >= 2) score += overlap * 10;

    if (overlap >= 1 && qTokens.size >= 6) score += 8;

    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  if (bestScore < 30) return { item: null, score: 0 };
  return { item: best, score: bestScore };
}

function matchInstitutionNameToCatalog(name, catalog) {
  return matchInstitutionNameToCatalogWithScore(name, catalog).item;
}

const GLOBAL_CATALOG_BY_SECTOR = new Map();

function getCatalogForSector(sector) {
  for (const key of sectorKeyCandidates(sector)) {
    if (GLOBAL_CATALOG_BY_SECTOR.has(key)) return GLOBAL_CATALOG_BY_SECTOR.get(key);
  }
  for (const key of sectorKeyCandidates(sector)) {
    const sj = loadSectorJson(key);
    if (!sj) continue;
    const cat = buildInstitutionCatalog(sj);
    GLOBAL_CATALOG_BY_SECTOR.set(key, cat);
    return cat;
  }
  return [];
}

function primeGlobalCatalog() {
  const sectors = listJsonSectorsFromDataDir();
  for (const sec of sectors) {
    const sj = loadSectorJson(sec);
    if (!sj) continue;
    GLOBAL_CATALOG_BY_SECTOR.set(sec, buildInstitutionCatalog(sj));
  }
}
primeGlobalCatalog();

function matchInstitutionAcrossAllSectors(name, preferredSector) {
  const preferredCatalog = getCatalogForSector(preferredSector);
  const hit1 = matchInstitutionNameToCatalog(name, preferredCatalog);
  if (hit1) return hit1;

  let best = null;
  let bestScore = 0;
  for (const catalog of GLOBAL_CATALOG_BY_SECTOR.values()) {
    const { item, score } = matchInstitutionNameToCatalogWithScore(name, catalog);
    if (!item) continue;
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return bestScore >= 30 ? best : null;
}

function enforceRoutingHeaders(
  petitionText,
  toLine,
  ccLine
) {
  const lines = String(
    petitionText || ""
  ).split(/\r?\n/);

  const output = [];

  let wroteTo = false;
  let wroteCc = false;

  for (const line of lines) {
    if (
      /^\s*TO\s*:/i.test(line)
    ) {
      if (!wroteTo) {
        output.push(toLine);
        wroteTo = true;
      }

      continue;
    }

    if (
      /^\s*CC\s*:/i.test(line)
    ) {
      if (!wroteCc) {
        output.push(ccLine);
        wroteCc = true;
      }

      continue;
    }

    if (
      /^\s*SUBJECT\s*:/i.test(line)
    ) {
      if (!wroteTo) {
        output.push(toLine);
        wroteTo = true;
      }

      if (!wroteCc) {
        output.push(ccLine);
        wroteCc = true;
      }

      output.push(line);
      continue;
    }

    output.push(line);
  }

  if (!wroteTo) {
    output.unshift(toLine);
  }

  if (!wroteCc) {
    const toIndex =
      output.findIndex(
        (line) =>
          /^\s*TO\s*:/i.test(
            line
          )
      );

    output.splice(
      toIndex + 1,
      0,
      ccLine
    );
  }

  return output
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractSectionInstitutionNames(petitionText, sectionLabel) {
  const lines = String(petitionText || "").split(/\r?\n/);

  let mode = null;
  const collected = [];

  for (const rawLine of lines) {
    const line = String(rawLine || "");

    const toMatch = line.match(/^\s*to\s*:\s*(.*)\s*$/i);
    const ccMatch = line.match(/^\s*cc\s*:\s*(.*)\s*$/i);
    const subMatch = line.match(/^\s*subject\s*:\s*(.*)\s*$/i);

    if (toMatch) {
      mode = "TO";
      if (toMatch[1]?.trim()) collected.push({ mode, text: toMatch[1].trim() });
      continue;
    }
    if (ccMatch) {
      mode = "CC";
      if (ccMatch[1]?.trim()) collected.push({ mode, text: ccMatch[1].trim() });
      continue;
    }
    if (subMatch) {
      mode = null;
      continue;
    }

    if (!line.trim()) {
      mode = null;
      continue;
    }

    if (mode === "TO" || mode === "CC") {
      collected.push({ mode, text: line.trim() });
    }
  }

  const raw = collected
    .filter((x) => x.mode === sectionLabel)
    .map((x) => x.text)
    .join(" ");

  if (!raw) return [];

  return raw
    .split(/;|,|\s+\band\b\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Only replace TO/CC blocks if we actually have items to inject
function injectInstitutionAddressesIntoPetition(petitionText, toItems = [], ccItems = []) {
  const lines = String(petitionText || "").split(/\r?\n/);
  const out = [];

  let skippingToBlock = false;
  let skippingCcBlock = false;
  let toInjected = false;
  let ccInjected = false;

  const renderToLines = () => {
    const arr = [];
    if (!toItems.length) return arr;
    toItems.forEach((it, idx) => {
      arr.push(`TO: ${it.name}`);
      if (it.primaryAddress) arr.push(`Address: ${it.primaryAddress}`);
      if (idx < toItems.length - 1) arr.push("");
    });
    return arr;
  };

  const renderCcLines = () => {
    const arr = [];
    if (!ccItems.length) return arr;
    ccItems.forEach((it, idx) => {
      arr.push(`CC: ${it.name}`);
      if (it.primaryAddress) arr.push(`Address: ${it.primaryAddress}`);
      if (idx < ccItems.length - 1) arr.push("");
    });
    return arr;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const isTo = /^\s*TO\s*:/i.test(line);
    const isCc = /^\s*CC\s*:/i.test(line);
    const isSubject = /^\s*SUBJECT\s*:/i.test(line);

    if (isTo) {
      if (toItems.length) {
        if (!toInjected) {
          out.push(...renderToLines());
          toInjected = true;
        }
        skippingToBlock = true;
        skippingCcBlock = false;
        continue;
      } else {
        skippingToBlock = false;
        skippingCcBlock = false;
        out.push(line);
        continue;
      }
    }

    if (isCc) {
      if (ccItems.length) {
        if (!ccInjected) {
          out.push(...renderCcLines());
          ccInjected = true;
        }
        skippingCcBlock = true;
        skippingToBlock = false;
        continue;
      } else {
        skippingToBlock = false;
        skippingCcBlock = false;
        out.push(line);
        continue;
      }
    }

    if (isSubject) {
      skippingToBlock = false;
      skippingCcBlock = false;
      out.push(line);
      continue;
    }

    if (skippingToBlock || skippingCcBlock) {
      if (!line.trim()) continue;
      continue;
    }

    out.push(line);
  }

  return out.join("\n").trim();
}

/* ======================================================
   DURABLE PETITION STORAGE (Firestore + memory)
====================================================== */
async function storePetition(tx_ref, payload) {
  const record = { ...payload, storedAt: Date.now() };

  petitionStore.set(tx_ref, record);
  scheduleMemoryExpiry(tx_ref);

  if (redis) {
    try {
      await redis.set(`pd:petition:${tx_ref}`, JSON.stringify(record), "EX", PETITION_TTL_SECONDS);
    } catch {}
  }
}

async function getPetition(tx_ref) {
  if (redis) {
    try {
      const raw = await redis.get(`pd:petition:${tx_ref}`);
      if (raw) return JSON.parse(raw);
    } catch {}
  }
  return petitionStore.get(tx_ref) || null;
}

async function deletePetition(tx_ref) {
  petitionStore.delete(tx_ref);
  if (redis) {
    try {
      await redis.del(`pd:petition:${tx_ref}`);
    } catch {}
  }
}

// Mark tx paid (durable best-effort)
async function markTxPaid(tx_ref) {
  USED_TX_REFS.add(tx_ref);
  if (redis) {
    try {
      await redis.set(`pd:paid:${tx_ref}`, "1", "EX", PETITION_TTL_SECONDS);
    } catch {}
  }
}

async function isTxPaid(tx_ref) {
  if (USED_TX_REFS.has(tx_ref)) return true;
  if (!redis) return false;
  try {
    const v = await redis.get(`pd:paid:${tx_ref}`);
    return v === "1";
  } catch {
    return false;
  }
}

// Persist unlocked response (prevents “looks failed” on refresh)
async function storeUnlocked(tx_ref, payload) {
  USED_TX_SUCCESS.add(tx_ref);
  petitionStore.set(`__unlocked__:${tx_ref}`, payload);
  setTimeout(() => petitionStore.delete(`__unlocked__:${tx_ref}`), PETITION_TTL_SECONDS * 1000).unref?.();

  if (redis) {
    try {
      await redis.set(`pd:unlocked:${tx_ref}`, JSON.stringify(payload), "EX", PETITION_TTL_SECONDS);
    } catch {}
  }
}

async function getUnlocked(tx_ref) {
  if (redis) {
    try {
      const raw = await redis.get(`pd:unlocked:${tx_ref}`);
      if (raw) return JSON.parse(raw);
    } catch {}
  }
  return petitionStore.get(`__unlocked__:${tx_ref}`) || null;
}

// Store Flutterwave transaction id (helps verify by ID)
async function storeTxId(tx_ref, tx_id) {
  const id = String(tx_id || "").trim();
  if (!id) return;

  const rec = await getPetition(tx_ref);
  if (rec && !rec.flw_tx_id) {
    rec.flw_tx_id = id;
    await storePetition(tx_ref, rec);
  }

  if (redis) {
    try {
      await redis.set(`pd:txid:${tx_ref}`, id, "EX", PETITION_TTL_SECONDS);
    } catch {}
  }
}

async function getTxId(tx_ref) {
  if (redis) {
    try {
      const v = await redis.get(`pd:txid:${tx_ref}`);
      if (v) return String(v).trim();
    } catch {}
  }
  const rec = await getPetition(tx_ref);
  return String(rec?.flw_tx_id || "").trim();
}

app.use(
  createSupportRouter({
    supportStore,
    supportEmail:
      SUPPORT_EMAIL,
    isEmail,
    isAdminTokenValid,
    incrementSupportMetric:
      async () => {
        await redisIncr(
          METRICS.supportSubmitted
        );
      },

    notifySupportTicket:
      async (
        ticket
      ) =>
        supportNotifier
          .notifyNewTicket(
            ticket
          ),

    rateLimitMax:
      SUPPORT_RATE_LIMIT_MAX,
    rateLimitWindowMs:
      SUPPORT_RATE_LIMIT_WINDOW_MS,
    consumeSharedRateLimit:
      consumeSupportLimit,
  })
);

/* ======================================================
   ADMIN ENDPOINTS
====================================================== */
app.post("/admin/session", async (req, res) => {
  try {
    const key = String(req.body?.key || "");
    if (!ADMIN_UNLOCK_KEY) return res.status(500).json({ ok: false, error: "ADMIN_UNLOCK_KEY not configured" });

    const limit = await consumeAdminLoginLimit(requestFingerprint(req));

    if (!limit.ok) {
      res.setHeader("Retry-After", String(limit.retryAfterSeconds));
      return res.status(429).json({
        ok: false,
        code: "admin_login_rate_limited",
        error: "Too many administrator login attempts. Please try again later.",
        retryAfterSeconds: limit.retryAfterSeconds,
      });
    }

    if (!safeSecretEqual(key, ADMIN_UNLOCK_KEY)) {
      await redisIncr(METRICS.adminLoginFailed);
      return res.status(401).json({ ok: false, error: "Invalid admin key" });
    }

    const token = await createAdminSession();
    await redisIncr(METRICS.adminSessions);

    return res.json({ ok: true, token, expiresInSeconds: ADMIN_SESSION_TTL_SECONDS });
  } catch {
    return res.status(500).json({ ok: false, error: "Admin session failed" });
  }
});

app.get("/admin/stats", async (req, res) => {
  try {
    const token = String(req.headers["x-admin-token"] || "");
    const valid = await isAdminTokenValid(token);
    if (!valid) return res.status(401).json({ ok: false, error: "Unauthorized" });

    const visitorStats =
      await getAnonymousVisitorStats();

    const stats = {
      visits: await redisGetInt(METRICS.visits),
      generated: await redisGetInt(METRICS.generated),
      previewed: await redisGetInt(METRICS.previewed),
      payment_initiated: await redisGetInt(METRICS.paymentInitiated),
      payment_success: await redisGetInt(METRICS.paymentSuccess),
      unlocked_paid: await redisGetInt(METRICS.unlockedPaid),
      unlocked_free:
        await redisGetInt(
          METRICS.unlockedFree
        ),
      admin_sessions:
        await redisGetInt(
          METRICS.adminSessions
        ),
      support_submitted:
        await redisGetInt(
          METRICS.supportSubmitted
        ),
      generation_failed: await redisGetInt(METRICS.generationFailed),
      generation_rate_limited: await redisGetInt(METRICS.generationRateLimited),
      ai_attempts: await redisGetInt(METRICS.aiAttempts),
      ai_fallbacks: await redisGetInt(METRICS.aiFallbacks),
      admin_login_failed: await redisGetInt(METRICS.adminLoginFailed),
      webhook_rejected: await redisGetInt(METRICS.webhookRejected),
      unique_payinit_txrefs: await redisSCard(METRICS.uniquePayInit),
      unique_paysuccess_txrefs: await redisSCard(METRICS.uniquePaySuccess),
      ...visitorStats,
    };

    res.json({ ok: true, stats });
  } catch {
    res.status(500).json({ ok: false, error: "Stats error" });
  }
});


app.get("/admin/overview", async (req, res) => {
  try {
    const token =
      String(
        req.headers[
          "x-admin-token"
        ] || ""
      );

    const valid =
      await isAdminTokenValid(
        token
      );

    if (!valid) {
      return res
        .status(401)
        .json({
          ok: false,
          error:
            "Unauthorized",
        });
    }

    const metrics = {
      visits:
        await redisGetInt(
          METRICS.visits
        ),

      generated:
        await redisGetInt(
          METRICS.generated
        ),

      previewed:
        await redisGetInt(
          METRICS.previewed
        ),

      payment_initiated:
        await redisGetInt(
          METRICS
            .paymentInitiated
        ),

      payment_success:
        await redisGetInt(
          METRICS
            .paymentSuccess
        ),

      unlocked_paid:
        await redisGetInt(
          METRICS
            .unlockedPaid
        ),

      unlocked_free:
        await redisGetInt(
          METRICS
            .unlockedFree
        ),

      admin_sessions:
        await redisGetInt(
          METRICS
            .adminSessions
        ),

      support_submitted:
        await redisGetInt(
          METRICS
            .supportSubmitted
        ),

      generation_failed:
        await redisGetInt(METRICS.generationFailed),

      generation_rate_limited:
        await redisGetInt(METRICS.generationRateLimited),

      ai_attempts:
        await redisGetInt(METRICS.aiAttempts),

      ai_fallbacks:
        await redisGetInt(METRICS.aiFallbacks),

      admin_login_failed:
        await redisGetInt(METRICS.adminLoginFailed),

      webhook_rejected:
        await redisGetInt(METRICS.webhookRejected),

      unique_payinit_txrefs:
        await redisSCard(
          METRICS
            .uniquePayInit
        ),

      unique_paysuccess_txrefs:
        await redisSCard(
          METRICS
            .uniquePaySuccess
        ),

      ...await getAnonymousVisitorStats(),
    };

    const warnings = [];

    let firebaseUsers = [];
    let entitlementUsers = [];
    let supportTickets = [];

    try {
      firebaseUsers =
        await listFirebaseUsers({
          maxResults: 5000,
        });
    } catch (error) {
      console.error(
        "Admin Firebase user list error:",
        error
      );

      warnings.push(
        "Firebase user list could not be loaded."
      );
    }

    try {
      entitlementUsers =
        await freeEntitlementStore
          .listUsers({
            limit: 5000,
          });
    } catch (error) {
      console.error(
        "Admin entitlement list error:",
        error
      );

      warnings.push(
        "Free-petition entitlement records could not be loaded."
      );
    }

    try {
      supportTickets =
        await supportStore.list({
          limit: 100,
        });
    } catch (error) {
      console.error(
        "Admin support list error:",
        error
      );

      warnings.push(
        "Support records could not be loaded."
      );
    }

    const entitlementByUid =
      new Map(
        entitlementUsers.map(
          (record) => [
            String(
              record?.uid ||
              ""
            ),
            record,
          ]
        )
      );

    const now =
      Date.now();

    const oneDayMs =
      24 * 60 * 60 * 1000;

    const thirtyDaysMs =
      30 *
      oneDayMs;

    const dateMillis = (
      value
    ) => {
      const parsed =
        Date.parse(
          String(
            value ||
            ""
          )
        );

      return Number.isFinite(
        parsed
      )
        ? parsed
        : 0;
    };

    const users =
      firebaseUsers
        .map(
          (user) => {
            const entitlement =
              entitlementByUid.get(
                String(
                  user.uid ||
                  ""
                )
              ) || {};

            const freeUsed =
              Math.max(
                Number(
                  entitlement
                    .freeUsed ||
                  0
                ),
                0
              );

            const freeLimit =
              Math.max(
                Number(
                  entitlement
                    .freeLimit ??
                  FREE_PETITION_LIMIT
                ),
                0
              );

            return {
              uid:
                String(
                  user.uid ||
                  ""
                ),

              email:
                String(
                  user.email ||
                  ""
                ),

              emailVerified:
                user.emailVerified ===
                true,

              displayName:
                String(
                  user.displayName ||
                  ""
                ),

              disabled:
                user.disabled ===
                true,

              createdAt:
                String(
                  user.createdAt ||
                  ""
                ),

              lastSignInAt:
                String(
                  user.lastSignInAt ||
                  ""
                ),

              freeLimit,

              freeUsed,

              freeRemaining:
                Math.max(
                  freeLimit -
                    freeUsed,
                  0
                ),

              requiresPayment:
                freeUsed >=
                freeLimit,

              lastFreeUnlockAt:
                String(
                  entitlement
                    .lastFreeUnlockAt ||
                  ""
                ),
            };
          }
        )
        .sort(
          (a, b) =>
            dateMillis(
              b.createdAt
            ) -
            dateMillis(
              a.createdAt
            )
        );

    const registeredUsers =
      users.length;

    const verifiedUsers =
      users.filter(
        (user) =>
          user.emailVerified
      ).length;

    const disabledUsers =
      users.filter(
        (user) =>
          user.disabled
      ).length;

    const newUsers24h =
      users.filter(
        (user) =>
          dateMillis(
            user.createdAt
          ) >=
          now -
            oneDayMs
      ).length;

    const newUsers30d =
      users.filter(
        (user) =>
          dateMillis(
            user.createdAt
          ) >=
          now -
            thirtyDaysMs
      ).length;

    const recentSignIns24h =
      users.filter(
        (user) =>
          dateMillis(
            user.lastSignInAt
          ) >=
          now -
            oneDayMs
      ).length;

    const freeUsers =
      users.filter(
        (user) =>
          user.freeUsed > 0
      ).length;

    const freeLimitReached =
      users.filter(
        (user) =>
          user.requiresPayment
      ).length;

    const freeRemainingUsers =
      users.filter(
        (user) =>
          user.freeRemaining > 0
      ).length;

    return res.json({
      ok: true,

      generatedAt:
        new Date()
          .toISOString(),

      metrics,

      usersSummary: {
        registered_users:
          registeredUsers,

        verified_users:
          verifiedUsers,

        unverified_users:
          Math.max(
            registeredUsers -
              verifiedUsers,
            0
          ),

        disabled_users:
          disabledUsers,

        new_users_24h:
          newUsers24h,

        new_users_30d:
          newUsers30d,

        recent_signins_24h:
          recentSignIns24h,

        users_with_free_usage:
          freeUsers,

        users_with_free_remaining:
          freeRemainingUsers,

        free_limit_reached:
          freeLimitReached,
      },

      users,

      recentSupport:
        supportTickets,

      warnings,
    });
  } catch (error) {
    console.error(
      "Admin overview error:",
      error
    );

    return res
      .status(500)
      .json({
        ok: false,
        error:
          "Admin overview error",
      });
  }
});

app.get("/admin/diagnostics", async (req, res) => {
  try {
    const token = String(req.headers["x-admin-token"] || "");

    if (!await isAdminTokenValid(token)) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    return res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      revision: String(process.env.K_REVISION || "local"),
      environment: IS_PRODUCTION ? "production" : "development",
      ai: {
        provider: "gemini",
        configured: Boolean(GEMINI_API_KEY),
        model: GEMINI_MODEL,
        fallbackModels: GEMINI_FALLBACK_MODELS,
        maxRetries: GEMINI_MAX_RETRIES,
        timeoutMs: GEMINI_TIMEOUT_MS,
        totalTimeoutMs: GEMINI_TOTAL_TIMEOUT_MS,
        attempts: await redisGetInt(METRICS.aiAttempts),
        fallbacks: await redisGetInt(METRICS.aiFallbacks),
        failedGenerations: await redisGetInt(METRICS.generationFailed),
        ...runtimeDiagnostics,
      },
      payments: {
        provider: "flutterwave",
        configured: Boolean(FLW_SECRET_KEY),
        webhookConfigured: Boolean(FLW_WEBHOOK_HASH),
        webhookStrict: IS_PRODUCTION,
        amountNgn: PETITION_PRICE_NGN,
        attempts: await redisGetInt(METRICS.paymentInitiated),
        successful: await redisGetInt(METRICS.paymentSuccess),
        rejectedWebhooks: await redisGetInt(METRICS.webhookRejected),
      },
      access: {
        freeAccessEnabled: FREE_ACCESS_ENABLED,
        freePetitionLimit: FREE_PETITION_LIMIT,
        generationRateLimitMax: GENERATION_RATE_LIMIT_MAX,
        adminLoginRateLimitMax: ADMIN_LOGIN_RATE_LIMIT_MAX,
        rateLimitWindowMs: SECURITY_RATE_LIMIT_WINDOW_MS,
      },
      storage: {
        firestoreEnabled: FIRESTORE_ENABLED,
        firestoreAvailable: Boolean(redis),
        sharedRateLimiting: typeof redis?.consumeRateLimit === "function",
      },
      support: {
        email: SUPPORT_EMAIL,
        alertsEnabled: SUPPORT_ALERT_ENABLED,
        alertsConfigured: supportNotifier.isConfigured(),
      },
    });
  } catch (error) {
    console.error("Admin diagnostics error:", error?.message || error);
    return res.status(500).json({ ok: false, error: "Could not load system diagnostics." });
  }
});

app.patch("/admin/users/:uid/status", async (req, res) => {
  try {
    const token = String(req.headers["x-admin-token"] || "");

    if (!await isAdminTokenValid(token)) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    if (typeof req.body?.disabled !== "boolean") {
      return res.status(400).json({ ok: false, error: "The disabled setting must be true or false." });
    }

    const user = await updateFirebaseUserStatus({
      uid: req.params.uid,
      disabled: req.body.disabled,
    });

    console.info("Administrator updated Firebase account status", {
      requestId: req.requestId,
      uid: user.uid,
      disabled: user.disabled,
    });

    return res.json({ ok: true, user });
  } catch (error) {
    const status = error instanceof FirebaseIdentityError ? error.status : 500;
    console.error("Admin user-status update error:", error?.message || error);
    return res.status(status).json({
      ok: false,
      error: status < 500 ? error.message : "Could not update the user account.",
    });
  }
});

// ✅ Reload sector keyword index + catalogs without restarting server
app.post("/admin/reload-sectors", async (req, res) => {
  try {
    const token = String(req.headers["x-admin-token"] || "");
    const valid = await isAdminTokenValid(token);
    if (!valid) return res.status(401).json({ ok: false, error: "Unauthorized" });

    SECTOR_KEYWORDS_INDEX = buildSectorKeywordsIndex();
    GLOBAL_CATALOG_BY_SECTOR.clear();
    primeGlobalCatalog();

    return res.json({
      ok: true,
      sectors: listJsonSectorsFromDataDir(),
      keywordIndexSize: SECTOR_KEYWORDS_INDEX.size,
      catalogSize: GLOBAL_CATALOG_BY_SECTOR.size,
    });
  } catch {
    return res.status(500).json({ ok: false, error: "Reload failed" });
  }
});

/* ======================================================
   FLUTTERWAVE WEBHOOK
====================================================== */
app.post("/flw-webhook", async (req, res) => {
  try {
    const headerHash = String(req.headers["verif-hash"] || "").trim();

    // Never accept payment notifications without a verified webhook secret.
    if (!FLW_WEBHOOK_HASH) {
      await redisIncr(METRICS.webhookRejected);
      console.error("Flutterwave webhook rejected because FLW_WEBHOOK_HASH is not configured", {
        requestId: req.requestId,
      });
      return res.status(503).json({
        ok: false,
        code: "webhook_secret_not_configured",
        error: "Payment webhook verification is not configured.",
      });
    }

    if (!safeSecretEqual(headerHash, FLW_WEBHOOK_HASH)) {
      await redisIncr(METRICS.webhookRejected);
      return res.status(401).end();
    }

    const payload = req.rawBody ? JSON.parse(req.rawBody) : req.body;

    if (payload?.event === "charge.completed") {
      const d = payload?.data || {};
      const status = String(d?.status || "").toLowerCase();
      const tx_ref = String(d?.tx_ref || "").trim();
      const tx_id = d?.id != null ? String(d.id).trim() : "";

      if (tx_ref && tx_id) await storeTxId(tx_ref, tx_id);

      if (isSuccessStatus(status)) {
        const amount = Number(d?.charged_amount || d?.amount || 0);
        const currency = String(d?.currency || "").toUpperCase();

        if (tx_ref?.startsWith("pd_") && currency === "NGN" && amount >= PETITION_PRICE_NGN) {
          const alreadyPaid = await isTxPaid(tx_ref);
          await markTxPaid(tx_ref);

          if (!alreadyPaid) {
            await redisIncr(METRICS.paymentSuccess);
            await redisSAdd(METRICS.uniquePaySuccess, tx_ref);
            console.log(`✅ Payment confirmed via webhook: ${tx_ref}`);
          }
        }
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err);
    res.sendStatus(400);
  }
});

/* ======================================================
   BASIC ENDPOINTS
====================================================== */
app.post("/track/visit", async (req, res) => {
  await redisIncr(METRICS.visits);

  const visitor =
    await recordAnonymousVisit(
      req.body?.visitorId
    );

  res.json({
    ok: true,
    tracked: visitor.tracked,
    isNew: visitor.isNew,
  });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "petitiondesk-backend",
    time: new Date().toISOString(),
    freeAccessEnabled:
      FREE_ACCESS_ENABLED,

    freePetitionLimit:
      FREE_PETITION_LIMIT,

    petitionPriceNgn:
      PETITION_PRICE_NGN,

    aiProvider:
      "gemini",

    aiModel:
      GEMINI_MODEL,

    aiConfigured:
      Boolean(GEMINI_API_KEY),

    firestoreEnabled:
      FIRESTORE_ENABLED,

    paymentConfigured:
      Boolean(FLW_SECRET_KEY),

    webhookConfigured:
      Boolean(FLW_WEBHOOK_HASH),

    revision:
      String(
        process.env.K_REVISION ||
        "local"
      ),

    generationConfigured:
      Boolean(GEMINI_API_KEY),

    generationModel:
      GEMINI_MODEL,

    institutionSectorPriorityVersion:
      INSTITUTION_SECTOR_PRIORITY_VERSION,

    jurisdictionEngineVersion:
      getJurisdictionCapabilities(
        []
      ).engineVersion,
  });
});

app.get(
  "/access/status",
  async (req, res) => {
    if (!FREE_ACCESS_ENABLED) {
      return res.json({
        ok: true,
        enabled: false,
        freeLimit:
          FREE_PETITION_LIMIT,
        freeUsed: 0,
        freeRemaining: 0,
        requiresPayment: true,
      });
    }

    let user;

    try {
      user =
        await requireVerifiedFirebaseUser(
          req
        );
    } catch (error) {
      return sendFirebaseIdentityError(
        res,
        error
      );
    }

    try {
      const status =
        await freeEntitlementStore
          .getStatus({
            uid:
              user.uid,
          });

      return res.json({
        ok: true,
        ...status,
      });
    } catch (error) {
      console.error(
        "Access status error:",
        error
      );

      return res
        .status(500)
        .json({
          ok: false,
          error:
            "Could not read free-petition access.",
        });
    }
  }
);

app.get(
  "/routing/capabilities",
  (req, res) => {
    const capabilities =
      getJurisdictionCapabilities(
        listJsonSectorsFromDataDir()
      );

    res.json({
      ok: true,
      ...capabilities,
    });
  }
);

app.post(
  "/routing/resolve",
  async (req, res) => {
    try {
      const {
        sector = "",
        complaint = "",
        petitioner = {},
        disputeLocation = "",
        issueLocation = "",
        institutionName = "",
        institutionLevel = "",
        escalationStage = "",
        priorComplaintReference = "",
        priorComplaintDate = "",
        bankingComplaintType = "",
        providerResponseStatus = "",
        country = "Nigeria",
      } = req.body || {};

      const resolvedIssueLocation =
        String(
          issueLocation ||
          disputeLocation ||
          ""
        ).trim();

      const result =
        await resolveComplaintRouting({
          sector,
          complaint,

          issueLocation:
            resolvedIssueLocation,

          petitionerAddress:
            petitioner.address,

          institutionName,
          institutionLevel,
          escalationStage,
          priorComplaintReference,
          priorComplaintDate,
          bankingComplaintType,
          providerResponseStatus,
          country,
        });

      return res.json({
        ok: true,

        revision:
          String(
            process.env.K_REVISION ||
            "local"
          ),

        sector:
          result.sector,

        sectorDetection:
          result.sectorDetection,

        routingDecision:
          result.jurisdictionRouting,
      });
    } catch (error) {
      console.error(
        "Routing diagnostic error:",
        error
      );

      return res
        .status(500)
        .json({
          ok: false,

          error:
            "Routing diagnostic failed",
        });
    }
  }
);

/* ======================================================
   GENERATE PETITION
====================================================== */
app.post("/generate-petition", async (req, res) => {
  const v = validateGenerateBody(req.body || {});
  if (!v.ok) return res.status(400).json(v);

  const adminToken = String(
    req.headers["x-admin-token"] || ""
  ).trim();

  const adminOk =
    await isAdminTokenValid(adminToken);

  let verifiedUser = null;
  let accessStatus = null;

  if (FREE_ACCESS_ENABLED && !adminOk) {
    try {
      verifiedUser =
        await requireVerifiedFirebaseUser(
          req
        );

      accessStatus =
        await freeEntitlementStore
          .getStatus({
            uid:
              verifiedUser.uid,
          });
    } catch (error) {
      return sendFirebaseIdentityError(
        res,
        error
      );
    }
  }

  if (!adminOk) {
    const generationLimit = await consumeGenerationLimit(
      requestFingerprint(req, verifiedUser?.uid || req.body?.petitioner?.email || "")
    );

    if (!generationLimit.ok) {
      await redisIncr(METRICS.generationRateLimited);
      res.setHeader("Retry-After", String(generationLimit.retryAfterSeconds));

      return res.status(429).json({
        ok: false,
        code: "generation_rate_limited",
        error: "Too many petition requests. Please wait a moment before trying again.",
        retryAfterSeconds: generationLimit.retryAfterSeconds,
        requestId: req.requestId,
      });
    }
  }

  const {
    complaint = "",
    petitioner = {},
    disputeLocation = "",
    issueLocation = "",
    institutionName = "",
    institutionLevel = "",
    escalationStage = "",
    priorComplaintReference = "",
    priorComplaintDate = "",
    bankingComplaintType = "",
    providerResponseStatus = "",
    country = "Nigeria",
  } = req.body || {};

  /*
   * disputeLocation is retained for
   * backwards compatibility with the
   * current frontend.
   */
  const resolvedIssueLocation =
    String(
      issueLocation ||
      disputeLocation ||
      ""
    ).trim();

  const complaintStageCheck =
    evaluateComplaintStageConsistency({
      complaint,
      escalationStage,
      priorComplaintReference,
    });

  if (
    complaintStageCheck.ok !==
    true
  ) {
    const complainedAgainst =
      String(
        institutionName ||
        "the organisation complained against"
      ).trim();

    return res
      .status(400)
      .json({
        ok: false,

        error:
          complaintStageCheck.message,

        code:
          complaintStageCheck.code,

        routingDecision: {
          matched: true,

          blockGeneration:
            true,

          sector:
            "input_validation",

          caseType:
            "complaint_process",

          jurisdiction:
            "user_input",

          routeKey:
            "complaint_stage_conflict",

          primaryInstitution:
            complainedAgainst,

          ccInstitutions:
            [],

          deliveryMethod:
            "correct_form_information",

          emailRoutingExpected:
            false,

          documentPurpose:
            "Confirm whether this is a first complaint or an unresolved escalation",

          userMessage:
            complaintStageCheck.message,

          routingNote:
            complaintStageCheck.guidance,
        },
      });
  }

  await redisIncr(
    METRICS.generated
  );

  const {
    sector,
    sectorDetection,
    jurisdictionRouting,
    heuristic,
  } = await resolveComplaintRouting({
    complaint,

    issueLocation:
      resolvedIssueLocation,

    petitionerAddress:
      petitioner.address,

    institutionName,
    institutionLevel,
    escalationStage,
    priorComplaintReference,
    priorComplaintDate,
    bankingComplaintType,
    providerResponseStatus,
    country,
  });

  /*
   * Some matters must not be converted into
   * an ordinary petition. Examples include an
   * active emergency or an attempt to replace
   * a court appeal with a disciplinary petition.
   */
  if (
    jurisdictionRouting.matched &&
    jurisdictionRouting.blockGeneration ===
      true
  ) {
    return res.status(422).json({
      ok: false,
      error:
        jurisdictionRouting.userMessage ||
        "This matter requires a different legal or emergency process.",
      routingDecision:
        jurisdictionRouting,
    });
  }

  if (DEBUG_SECTOR) {
    console.log("🧠 SECTOR DEBUG:", {
      heuristic,
      final: sector,
      ai_enabled: AI_SECTOR_CLASSIFY,
      jsonSectors: listJsonSectorsFromDataDir().length,
    });
  }

  const caseType =
    jurisdictionRouting.matched
      ? jurisdictionRouting.caseType
      : inferCaseType(sector);

  const pName = (petitioner.fullName || "").trim() || "[Your Full Name]";
  const pAddress = (petitioner.address || "").trim() || "[Your Address]";
  const pEmail = (petitioner.email || "").trim() || "[Your Email]";
  const pPhone = (petitioner.phone || "").trim() || "[Phone Number]";
  const autoDate = new Date().toLocaleDateString("en-GB");

  if (!GEMINI_API_KEY) {
    return res.status(500).json({
      ok: false,
      error: "GOOGLE_API_KEY not configured",
    });
  }

  const generalToLine =
    "TO: Public Complaints Commission (PCC)";

  const generalCcInstitutions =
    inferGeneralOversightInstitutions(
      complaint
    );

  const generalCcLine =
    generalCcInstitutions.length
      ? `CC: ${generalCcInstitutions.join(", ")}`
      : "CC: None";

  const jurisdictionToLine =
    jurisdictionRouting.matched
      ? `TO: ${jurisdictionRouting.primaryInstitution}`
      : "";

  const jurisdictionCcLine =
    jurisdictionRouting.matched &&
    Array.isArray(
      jurisdictionRouting.ccInstitutions
    ) &&
    jurisdictionRouting.ccInstitutions.length
      ? `CC: ${jurisdictionRouting.ccInstitutions.join(", ")}`
      : "CC: None";

  const deterministicRouting =
    sector === "general" ||
    jurisdictionRouting.matched;

  const deterministicToLine =
    jurisdictionRouting.matched
      ? jurisdictionToLine
      : generalToLine;

  const deterministicCcLine =
    jurisdictionRouting.matched
      ? jurisdictionCcLine
      : generalCcLine;

  const documentPurpose =
    jurisdictionRouting.matched
      ? jurisdictionRouting.documentPurpose
      : "Professional petition requesting investigation and appropriate administrative action";

  const structuredComplaintPrompt =
    buildStructuredComplaintPrompt({
      complaint,

      institutionName,

      issueLocation:
        resolvedIssueLocation,

      institutionLevel,

      escalationStage,

      priorComplaintReference,

      priorComplaintDate,

      bankingComplaintType,

      providerResponseStatus,

      country,
    });

  try {
    let petitionText =
      await generateGeminiText({
        apiKey: GEMINI_API_KEY,
        model: GEMINI_MODEL,
        fallbackModels: GEMINI_FALLBACK_MODELS,
        timeoutMs: GEMINI_TIMEOUT_MS,
        totalTimeoutMs: GEMINI_TOTAL_TIMEOUT_MS,
        maxRetries: GEMINI_MAX_RETRIES,
        onAttempt: recordAiAttempt,

        systemInstruction: `You are a top-tier Nigerian legal draftsman writing a SAN-grade petition/complaint.

MANDATORY STRUCTURE (use exactly this format, no deviations):

Date: ${autoDate}

PETITIONER DETAILS:
Name: ${pName}
Address: ${pAddress}
Email: ${pEmail}
Phone: ${pPhone}

${deterministicRouting ? deterministicToLine : "TO: [Full official name of primary institution ONLY — DO NOT add emails or phone numbers]"}
${deterministicRouting ? deterministicCcLine : "CC: [List relevant oversight/regulatory bodies by name ONLY — DO NOT add emails or phone numbers]"}

SUBJECT: [Clear, specific subject line]

Dear Sir/Madam,

INTRODUCTION:
- ...

FACTS / BACKGROUND:
1. ...
2. ...

ISSUES FOR DETERMINATION:
1. ...
2. ...

LEGAL FRAMEWORK & GROUNDS:
- ...

DEMANDS / RELIEFS SOUGHT:
1. ...
2. ...
3. ...

NOTICE & ESCALATION:
- State that failure to act within a reasonable time will compel escalation to lawful oversight bodies, regulators, and other remedies available under Nigerian law.

LIST OF ATTACHMENTS (if any):
- Annexure A: ...
- Annexure B: ...

Yours faithfully,
${pName}
${pPhone}
${pEmail}

CRITICAL RULES:
- Document purpose: ${documentPurpose}
- Sector: ${sector} | Case Type: ${caseType}
- NEVER include any email addresses, phone numbers, or invented contacts for institutions.
- For landlord-tenant disputes, do not state that a rent increase is unlawful merely because the percentage is high.
- Do not describe the matter as constructive eviction unless the supplied facts independently support that allegation.
- Do not invent a tenancy statute, court decision, notice period, rent-control rule, landlord name, property-manager name or legal entitlement.
- Present disputed matters as the petitioner's allegations and request mediation or lawful resolution.
- DO NOT invent institution addresses. The system will insert verified addresses automatically from JSON if present.
- Keep it professional, firm, evidence-led, and hard to ignore.
- Do not state a fixed regulatory fee, tariff, monetary cap, deadline or statutory rate unless that exact information is supplied in verified legal context.
- For banking complaints, do not invent current CBN charge amounts. Ask the CBN to determine whether the disputed charge complied with the applicable rule.
- Regulatory penalties are discretionary. Request appropriate regulatory action; never describe a sanction as mandatory.
- Do not state that a bank owes a fiduciary duty unless an identified and applicable authority clearly establishes it.
- Do not invent facts, dates, evidence, laws, court decisions, institutions, addresses, or allegations.
- Clearly distinguish the petitioner's allegations from established facts.
- Under 950 words.`,

        prompt:
          `Draft the petition using only the structured facts below. Do not omit a supplied institution, issue location, complaint stage or previous complaint reference.\n\n${structuredComplaintPrompt}`,

        maxOutputTokens: 4096,
      });

    petitionText =
      sanitizeLegalDraft(
        petitionText,
        sector
      );

    if (deterministicRouting) {
      petitionText =
        enforceRoutingHeaders(
          petitionText,
          deterministicToLine,
          deterministicCcLine
        );
    }

    const subject =
      extractSubjectFromPetition(
        petitionText
      );

    const sectorJson = loadSectorJson(sector);
    const sectorCatalog = buildInstitutionCatalog(sectorJson);

    const toNames = extractSectionInstitutionNames(petitionText, "TO");
    const ccNames = extractSectionInstitutionNames(petitionText, "CC");

    const catalogToItems = safeUniq(
      toNames
        .map(
          name =>
            matchInstitutionNameToCatalog(
              name,
              sectorCatalog
            ) ||
            matchInstitutionAcrossAllSectors(
              name,
              sector
            )
        )
        .filter(Boolean)
    );

    const catalogCcItems = safeUniq(
      ccNames
        .map(
          name =>
            matchInstitutionNameToCatalog(
              name,
              sectorCatalog
            ) ||
            matchInstitutionAcrossAllSectors(
              name,
              sector
            )
        )
        .filter(Boolean)
    );

    const adminCC =
      jurisdictionRouting.matched
        ? []
        : buildAdminOversightCC({
            sector,
            caseType,
          });

    let legacyToEmails =
      safeUniq(
        catalogToItems
          .flatMap(
            item =>
              item.emails
          )
      ).filter(
        isEmail
      );

    let legacyToInstitutions =
      catalogToItems.map(
        item =>
          item.name
      );

    if (
      sector === "general" &&
      !jurisdictionRouting.matched
    ) {
      const pccItem =
        matchInstitutionNameToCatalog(
          "Public Complaints Commission (PCC)",
          sectorCatalog
        ) ||
        matchInstitutionAcrossAllSectors(
          "Public Complaints Commission (PCC)",
          sector
        );

      const verifiedPccEmails =
        Array.isArray(
          pccItem?.emails
        )
          ? pccItem.emails
          : [];

      legacyToEmails =
        safeUniq([
          ...verifiedPccEmails,
          OVERSIGHT_EMAILS.PCC,
          ...PCC_FALLBACK_EMAILS,
        ]).filter(
          isEmail
        );

      legacyToInstitutions = [
        pccItem?.name ||
          "Public Complaints Commission (PCC)",
      ];
    }

    const deliveryPlan =
      resolveDeliveryPlan({
        routingDecision:
          jurisdictionRouting.matched
            ? jurisdictionRouting
            : null,

        catalogToItems,

        catalogCcItems,

        legacyToEmails,

        legacyToInstitutions,

        legacyCcInstitutions:
          catalogCcItems.map(
            item =>
              item.name
          ),

        legacyAdminCc:
          adminCC,
      });

    const documentToItems =
      deliveryPlan.primaryItem
        ? [
            deliveryPlan
              .primaryItem,
          ]
        : catalogToItems;

    petitionText =
      injectInstitutionAddressesIntoPetition(
        petitionText,
        documentToItems,
        catalogCcItems
      );

    const finalToEmails =
      deliveryPlan.toEmails;

    const finalCC =
      deliveryPlan.ccEmails;

    const finalToInstitutions =
      deliveryPlan
        .toInstitutions;

    const finalCcInstitutions =
      deliveryPlan
        .ccInstitutions;

    const emailRoutingAvailable =
      deliveryPlan
        .emailRoutingAvailable;

    const unlockMode =
      adminOk
        ? "admin"
        : FREE_ACCESS_ENABLED &&
          accessStatus
            ?.freeRemaining > 0
        ? "free"
        : "paid";

    const tx_ref = `pd_${Date.now()}_${randomToken(18)}`;

    await storePetition(tx_ref, {
      petition: petitionText,
      sector,
      caseType,

      sectorDetection,

      subject,
      toInstitutions: finalToInstitutions,
      ccInstitutions:
        finalCcInstitutions,
      toEmails: finalToEmails,
      ccEmails: finalCC,
      emailRoutingAvailable,
      routingDecision:
        jurisdictionRouting.matched
          ? jurisdictionRouting
          : null,

      submissionRoute:
        deliveryPlan
          .submissionRoute,

      paymentInitializedAt: null,
      flw_tx_id: "",
      return_to: "",

      ownerUid:
        verifiedUser?.uid ||
        "",

      unlockMode,

      accessAtGeneration:
        accessStatus,
    });

    await redisIncr(METRICS.previewed);

    const preview = petitionText.length > 600 ? petitionText.substring(0, 600) + "..." : petitionText;

    return res.json({
      ok: true,

      needsPayment:
        unlockMode ===
        "paid",

      unlockMode,

      amount:
        PETITION_PRICE_NGN,

      currency:
        "NGN",

      access:
        accessStatus,

      admin:
        adminOk,

      tx_ref,
      preview,
      sector,
      caseType,

      sectorDetection,

      emailRoutingAvailable,

      routingDecision:
        jurisdictionRouting.matched
          ? jurisdictionRouting
          : null,

      submissionRoute:
        deliveryPlan
          .submissionRoute,
    });
  } catch (err) {
    await redisIncr(METRICS.generationFailed);

    const providerStatus = Number(err?.status || 0);
    const temporarilyUnavailable =
      err?.retryable === true ||
      [408, 429, 500, 502, 503, 504].includes(providerStatus);
    const responseStatus = providerStatus === 429
      ? 429
      : temporarilyUnavailable
        ? 503
        : 500;

    console.error("Petition generation failed", {
      requestId: req.requestId,
      code: err?.code || "petition_generation_failed",
      providerStatus,
      model: err?.model || GEMINI_MODEL,
      attempts: Number(err?.attempts || 0),
      message: err?.message || "Unknown generation error",
    });

    if (temporarilyUnavailable) {
      res.setHeader("Retry-After", "15");
    }

    return res.status(responseStatus).json({
      ok: false,
      code: err?.code || "petition_generation_failed",
      error: temporarilyUnavailable
        ? "The petition-writing service is temporarily busy. Please try again shortly."
        : "We could not generate your petition. Please try again or contact support.",
      retryable: temporarilyUnavailable,
      requestId: req.requestId,
    });
  }
});

/* ======================================================
   FREE PETITION UNLOCK
   - Requires a verified Firebase email identity.
   - Entitlement count and completed payload are stored
     atomically by FreeEntitlementStore.
   - Repeated requests recover the original full payload.
====================================================== */
app.post(
  "/free-unlock",
  async (req, res) => {
    if (!FREE_ACCESS_ENABLED) {
      return res
        .status(503)
        .json({
          ok: false,

          error:
            "Free petition access is not enabled yet.",
        });
    }

    const validation =
      validateTxRef(
        req.body ||
        {}
      );

    if (!validation.ok) {
      return res
        .status(400)
        .json(
          validation
        );
    }

    let user;

    try {
      user =
        await requireVerifiedFirebaseUser(
          req
        );
    } catch (error) {
      return sendFirebaseIdentityError(
        res,
        error
      );
    }

    const txRef =
      validation.tx_ref;

    try {
      const claimedUnlock =
        await freeEntitlementStore
          .getClaimedUnlock({
            uid:
              user.uid,

            txRef,
          });

      if (claimedUnlock) {
        return res.json(
          publicUnlockedPayload(
            claimedUnlock
          )
        );
      }

      const cachedUnlock =
        await getUnlocked(
          txRef
        );

      if (cachedUnlock) {
        if (
          !cachedUnlock
            ._ownerUid ||
          cachedUnlock
            ._ownerUid !==
            user.uid
        ) {
          return res
            .status(403)
            .json({
              ok: false,

              error:
                "This petition belongs to another verified account.",
            });
        }

        return res.json(
          publicUnlockedPayload(
            cachedUnlock
          )
        );
      }

      const stored =
        await getPetition(
          txRef
        );

      if (!stored) {
        return res
          .status(404)
          .json({
            ok: false,

            error:
              "Petition expired",
          });
      }

      if (
        !stored.ownerUid ||
        stored.ownerUid !==
          user.uid
      ) {
        return res
          .status(403)
          .json({
            ok: false,

            error:
              "This petition belongs to another verified account.",
          });
      }

      const mailto =
        buildMailto({
          to:
            stored.toEmails,

          cc:
            stored.ccEmails,

          subject:
            stored.subject,

          body:
            stored.petition,
        });

      const basePayload = {
        ok: true,
        unlocked: true,

        unlockMethod:
          "free",

        needsPayment:
          false,

        petition:
          stored.petition,

        sector:
          stored.sector,

        toInstitutions:
          stored.toInstitutions,

        ccInstitutions:
          stored.ccInstitutions,

        to:
          stored.toEmails,

        cc:
          stored.ccEmails,

        mailto,

        emailRoutingAvailable:
          !!stored
            .emailRoutingAvailable,

        routingDecision:
          stored.routingDecision ||
          null,

        submissionRoute:
          stored.submissionRoute ||
          null,
      };

      const claim =
        await freeEntitlementStore
          .claimFreeUnlock({
            uid:
              user.uid,

            txRef,

            sector:
              stored.sector,

            payload:
              basePayload,
          });

      if (!claim.granted) {
        return res
          .status(402)
          .json({
            ok: false,

            error:
              `Your two free petitions have been used. Pay ₦${PETITION_PRICE_NGN.toLocaleString("en-NG")} to unlock this petition.`,

            needsPayment:
              true,

            unlockMode:
              "paid",

            access:
              claim.status,
          });
      }

      if (!claim.payload) {
        throw new Error(
          "Completed free-unlock payload is missing"
        );
      }

      /*
       * Secondary cache only. The complete
       * payload is already durable inside
       * the atomic entitlement claim.
       */
      await storeUnlocked(
        txRef,
        claim.payload
      );

      await deletePetition(
        txRef
      );

      if (
        !claim
          .alreadyClaimed
      ) {
        await redisIncr(
          METRICS
            .unlockedFree
        );
      }

      return res.json(
        publicUnlockedPayload(
          claim.payload
        )
      );
    } catch (error) {
      console.error(
        "Free unlock error:",
        error
      );

      return res
        .status(500)
        .json({
          ok: false,

          error:
            "Free petition unlock failed.",
        });
    }
  }
);

/* ======================================================
   PAY INITIALIZE (Flutterwave)
   ✅ FIXED: return real Flutterwave error (not "Payment failed")
====================================================== */
app.post("/pay/initialize", async (req, res) => {
  try {
    const tx_ref =
      String(
        req.body
          ?.tx_ref ||
        ""
      ).trim();

    if (!tx_ref) {
      return res
        .status(400)
        .json({
          ok: false,
          error:
            "Missing tx_ref",
        });
    }

    if (!FLW_SECRET_KEY) {
      return res
        .status(500)
        .json({
          ok: false,
          error:
            "FLW_SECRET_KEY not configured",
        });
    }

    const stored =
      await getPetition(
        tx_ref
      );

    if (!stored) {
      return res
        .status(404)
        .json({
          ok: false,

          error:
            "Unknown tx_ref. Generate petition again.",
        });
    }

    let paymentOwner =
      null;

    if (
      stored.ownerUid ||
      FREE_ACCESS_ENABLED
    ) {
      try {
        paymentOwner =
          await requireMatchingPetitionOwner(
            req,
            stored.ownerUid
          );
      } catch (error) {
        return sendFirebaseIdentityError(
          res,
          error
        );
      }
    }

    stored.paymentInitializedAt =
      Date.now();

    const return_to =
      String(
        req.body
          ?.return_to ||
        ""
      ).trim();

    if (
      return_to &&
      return_to.startsWith(
        "/"
      )
    ) {
      stored.return_to =
        return_to;
    }

    await storePetition(
      tx_ref,
      stored
    );

    await redisIncr(
      METRICS
        .paymentInitiated
    );

    await redisSAdd(
      METRICS
        .uniquePayInit,
      tx_ref
    );

    const redirect_url =
      stored.return_to &&
      stored.return_to
        .startsWith(
          "/"
        )
        ? buildFrontendRedirectUrlWithReturn(
            tx_ref,
            stored.return_to
          )
        : buildFrontendRedirectUrl(
            tx_ref
          );

    const email =
      paymentOwner?.email ||
      String(
        req.body
          ?.email ||
        ""
      ).trim() ||
      "user@petitiondesk.com";

    const name =
      paymentOwner
        ?.displayName ||
      String(
        req.body
          ?.name ||
        ""
      ).trim() ||
      "User";

    const phone =
      String(
        req.body
          ?.phone ||
        ""
      ).trim();

    const payload = {
      tx_ref,

      amount:
        PETITION_PRICE_NGN,

      currency:
        "NGN",

      redirect_url,

      customer: {
        email,
        name,
        phonenumber:
          phone,
      },

      customizations: {
        title:
          "PetitionDesk",

        description:
          "Unlock full petition",
      },
    };

    const response =
      await flwFetch(
        "https://api.flutterwave.com/v3/payments",
        {
          method:
            "POST",

          body:
            JSON.stringify(
              payload
            ),
        }
      );

    const data =
      response.data ||
      {};

    if (
      !response.ok ||
      !data?.data?.link
    ) {
      const message =
        data?.message ||
        data?.data?.message ||
        data?.error ||
        "Flutterwave payment init failed";

      console.error(
        "FLW init failed:",
        {
          tx_ref,

          httpStatus:
            response.status,

          flwStatus:
            data?.status,

          message,
        }
      );

      return res
        .status(400)
        .json({
          ok: false,
          error:
            message,
        });
    }

    return res.json({
      ok: true,
      tx_ref,
      link:
        data.data.link,
    });
  } catch (error) {
    console.error(
      "pay/initialize error:",
      error
    );

    return res
      .status(500)
      .json({
        ok: false,
        error:
          "Payment error",
      });
  }
});

/* ======================================================
   UNLOCK PETITION (Admin override OR webhook OR verify)
   ✅ FIXED: if frontend sends transaction_id, store it immediately
   ✅ FIXED: if verify by tx_id fails, fallback to verify_by_reference
====================================================== */
app.post("/unlock-petition", async (req, res) => {
  try {
    const validation =
      validateTxRef(
        req.body ||
        {}
      );

    if (!validation.ok) {
      return res
        .status(400)
        .json(
          validation
        );
    }

    const tx_ref =
      validation.tx_ref;

    const adminToken =
      String(
        req.headers[
          "x-admin-token"
        ] ||
        ""
      ).trim();

    const adminOk =
      await isAdminTokenValid(
        adminToken
      );

    const already =
      await getUnlocked(
        tx_ref
      );

    if (already) {
      if (
        !adminOk &&
        (
          already._ownerUid ||
          FREE_ACCESS_ENABLED
        )
      ) {
        try {
          await requireMatchingPetitionOwner(
            req,
            already._ownerUid
          );
        } catch (error) {
          return sendFirebaseIdentityError(
            res,
            error
          );
        }
      }

      return res.json(
        publicUnlockedPayload(
          already
        )
      );
    }

    const stored =
      await getPetition(
        tx_ref
      );

    if (!stored) {
      return res
        .status(404)
        .json({
          ok: false,
          error:
            "Petition expired",
        });
    }

    if (
      !adminOk &&
      (
        stored.ownerUid ||
        FREE_ACCESS_ENABLED
      )
    ) {
      try {
        await requireMatchingPetitionOwner(
          req,
          stored.ownerUid
        );
      } catch (error) {
        return sendFirebaseIdentityError(
          res,
          error
        );
      }
    }

    /*
     * Persist the transaction ID only
     * after ownership has been verified.
     */
    if (
      validation
        .transaction_id
    ) {
      await storeTxId(
        tx_ref,
        validation
          .transaction_id
      );
    }

    const mailto =
      buildMailto({
        to:
          stored.toEmails,

        cc:
          stored.ccEmails,

        subject:
          stored.subject,

        body:
          stored.petition,
      });

    if (adminOk) {
      const payload = {
        ok: true,
        unlocked: true,
        admin: true,

        _ownerUid:
          stored.ownerUid ||
          "",

        petition:
          stored.petition,

        sector:
          stored.sector,

        toInstitutions:
          stored.toInstitutions,

        ccInstitutions:
          stored.ccInstitutions,

        to:
          stored.toEmails,

        cc:
          stored.ccEmails,

        mailto,

        emailRoutingAvailable:
          !!stored
            .emailRoutingAvailable,

        routingDecision:
          stored.routingDecision ||
          null,

        submissionRoute:
          stored.submissionRoute ||
          null,
      };

      await storeUnlocked(
        tx_ref,
        payload
      );

      return res.json(
        publicUnlockedPayload(
          payload
        )
      );
    }

    if (
      await isTxPaid(
        tx_ref
      )
    ) {
      const payload = {
        ok: true,
        unlocked: true,

        _ownerUid:
          stored.ownerUid ||
          "",

        petition:
          stored.petition,

        sector:
          stored.sector,

        toInstitutions:
          stored.toInstitutions,

        ccInstitutions:
          stored.ccInstitutions,

        to:
          stored.toEmails,

        cc:
          stored.ccEmails,

        mailto,

        emailRoutingAvailable:
          !!stored
            .emailRoutingAvailable,

        routingDecision:
          stored.routingDecision ||
          null,

        submissionRoute:
          stored.submissionRoute ||
          null,
      };

      await storeUnlocked(
        tx_ref,
        payload
      );

      await deletePetition(
        tx_ref
      );

      await redisIncr(
        METRICS
          .unlockedPaid
      );

      return res.json(
        publicUnlockedPayload(
          payload
        )
      );
    }

    if (!FLW_SECRET_KEY) {
      return res
        .status(402)
        .json({
          ok: false,
          error:
            "Payment not verified",
        });
    }

    const initializedAt =
      Number(
        stored
          .paymentInitializedAt ||
        0
      );

    const recentlyInitialized =
      initializedAt &&
      Date.now() -
        initializedAt <
        VERIFY_PENDING_WINDOW_MS;

    const bodyTransactionId =
      String(
        validation
          .transaction_id ||
        ""
      ).trim();

    const storedTransactionId =
      await getTxId(
        tx_ref
      );

    const transactionId =
      bodyTransactionId ||
      storedTransactionId;

    let verifyResponse =
      null;

    if (transactionId) {
      try {
        verifyResponse =
          await flwFetch(
            `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(transactionId)}/verify`
          );
      } catch {
        verifyResponse =
          null;
      }
    }

    if (
      !verifyResponse ||
      !verifyResponse.ok
    ) {
      try {
        verifyResponse =
          await flwFetch(
            `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(tx_ref)}`
          );
      } catch {
        verifyResponse = {
          ok: false,
          status: 0,
          data: {},
        };
      }
    }

    if (!verifyResponse.ok) {
      if (
        recentlyInitialized
      ) {
        return res
          .status(202)
          .json({
            ok: false,
            pending: true,

            error:
              "Payment processing. Please wait a moment and try again.",
          });
      }

      const message =
        verifyResponse
          ?.data
          ?.message ||
        "Payment not verified";

      return res
        .status(402)
        .json({
          ok: false,
          error:
            message,
        });
    }

    const responseData =
      verifyResponse.data ||
      {};

    let transactionData =
      responseData?.data ||
      {};

    if (
      Array.isArray(
        transactionData
      )
    ) {
      transactionData =
        transactionData[0] ||
        {};
    }

    const paymentStatus =
      String(
        transactionData
          ?.status ||
        ""
      ).toLowerCase();

    const amount =
      Number(
        transactionData
          ?.charged_amount ||
        transactionData
          ?.amount ||
        0
      );

    const currency =
      String(
        transactionData
          ?.currency ||
        ""
      ).toUpperCase();

    const returnedTxRef =
      String(
        transactionData
          ?.tx_ref ||
        ""
      ).trim();

    const returnedTxId =
      transactionData?.id !=
      null
        ? String(
            transactionData.id
          ).trim()
        : "";

    if (returnedTxId) {
      await storeTxId(
        tx_ref,
        returnedTxId
      );
    }

    if (
      returnedTxRef &&
      returnedTxRef !==
        tx_ref
    ) {
      return res
        .status(402)
        .json({
          ok: false,
          error:
            "Payment not verified",
        });
    }

    if (
      isPendingStatus(
        paymentStatus
      )
    ) {
      if (
        recentlyInitialized
      ) {
        return res
          .status(202)
          .json({
            ok: false,
            pending: true,

            error:
              "Payment is still processing. Please try again shortly.",
          });
      }

      return res
        .status(402)
        .json({
          ok: false,
          error:
            "Payment not verified",
        });
    }

    const verified =
      isSuccessStatus(
        paymentStatus
      ) &&
      currency ===
        "NGN" &&
      amount >=
        PETITION_PRICE_NGN;

    if (!verified) {
      const message =
        responseData
          ?.message ||
        "Payment not verified";

      return res
        .status(402)
        .json({
          ok: false,
          error:
            message,
        });
    }

    await markTxPaid(
      tx_ref
    );

    await redisIncr(
      METRICS
        .paymentSuccess
    );

    await redisSAdd(
      METRICS
        .uniquePaySuccess,
      tx_ref
    );

    const payload = {
      ok: true,
      unlocked: true,

      _ownerUid:
        stored.ownerUid ||
        "",

      petition:
        stored.petition,

      sector:
        stored.sector,

      toInstitutions:
        stored.toInstitutions,

      ccInstitutions:
        stored.ccInstitutions,

      to:
        stored.toEmails,

      cc:
        stored.ccEmails,

      mailto,

      emailRoutingAvailable:
        !!stored
          .emailRoutingAvailable,

      routingDecision:
        stored.routingDecision ||
        null,
    };

    await storeUnlocked(
      tx_ref,
      payload
    );

    await deletePetition(
      tx_ref
    );

    await redisIncr(
      METRICS
        .unlockedPaid
    );

    return res.json(
      publicUnlockedPayload(
        payload
      )
    );
  } catch (error) {
    console.error(
      "unlock error:",
      error
    );

    return res
      .status(500)
      .json({
        ok: false,
        error:
          "Unlock failed",
      });
  }
});

/* ======================================================
   PDF DOWNLOAD
====================================================== */
app.post("/download-pdf", (req, res) => {
  try {
    const text = String(req.body?.text || "").trim();
    if (!text) return res.status(400).send("Missing text");

    if (text.length > 100_000) {
      return res.status(413).send("Petition is too large");
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="petition.pdf"');

    const pdf = new PDFDocument({ margin: 50 });
    pdf.pipe(res);

    pdf.fontSize(18).text("PETITION", { align: "center" });
    pdf.moveDown();
    pdf.fontSize(12).text(text, { align: "justify" });
    pdf.moveDown(2);
    pdf.fontSize(10).text("Generated by PetitionDesk", { align: "center" });

    pdf.end();
  } catch (err) {
    console.error("PDF error:", err);
    res.status(500).send("PDF generation failed");
  }
});

/* ======================================================
   BOOT
====================================================== */
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 PetitionDesk backend running on port ${PORT}`);
  console.log(`📁 Data dir: ${DATA_DIR}`);
  console.log("Webhook path: /flw-webhook");

  if (
    FREE_ACCESS_ENABLED &&
    !FIRESTORE_ENABLED
  ) {
    console.log(
      "⚠️ FREE_ACCESS_ENABLED is true while Firestore is disabled. Free usage will not survive a server restart."
    );
  }

  if (
    supportNotifier
      .isConfigured()
  ) {
    console.log(
      "✅ Support email alerts enabled"
    );
  } else if (
    SUPPORT_ALERT_ENABLED
  ) {
    console.log(
      "⚠️ SUPPORT_ALERT_ENABLED is true but the email-provider configuration is incomplete."
    );
  }

  if (!FLW_WEBHOOK_HASH) {
    console.log(
      IS_PRODUCTION
        ? "❌ FLW_WEBHOOK_HASH is not set — production webhooks will be rejected until the secret is configured."
        : "⚠️ FLW_WEBHOOK_HASH is not set — configure it before deploying to production."
    );
  }
  if (!GEMINI_API_KEY) {
    console.log("⚠️ GOOGLE_API_KEY not set — petition generation will fail.");
  }
  if (!FLW_SECRET_KEY) {
    console.log("⚠️ FLW_SECRET_KEY not set — payments will fail.");
  } else if (!FLW_SECRET_KEY.startsWith("FLWSECK_")) {
    console.log("⚠️ FLW_SECRET_KEY looks unusual — confirm you pasted the correct Flutterwave Secret Key.");
  }
});

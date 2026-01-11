// server.mjs
import express from "express";
import cors from "cors";
import OpenAI from "openai";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import PDFDocument from "pdfkit";
import Redis from "ioredis";

dotenv.config();

const app = express();

/* ======================================================
   CORE CONFIG
====================================================== */
const OPENAI_KEY = String(process.env.OPENAI_API_KEY || "").trim();
const OPENAI_MODEL = String(process.env.OPENAI_MODEL || "gpt-4o").trim();

const REDIS_URL = String(process.env.REDIS_URL || "").trim();

const FLW_SECRET_KEY = String(process.env.FLW_SECRET_KEY || "").trim();
const FLW_WEBHOOK_HASH = String(process.env.FLW_WEBHOOK_HASH || "").trim();

const FRONTEND_BASE_URL = String(process.env.FRONTEND_BASE_URL || "https://petitiondesk.com").trim();
const PETITION_PRICE_NGN = Number(process.env.PETITION_PRICE_NGN || 1050);

const PETITION_TTL_SECONDS = Number(process.env.PETITION_TTL_SECONDS || 2 * 60 * 60);
const ADMIN_UNLOCK_KEY = String(process.env.ADMIN_UNLOCK_KEY || "").trim();
const ADMIN_SESSION_TTL_SECONDS = Number(process.env.ADMIN_SESSION_TTL_SECONDS || 2 * 60 * 60);

const FLW_TIMEOUT_MS = Number(process.env.FLW_TIMEOUT_MS || 20000);
const VERIFY_PENDING_WINDOW_MS = Number(process.env.VERIFY_PENDING_WINDOW_MS || 15 * 60 * 1000);

const AI_SECTOR_CLASSIFY = String(process.env.AI_SECTOR_CLASSIFY || "").toLowerCase() === "true";

/* ======================================================
   MIDDLEWARE
====================================================== */
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-admin-token"],
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
   OPENAI (GUARDED)
====================================================== */
const openai = OPENAI_KEY ? new OpenAI({ apiKey: OPENAI_KEY }) : null;

/* ======================================================
   PATHS
====================================================== */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "data");

/* ======================================================
   REDIS
====================================================== */
let redis = null;

if (REDIS_URL) {
  try {
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: true,
    });

    redis.on("error", (e) => console.error("Redis error:", e?.message || e));
    redis.on("connect", () => console.log("✅ Redis connected"));

    redis.connect().catch(() => {});
  } catch (e) {
    console.error("Redis init error:", e?.message || e);
    redis = null;
  }
} else {
  console.log("⚠️ REDIS_URL not set — Redis durability/metrics disabled");
}

/* ======================================================
   REDIS HELPERS
====================================================== */
async function redisIncr(key) {
  if (!redis) return;
  try {
    await redis.incr(key);
  } catch {}
}
async function redisSAdd(key, value) {
  if (!redis) return;
  try {
    await redis.sadd(key, value);
  } catch {}
}
async function redisGetInt(key) {
  if (!redis) return 0;
  try {
    const v = await redis.get(key);
    return Number(v || 0);
  } catch {
    return 0;
  }
}
async function redisSCard(key) {
  if (!redis) return 0;
  try {
    const v = await redis.scard(key);
    return Number(v || 0);
  } catch {
    return 0;
  }
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
  adminSessions: "pd:metrics:admin_sessions",
  uniquePayInit: "pd:set:payinit_txrefs",
  uniquePaySuccess: "pd:set:paysuccess_txrefs",
};

/* ======================================================
   OVERSIGHT EMAILS (ENV)
====================================================== */
const OVERSIGHT_EMAILS = {
  PCC: String(process.env.PCC_EMAIL || "").trim(),
  NHRC: String(process.env.NHRC_EMAIL || "").trim(),
  FCCPC: String(process.env.FCCPC_EMAIL || "").trim(),
  SERVICOM: String(process.env.SERVICOM_EMAIL || "").trim(),
  AGF: String(process.env.AGF_EMAIL || "").trim(),
};

// Hard fallback ONLY to prevent “no recipient email found” for general.
// Best practice is still: set PCC_EMAIL in Render.
const PCC_FALLBACK_EMAILS = ["complaint@pcc.gov.ng", "info@pcc.gov.ng"];

/* ======================================================
   IN-MEMORY STORAGE (FALLBACK)
====================================================== */
const petitionStore = new Map(); // tx_ref -> stored record
const USED_TX_REFS = new Set(); // paid flags (memory)
const USED_TX_SUCCESS = new Set(); // unlocked flags (memory)

function scheduleMemoryExpiry(tx_ref) {
  setTimeout(() => {
    petitionStore.delete(tx_ref);
  }, PETITION_TTL_SECONDS * 1000).unref?.();
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
  if (!tx_ref || tx_ref.length < 6) return { ok: false, error: "Missing tx_ref" };
  const transaction_id = body?.transaction_id != null ? String(body.transaction_id).trim() : "";
  return { ok: true, tx_ref, transaction_id };
}

/* ======================================================
   ADMIN SESSION
====================================================== */
function randomToken(len = 48) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

async function createAdminSession() {
  const token = `pdadm_${Date.now()}_${randomToken(24)}`;
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

    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

/* ======================================================
   UTILS
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
  const base = String(FRONTEND_BASE_URL || "").trim().replace(/\/+$/, "");
  return `${base}/?tx_ref=${encodeURIComponent(tx_ref)}`;
}
function buildFrontendRedirectUrlWithReturn(tx_ref, return_to) {
  const base = String(FRONTEND_BASE_URL || "").trim().replace(/\/+$/, "");
  const clean = String(return_to || "").trim();
  if (!clean || !clean.startsWith("/")) return buildFrontendRedirectUrl(tx_ref);
  const join = `${base}${clean}`;
  const sep = join.includes("?") ? "&" : "?";
  return `${join}${sep}tx_ref=${encodeURIComponent(tx_ref)}`;
}
function isPendingStatus(s) {
  const v = String(s || "").toLowerCase();
  return v === "pending" || v === "processing" || v === "queued";
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
  const index = new Map();
  const sectors = listJsonSectorsFromDataDir();

  for (const sec of sectors) {
    const sj = loadSectorJson(sec);
    const kw = Array.isArray(sj?.keywords) ? sj.keywords : Array.isArray(sj?.routing_keywords) ? sj.routing_keywords : [];
    const cleaned = safeUniq(kw.map((x) => String(x || "").toLowerCase().trim())).filter(Boolean);
    if (cleaned.length) index.set(sec, cleaned);
  }
  return index;
}
let SECTOR_KEYWORDS_INDEX = buildSectorKeywordsIndex();

function builtInKeywordMap() {
  return {
    power: ["electricity", "nepa", "aedc", "power", "disco", "tcn", "nerc", "meter", "estimated billing", "transformer"],
    aviation: ["flight", "airport", "airline", "ncaa", "faan", "aviation", "air peace", "airpeace"],
    banking: ["bank", "atm", "pos", "debit", "transfer", "chargeback", "unlawful debit", "cbn", "failed transfer"],
    telecoms: ["airtime", "data", "network", "sim", "telecom", "ncc", "mtn", "airtel", "glo", "9mobile"],
    education: ["school", "university", "waec", "jamb", "nuc", "education", "tetfund", "transcript"],
    health: ["hospital", "clinic", "doctor", "ncdc", "nhis", "medical", "health"],
    security: ["police", "army", "navy", "airforce", "nscdc", "unlawful arrest", "immigration", "dss", "kidnap", "detention"],
    judiciary: ["court", "judge", "justice", "supreme", "magistrate", "bail", "delayed judgement", "njc"],
    international_escalation: ["un", "ecowas", "au", "icc", "eu", "international", "united nations", "congress", "senate", "state department"],
    anti_corruption: ["corruption", "bribe", "kickback", "procurement", "money laundering", "embezzlement", "ghost worker", "efcc", "icpc", "bpp", "fraud"],
    diaspora_report: ["diaspora", "nidcom", "embassy", "consulate", "passport seized", "deportation", "stranded abroad", "human trafficking", "migration"],
  };
}

function detectSector(text) {
  const lower = String(text || "").toLowerCase();

  // 1) JSON keywords
  for (const [sector, words] of SECTOR_KEYWORDS_INDEX.entries()) {
    if (words.some((w) => w && lower.includes(w))) return sector;
  }

  // 2) built-in fallback
  const map = builtInKeywordMap();
  for (const [sec, words] of Object.entries(map)) {
    if (words.some((w) => w && lower.includes(w))) return sec;
  }

  // 3) fallback sector
  return "general";
}

async function detectSectorAI(text) {
  if (!openai) return "unknown";

  const allowed = listJsonSectorsFromDataDir();
  if (!allowed.length) return "unknown";

  try {
    const resp = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content:
            `You are a strict classifier. Choose exactly ONE sector from this list:\n` +
            allowed.map((s) => `- ${s}`).join("\n") +
            `\n\nReturn ONLY the sector key. If none fits, return "unknown".`,
        },
        { role: "user", content: String(text || "") },
      ],
      temperature: 0,
    });

    const out = String(resp.choices?.[0]?.message?.content || "").trim();
    return allowed.includes(out) ? out : "unknown";
  } catch {
    return "unknown";
  }
}

function inferCaseType(sector) {
  if (sector === "security" || sector === "judiciary") return "human_rights";
  if (["health", "telecoms", "aviation", "banking", "power", "education"].includes(sector)) return "service_delivery";
  if (sector === "international_escalation") return "international";
  if (sector === "anti_corruption") return "anti_corruption";
  if (sector === "diaspora_report") return "diaspora";
  return "other";
}

function buildAdminOversightCC({ sector, caseType }) {
  const cc = [];
  // Don't CC PCC if PCC is the default TO in general sector
  if (sector !== "international_escalation" && sector !== "general" && OVERSIGHT_EMAILS.PCC) cc.push(OVERSIGHT_EMAILS.PCC);

  if (caseType === "human_rights" && OVERSIGHT_EMAILS.NHRC) cc.push(OVERSIGHT_EMAILS.NHRC);
  if (caseType === "service_delivery") {
    if (OVERSIGHT_EMAILS.SERVICOM) cc.push(OVERSIGHT_EMAILS.SERVICOM);
    if (OVERSIGHT_EMAILS.FCCPC) cc.push(OVERSIGHT_EMAILS.FCCPC);
  }
  if (sector === "international_escalation" && OVERSIGHT_EMAILS.AGF) cc.push(OVERSIGHT_EMAILS.AGF);

  return safeUniq(cc).filter(isEmail);
}

/* ======================================================
   PETITION STORAGE (REDIS + MEMORY)
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

// Paid flag
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

// Persist unlocked response so refresh doesn’t look “failed”
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

// Store Flutterwave transaction id
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

/* ======================================================
   ADMIN ENDPOINTS
====================================================== */
app.post("/admin/session", async (req, res) => {
  try {
    const key = String(req.body?.key || "");
    if (!ADMIN_UNLOCK_KEY) return res.status(500).json({ ok: false, error: "ADMIN_UNLOCK_KEY not configured" });
    if (!key || key !== ADMIN_UNLOCK_KEY) return res.status(401).json({ ok: false, error: "Invalid admin key" });

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

    const stats = {
      visits: await redisGetInt(METRICS.visits),
      generated: await redisGetInt(METRICS.generated),
      previewed: await redisGetInt(METRICS.previewed),
      payment_initiated: await redisGetInt(METRICS.paymentInitiated),
      payment_success: await redisGetInt(METRICS.paymentSuccess),
      unlocked_paid: await redisGetInt(METRICS.unlockedPaid),
      unique_payinit_txrefs: await redisSCard(METRICS.uniquePayInit),
      unique_paysuccess_txrefs: await redisSCard(METRICS.uniquePaySuccess),
    };

    res.json({ ok: true, stats });
  } catch {
    res.status(500).json({ ok: false, error: "Stats error" });
  }
});

/* ======================================================
   FLUTTERWAVE WEBHOOK
====================================================== */
app.post("/flw-webhook", async (req, res) => {
  try {
    const headerHash = String(req.headers["verif-hash"] || "").trim();

    // Enforce if you set FLW_WEBHOOK_HASH
    if (FLW_WEBHOOK_HASH) {
      if (!headerHash || headerHash !== FLW_WEBHOOK_HASH) return res.status(401).end();
    } else {
      if (!headerHash) {
        console.warn("⚠️ Webhook received without verif-hash. Set FLW_WEBHOOK_HASH in Flutterwave + Render env.");
      }
    }

    const payload = req.rawBody ? JSON.parse(req.rawBody) : req.body;

    if (payload?.event === "charge.completed") {
      const d = payload?.data || {};
      const status = String(d?.status || "").toLowerCase();
      const tx_ref = String(d?.tx_ref || "").trim();
      const tx_id = d?.id != null ? String(d.id).trim() : "";

      if (tx_ref && tx_id) await storeTxId(tx_ref, tx_id);

      if (status === "successful") {
        const amount = Number(d?.charged_amount || d?.amount || 0);
        const currency = String(d?.currency || "").toUpperCase();

        if (tx_ref?.startsWith("pd_") && currency === "NGN" && amount >= PETITION_PRICE_NGN) {
          await markTxPaid(tx_ref);
          await redisIncr(METRICS.paymentSuccess);
          await redisSAdd(METRICS.uniquePaySuccess, tx_ref);
          console.log(`✅ Payment confirmed via webhook: ${tx_ref}`);
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
  res.json({ ok: true });
});

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "petitiondesk-backend", time: new Date().toISOString() });
});

/* ======================================================
   GENERATE PETITION
====================================================== */
app.post("/generate-petition", async (req, res) => {
  const v = validateGenerateBody(req.body || {});
  if (!v.ok) return res.status(400).json(v);

  const { complaint = "", petitioner = {} } = req.body || {};
  await redisIncr(METRICS.generated);

  let sector = detectSector(complaint);

  if ((sector === "general" || sector === "unknown") && AI_SECTOR_CLASSIFY) {
    const aiSector = await detectSectorAI(complaint);
    if (aiSector && aiSector !== "unknown") sector = aiSector;
  }
  if (sector === "unknown") sector = "general";

  const caseType = inferCaseType(sector);

  const pName = (petitioner.fullName || "").trim() || "[Your Full Name]";
  const pAddress = (petitioner.address || "").trim() || "[Your Address]";
  const pEmail = (petitioner.email || "").trim() || "[Your Email]";
  const pPhone = (petitioner.phone || "").trim() || "[Phone Number]";
  const autoDate = new Date().toLocaleDateString("en-GB");

  if (!openai) return res.status(500).json({ ok: false, error: "OPENAI_API_KEY not configured" });

  // For general sector, FORCE TO = PCC so we never depend on JSON match
  const generalToLine = `TO: Public Complaints Commission (PCC)`;
  const generalCcLine = `CC: National Human Rights Commission (NHRC), SERVICOM, Federal Competition and Consumer Protection Commission (FCCPC)`;

  try {
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content: `You are a top-tier Nigerian legal draftsman writing a SAN-grade petition/complaint.

MANDATORY STRUCTURE (use exactly this format, no deviations):

Date: ${autoDate}

PETITIONER DETAILS:
Name: ${pName}
Address: ${pAddress}
Email: ${pEmail}
Phone: ${pPhone}

${sector === "general" ? generalToLine : "TO: [Full official name of primary institution ONLY — DO NOT add emails or phone numbers]"}
${sector === "general" ? generalCcLine : "CC: [List relevant oversight/regulatory bodies by name ONLY — DO NOT add emails or phone numbers]"}

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
- Sector: ${sector} | Case Type: ${caseType}
- NEVER include any email addresses, phone numbers, or invented contacts for institutions.
- DO NOT invent institution addresses.
- Keep it professional, firm, evidence-led, and hard to ignore (SAN style).
- Under 950 words.`,
        },
        { role: "user", content: `Complaint: ${complaint}` },
      ],
      temperature: 0,
    });

    const petitionText = completion.choices?.[0]?.message?.content?.trim() || "Generation failed.";
    const subject = extractSubjectFromPetition(petitionText);

    // Emails: For general, ALWAYS route TO PCC
    let finalToEmails = [];
    if (sector === "general") {
      const pcc = (OVERSIGHT_EMAILS.PCC && isEmail(OVERSIGHT_EMAILS.PCC)) ? [OVERSIGHT_EMAILS.PCC] : PCC_FALLBACK_EMAILS;
      finalToEmails = pcc.filter(isEmail);
    }

    // CC rules (still useful)
    const finalCC = buildAdminOversightCC({ sector, caseType });

    if (!finalToEmails.length) {
      return res.status(400).json({
        ok: false,
        error: "No recipient email available. Set PCC_EMAIL in Render env.",
        sector,
      });
    }

    const tx_ref = `pd_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    await storePetition(tx_ref, {
      petition: petitionText,
      sector,
      caseType,
      subject,
      toInstitutions: sector === "general" ? ["Public Complaints Commission (PCC)"] : [],
      ccInstitutions: [],
      toEmails: finalToEmails,
      ccEmails: finalCC,
      paymentInitializedAt: null,
      flw_tx_id: "",
      return_to: "",
    });

    await redisIncr(METRICS.previewed);

    const preview = petitionText.length > 600 ? petitionText.substring(0, 600) + "..." : petitionText;

    return res.json({
      ok: true,
      needsPayment: true,
      amount: PETITION_PRICE_NGN,
      currency: "NGN",
      tx_ref,
      preview,
      sector,
      caseType,
    });
  } catch (err) {
    console.error("Generation error:", err);
    return res.status(500).json({ ok: false, error: "Failed to generate petition" });
  }
});

/* ======================================================
   PAY INITIALIZE (FLUTTERWAVE)
====================================================== */
app.post("/pay/initialize", async (req, res) => {
  try {
    const tx_ref = String(req.body?.tx_ref || "").trim();
    if (!tx_ref) return res.status(400).json({ ok: false, error: "Missing tx_ref" });

    if (!FLW_SECRET_KEY) return res.status(500).json({ ok: false, error: "FLW_SECRET_KEY not configured" });

    const stored = await getPet earlier if needed
    ition(tx_ref);
    if (!stored) return res.status(404).json({ ok: false, error: "Unknown tx_ref. Generate petition again." });

    stored.paymentInitializedAt = Date.now();

    const return_to = String(req.body?.return_to || "").trim();
    if (return_to && return_to.startsWith("/")) stored.return_to = return_to;

    await storePetition(tx_ref, stored);

    await redisIncr(METRICS.paymentInitiated);
    await redisSAdd(METRICS.uniquePayInit, tx_ref);

    const redirect_url =
      stored.return_to && stored.return_to.startsWith("/")
        ? buildFrontendRedirectUrlWithReturn(tx_ref, stored.return_to)
        : buildFrontendRedirectUrl(tx_ref);

    const email = String(req.body?.email || "").trim() || "user@petitiondesk.com";
    const name = String(req.body?.name || "").trim() || "User";
    const phone = String(req.body?.phone || "").trim() || "";

    const payload = {
      tx_ref,
      amount: PETITION_PRICE_NGN,
      currency: "NGN",
      redirect_url,
      customer: { email, name, phonenumber: phone },
      customizations: { title: "PetitionDesk", description: "Unlock full petition" },
    };

    const { ok, data } = await flwFetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (!ok || !data?.data?.link) {
      return res.status(400).json({ ok: false, error: "Payment failed" });
    }

    return res.json({ ok: true, tx_ref, link: data.data.link });
  } catch (err) {
    console.error("pay/initialize error:", err);
    return res.status(500).json({ ok: false, error: "Payment error" });
  }
});

/* ======================================================
   UNLOCK PETITION
====================================================== */
app.post("/unlock-petition", async (req, res) => {
  try {
    const v = validateTxRef(req.body || {});
    if (!v.ok) return res.status(400).json(v);

    const tx_ref = v.tx_ref;

    // If already unlocked, return the stored unlocked payload (prevents “looks fraudulent”)
    const already = await getUnlocked(tx_ref);
    if (already) return res.json(already);

    const stored = await getPetition(tx_ref);
    if (!stored) return res.status(404).json({ ok: false, error: "Petition expired" });

    const mailto = buildMailto({
      to: stored.toEmails,
      cc: stored.ccEmails,
      subject: stored.subject,
      body: stored.petition,
    });

    // Admin override
    const adminToken = String(req.headers["x-admin-token"] || "").trim();
    const adminOk = await isAdminTokenValid(adminToken);
    if (adminOk) {
      const payload = {
        ok: true,
        unlocked: true,
        admin: true,
        petition: stored.petition,
        sector: stored.sector,
        toInstitutions: stored.toInstitutions,
        ccInstitutions: stored.ccInstitutions,
        to: stored.toEmails,
        cc: stored.ccEmails,
        mailto,
      };
      await storeUnlocked(tx_ref, payload);
      return res.json(payload);
    }

    // Webhook-confirmed / paid flag
    if (await isTxPaid(tx_ref)) {
      const payload = {
        ok: true,
        unlocked: true,
        petition: stored.petition,
        sector: stored.sector,
        toInstitutions: stored.toInstitutions,
        ccInstitutions: stored.ccInstitutions,
        to: stored.toEmails,
        cc: stored.ccEmails,
        mailto,
      };
      await storeUnlocked(tx_ref, payload);
      await deletePetition(tx_ref);
      await redisIncr(METRICS.unlockedPaid);
      return res.json(payload);
    }

    if (!FLW_SECRET_KEY) return res.status(402).json({ ok: false, error: "Payment not verified" });

    const initAt = Number(stored.paymentInitializedAt || 0);
    const recentlyInitialized = initAt && Date.now() - initAt < VERIFY_PENDING_WINDOW_MS;

    const bodyTxId = String(v.transaction_id || "").trim();
    const storedTxId = await getTxId(tx_ref);
    const txIdToUse = bodyTxId || storedTxId;

    let verifyResponse;
    try {
      if (txIdToUse) {
        verifyResponse = await flwFetch(`https://api.flutterwave.com/v3/transactions/${encodeURIComponent(txIdToUse)}/verify`);
      } else {
        // Correct endpoint for reference verification
        verifyResponse = await flwFetch(
          `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(tx_ref)}`
        );
      }
    } catch {
      verifyResponse = { ok: false, status: 0, data: {} };
    }

    if (!verifyResponse.ok) {
      if (recentlyInitialized) {
        return res.status(202).json({ ok: false, pending: true, error: "Payment processing. Please wait and try again." });
      }
      return res.status(402).json({ ok: false, error: "Payment not verified" });
    }

    const data = verifyResponse.data || {};
    let d = data?.data || {};

    // Sometimes APIs return arrays; handle safely
    if (Array.isArray(d)) d = d[0] || {};

    const status = String(d?.status || "").toLowerCase();
    const amount = Number(d?.charged_amount || d?.amount || 0);
    const currency = String(d?.currency || "").toUpperCase();
    const returnedTxRef = String(d?.tx_ref || "").trim();
    const returnedTxId = d?.id != null ? String(d.id).trim() : "";

    if (returnedTxId) await storeTxId(tx_ref, returnedTxId);

    if (returnedTxRef && returnedTxRef !== tx_ref) {
      return res.status(402).json({ ok: false, error: "Payment not verified" });
    }

    if (isPendingStatus(status)) {
      if (recentlyInitialized) {
        return res.status(202).json({ ok: false, pending: true, error: "Payment still processing. Try again shortly." });
      }
      return res.status(402).json({ ok: false, error: "Payment not verified" });
    }

    const verified = status === "successful" && currency === "NGN" && amount >= PETITION_PRICE_NGN;
    if (!verified) return res.status(402).json({ ok: false, error: "Payment not verified" });

    await markTxPaid(tx_ref);

    const payload = {
      ok: true,
      unlocked: true,
      petition: stored.petition,
      sector: stored.sector,
      toInstitutions: stored.toInstitutions,
      ccInstitutions: stored.ccInstitutions,
      to: stored.toEmails,
      cc: stored.ccEmails,
      mailto,
    };

    await storeUnlocked(tx_ref, payload);
    await deletePetition(tx_ref);
    await redisIncr(METRICS.unlockedPaid);

    return res.json(payload);
  } catch (err) {
    console.error("unlock error:", err);
    return res.status(500).json({ ok: false, error: "Unlock failed" });
  }
});

/* ======================================================
   PDF DOWNLOAD
====================================================== */
app.get("/download-pdf", (req, res) => {
  try {
    const text = decodeURIComponent(String(req.query.text || ""));
    if (!text) return res.status(400).send("Missing text");

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
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 PetitionDesk backend running on port ${PORT}`);
  console.log(`📁 Data dir: ${DATA_DIR}`);
  console.log(`Webhook URL: ${process.env.RENDER_EXTERNAL_URL || `https://your-app.onrender.com`}/flw-webhook`);

  if (!FLW_WEBHOOK_HASH) {
    console.log("⚠️ FLW_WEBHOOK_HASH not set — set Secret Hash in Flutterwave + set env var in Render (recommended).");
  }
  if (!OPENAI_KEY) {
    console.log("⚠️ OPENAI_API_KEY not set — petition generation will fail.");
  }
});

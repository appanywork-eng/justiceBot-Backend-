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

/**
 * =========================
 * ✅ Basic config + env
 * =========================
 */
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || "https://petitiondesk.com";
const PORT = process.env.PORT || 3000;

const PETITION_PRICE_NGN = Number(process.env.PETITION_PRICE_NGN || 1050);

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o";

const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY || "";
const FLW_WEBHOOK_HASH = process.env.FLW_WEBHOOK_HASH || ""; // strongly recommended

const ADMIN_UNLOCK_KEY = process.env.ADMIN_UNLOCK_KEY || "";
const ADMIN_SESSION_TTL_SECONDS = 30 * 60; // 30 mins

// TTLs (tune as you wish)
const PETITION_TTL_SECONDS = Number(process.env.PETITION_TTL_SECONDS || 24 * 60 * 60); // 24 hours
const PAID_TTL_SECONDS = Number(process.env.PAID_TTL_SECONDS || 48 * 60 * 60); // 48 hours
const UNLOCK_TTL_SECONDS = Number(process.env.UNLOCK_TTL_SECONDS || 48 * 60 * 60); // 48 hours

// Rate limiting (per IP per hour)
const RL_GEN_PER_HOUR = Number(process.env.RL_GEN_PER_HOUR || 20);
const RL_PAYINIT_PER_HOUR = Number(process.env.RL_PAYINIT_PER_HOUR || 40);
const RL_UNLOCK_PER_HOUR = Number(process.env.RL_UNLOCK_PER_HOUR || 60);

// Optional: block free email domains in recipients
const BLOCK_FREE_EMAIL_DOMAINS = String(process.env.BLOCK_FREE_EMAIL_DOMAINS || "false").toLowerCase() === "true";
const FREE_EMAIL_DOMAINS = (process.env.FREE_EMAIL_DOMAINS ||
  "gmail.com,yahoo.com,hotmail.com,outlook.com,live.com,aol.com,proton.me,protonmail.com")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

/**
 * Oversight CC addresses (your env)
 */
const OVERSIGHT_EMAILS = {
  PCC: process.env.PCC_EMAIL || "",
  NHRC: process.env.NHRC_EMAIL || "",
  FCCPC: process.env.FCCPC_EMAIL || "",
  SERVICOM: process.env.SERVICOM_EMAIL || "",
  AGF: process.env.AGF_EMAIL || "",
};

/**
 * =========================
 * ✅ CORS (safer)
 * =========================
 * Set:
 *  CORS_ORIGINS="https://petitiondesk.com,https://www.petitiondesk.com"
 * If you want wildcard:
 *  CORS_ORIGINS="*"
 */
const CORS_ORIGINS_RAW = (process.env.CORS_ORIGINS || FRONTEND_BASE_URL).trim();
const CORS_ORIGINS = CORS_ORIGINS_RAW.split(",").map((s) => s.trim()).filter(Boolean);
const isWildcardCors = CORS_ORIGINS.includes("*");

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // allow server-to-server calls
      if (isWildcardCors) return cb(null, true);
      if (CORS_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"), false);
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Admin-Token"],
  })
);

// Keep rawBody for webhook verification
app.use(
  express.json({
    limit: "5mb",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

/**
 * =========================
 * ✅ OpenAI client
 * =========================
 */
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * =========================
 * ✅ Redis (Render Redis)
 * =========================
 */
const REDIS_URL = process.env.REDIS_URL || "";
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
  console.log("⚠️ REDIS_URL not set — reliability will suffer on restarts/scaling.");
}

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
async function redisSetJson(key, obj, ttlSeconds) {
  if (!redis) return false;
  try {
    const payload = JSON.stringify(obj);
    if (ttlSeconds && ttlSeconds > 0) await redis.set(key, payload, "EX", ttlSeconds);
    else await redis.set(key, payload);
    return true;
  } catch {
    return false;
  }
}
async function redisGetJson(key) {
  if (!redis) return null;
  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
async function redisSetNX(key, value, ttlSeconds) {
  if (!redis) return false;
  try {
    const res =
      ttlSeconds && ttlSeconds > 0
        ? await redis.set(key, value, "NX", "EX", ttlSeconds)
        : await redis.set(key, value, "NX");
    return res === "OK";
  } catch {
    return false;
  }
}
async function redisDel(key) {
  if (!redis) return;
  try {
    await redis.del(key);
  } catch {}
}

/**
 * =========================
 * ✅ Metrics keys
 * =========================
 */
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

/**
 * =========================
 * ✅ In-memory fallback (kept)
 * =========================
 */
const petitionStore = new Map();
const USED_TX_REFS = new Set();

/**
 * =========================
 * ✅ Rate limiting (Redis-backed / memory fallback)
 * =========================
 */
const memRL = new Map();

function getClientIp(req) {
  const xf = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return xf || req.ip || "unknown";
}

async function rateLimit(req, res, routeKey, limitPerHour) {
  const ip = getClientIp(req);
  const hourKey = Math.floor(Date.now() / (60 * 60 * 1000));
  const key = `pd:rl:${routeKey}:${ip}:${hourKey}`;

  if (redis) {
    try {
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, 60 * 60 + 5);
      if (count > limitPerHour) {
        res.status(429).json({ ok: false, error: "Too many requests. Try later." });
        return true;
      }
      return false;
    } catch {
      // fallback to memory
    }
  }

  const mk = `${routeKey}:${ip}:${hourKey}`;
  const count = (memRL.get(mk) || 0) + 1;
  memRL.set(mk, count);
  if (count > limitPerHour) {
    res.status(429).json({ ok: false, error: "Too many requests. Try later." });
    return true;
  }
  return false;
}

/**
 * =========================
 * ✅ Admin sessions (Redis-based)
 * =========================
 */
function randomToken(len = 48) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

async function createAdminSession() {
  const token = `pdadm_${Date.now()}_${randomToken(24)}`;
  if (redis) await redis.set(`pd:admin:${token}`, "1", "EX", ADMIN_SESSION_TTL_SECONDS);
  return token;
}

async function isAdminTokenValid(token) {
  if (!token) return false;
  if (!redis) return false;
  try {
    const ok = await redis.get(`pd:admin:${token}`);
    return ok === "1";
  } catch {
    return false;
  }
}

/**
 * =========================
 * ✅ Payment + Petition state keys (Redis-first)
 * =========================
 */
function petitionKey(tx_ref) {
  return `pd:petition:${tx_ref}`;
}
function paidKey(tx_ref) {
  return `pd:paid:${tx_ref}`;
}
function unlockedKey(tx_ref) {
  return `pd:unlocked:${tx_ref}`;
}
function unlockLockKey(tx_ref) {
  return `pd:lock:unlock:${tx_ref}`;
}

async function setPetition(tx_ref, obj) {
  const payload = { ...obj, tx_ref };
  const ok = await redisSetJson(petitionKey(tx_ref), payload, PETITION_TTL_SECONDS);
  if (!ok) petitionStore.set(tx_ref, payload);
  return payload;
}

async function getPetition(tx_ref) {
  const fromRedis = await redisGetJson(petitionKey(tx_ref));
  if (fromRedis) return fromRedis;
  return petitionStore.get(tx_ref) || null;
}

async function markPaymentInitialized(tx_ref) {
  const stored = await getPetition(tx_ref);
  if (!stored) return null;
  stored.paymentInitializedAt = Date.now();
  stored.status = "pay_initialized";
  await setPetition(tx_ref, stored);
  return stored;
}

async function markPaid(tx_ref) {
  if (redis) await redisSetNX(paidKey(tx_ref), "1", PAID_TTL_SECONDS);
  USED_TX_REFS.add(tx_ref);
  const stored = await getPetition(tx_ref);
  if (stored) {
    stored.status = "paid";
    await setPetition(tx_ref, stored);
  }
}

async function isPaid(tx_ref) {
  if (redis) {
    try {
      const v = await redis.get(paidKey(tx_ref));
      if (v === "1") return true;
    } catch {}
  }
  return USED_TX_REFS.has(tx_ref);
}

async function alreadyUnlocked(tx_ref) {
  if (!redis) return false;
  try {
    const v = await redis.get(unlockedKey(tx_ref));
    return v === "1";
  } catch {
    return false;
  }
}

async function markUnlocked(tx_ref) {
  if (redis) return await redisSetNX(unlockedKey(tx_ref), "1", UNLOCK_TTL_SECONDS);
  return true; // memory fallback
}

async function acquireUnlockLock(tx_ref) {
  // Prevent parallel verify/unlock race
  if (!redis) return true;
  return await redisSetNX(unlockLockKey(tx_ref), "1", 30);
}
async function releaseUnlockLock(tx_ref) {
  if (!redis) return;
  await redisDel(unlockLockKey(tx_ref));
}

/**
 * =========================
 * ✅ Flutterwave helper
 * =========================
 */
async function flwFetch(url, options = {}) {
  if (!FLW_SECRET_KEY) throw new Error("FLW_SECRET_KEY missing");

  if (typeof fetch !== "function") {
    throw new Error("Global fetch is missing. Use Node 18+ on Render.");
  }

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${FLW_SECRET_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/**
 * =========================
 * ✅ Paths
 * =========================
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * =========================
 * ✅ Utilities
 * =========================
 */
function safeUniq(arr) {
  return [...new Set((arr || []).filter(Boolean))];
}

function isEmail(s) {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

function getDomain(email) {
  const lower = String(email || "").toLowerCase();
  const parts = lower.split("@");
  return parts[1] || "";
}

function isLikelyOfficialEmail(email) {
  if (!isEmail(email)) return false;

  const lower = email.toLowerCase();
  if (lower.startsWith("noreply@") || lower.startsWith("no-reply@")) return false;

  if (BLOCK_FREE_EMAIL_DOMAINS) {
    const domain = getDomain(lower);
    if (FREE_EMAIL_DOMAINS.includes(domain)) return false;
  }

  return true;
}

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

function normalizeText(s = "") {
  return String(s)
    .toLowerCase()
    .replace(/[\u2019’]/g, "'")
    .replace(/[^a-z0-9\s().,&/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function makeAcronym(name = "") {
  // Nigerian Electricity Regulatory Commission -> NERC
  const clean = String(name || "")
    .replace(/[\(\)\[\]\{\}]/g, " ")
    .replace(/[.,]/g, " ")
    .trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  const stop = new Set(["of", "and", "the", "for", "to", "in", "on", "at", "by", "with"]);
  const letters = parts
    .filter((w) => !stop.has(w.toLowerCase()))
    .map((w) => w[0])
    .join("");
  const ac = letters.toUpperCase();
  // require at least 3 letters to reduce noise
  return ac.length >= 3 ? ac : "";
}

function extractSubjectFromPetition(petitionText = "") {
  const m =
    petitionText.match(/^\s*subject\s*:\s*(.+)\s*$/im) ||
    petitionText.match(/^\s*re\s*:\s*(.+)\s*$/im);
  return (m?.[1] || "").trim() || "Petition Regarding Complaint";
}

function loadSectorJson(sector) {
  const filePath = path.join(__dirname, "data", `${sector}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function detectSector(text) {
  const lower = (text || "").toLowerCase();
  const map = {
    power: ["electricity", "nepa", "aedc", "transformer", "power", "disco", "tcn", "nberc", "nerc"],
    aviation: ["flight", "airport", "airline", "ncaa", "faan", "aviation"],
    banking: ["bank", "atm", "pos", "debit", "transfer", "chargeback", "unlawful debit"],
    telecoms: ["airtime", "data", "network", "sim", "telecom", "ncc", "mtn", "airtel", "glo", "9mobile"],
    education: ["school", "university", "waec", "jamb", "nuc", "education", "tetfund"],
    health: ["hospital", "clinic", "doctor", "ncdc", "nhis", "medical", "health"],
    security: ["police", "army", "navy", "airforce", "nscdc", "unlawful arrest", "immigration"],
    judiciary: ["court", "judge", "justice", "supreme", "petition", "magistrate"],
    international_escalation: ["un", "ecowas", "au", "icc", "eu", "international"],
  };

  for (const [sec, words] of Object.entries(map)) {
    if (words.some((w) => lower.includes(w))) return sec;
  }
  return "unknown";
}

function inferCaseType(sector) {
  if (sector === "security" || sector === "judiciary") return "human_rights";
  if (["health", "telecoms", "aviation", "banking", "power", "education"].includes(sector))
    return "service_delivery";
  if (sector === "international_escalation") return "international";
  return "other";
}

function buildAdminOversightCC({ sector, caseType }) {
  const cc = [];
  if (sector !== "international_escalation" && OVERSIGHT_EMAILS.PCC) cc.push(OVERSIGHT_EMAILS.PCC);
  if (caseType === "human_rights" && OVERSIGHT_EMAILS.NHRC) cc.push(OVERSIGHT_EMAILS.NHRC);
  if (caseType === "service_delivery") {
    if (OVERSIGHT_EMAILS.SERVICOM) cc.push(OVERSIGHT_EMAILS.SERVICOM);
    if (OVERSIGHT_EMAILS.FCCPC) cc.push(OVERSIGHT_EMAILS.FCCPC);
  }
  if (sector === "international_escalation" && OVERSIGHT_EMAILS.AGF) cc.push(OVERSIGHT_EMAILS.AGF);
  return safeUniq(cc).filter(isEmail);
}

function buildMailto({ to = [], cc = [], subject = "", body = "" }) {
  // mailto has practical limits; keep lists small.
  const toList = safeUniq(to).filter(isEmail).slice(0, 10).join(",");
  const ccList = safeUniq(cc).filter(isEmail).slice(0, 10).join(",");
  if (!toList) return null;

  const s = encodeURIComponent(subject || "Petition");
  // Keep body manageable (some mail clients break on huge URLs)
  const MAX_BODY_CHARS = 3000;
  const bodySafe = String(body || "");
  const truncatedBody = bodySafe.length > MAX_BODY_CHARS ? bodySafe.slice(0, MAX_BODY_CHARS) + "\n\n[Truncated]" : bodySafe;
  const b = encodeURIComponent(truncatedBody);

  const ccParam = ccList ? `&cc=${encodeURIComponent(ccList)}` : "";
  return `mailto:${toList}?subject=${s}&body=${b}${ccParam}`;
}

function parseToCcLines(petitionText = "") {
  // Pull TO and CC institution names from the generated petition (best signal)
  const lines = String(petitionText || "").split(/\r?\n/).map((l) => l.trim());
  let toLine = "";
  let ccLine = "";
  for (const l of lines) {
    if (!toLine && /^to\s*:/i.test(l)) toLine = l.replace(/^to\s*:/i, "").trim();
    if (!ccLine && /^cc\s*:/i.test(l)) ccLine = l.replace(/^cc\s*:/i, "").trim();
  }
  // Split CC on commas/semicolon
  const ccItems = ccLine
    ? ccLine.split(/[;,]/).map((s) => s.trim()).filter(Boolean)
    : [];
  return { toLine, ccItems };
}

/**
 * =========================
 * ✅ Institution catalog builder (WITH ALIASES)
 * =========================
 *
 * Supported fields in sector JSON institution objects:
 *  - name
 *  - aliases: ["NERC", "Nigerian power regulator"]
 *  - abbreviations: ["NERC", "CBN"]
 *  - short_name: "NERC"
 *
 * It also AUTO-GENERATES acronym from name.
 */
function buildInstitutionCatalog(sectorJson) {
  const items = [];

  function collectAliasStrings(obj, primaryName) {
    const alias = [];

    const add = (v) => {
      if (!v) return;
      if (typeof v === "string") alias.push(v);
      if (Array.isArray(v)) v.forEach((x) => typeof x === "string" && alias.push(x));
    };

    add(primaryName);
    add(obj?.name);
    add(obj?.short_name);
    add(obj?.abbr);
    add(obj?.abbreviation);
    add(obj?.abbreviations);
    add(obj?.alias);
    add(obj?.aliases);

    // Auto acronym from primary name
    const ac = makeAcronym(primaryName || obj?.name || "");
    if (ac) alias.push(ac);

    // Normalized versions also help
    const n = normalizeText(primaryName || obj?.name || "");
    if (n) alias.push(n);

    return safeUniq(alias).filter(Boolean);
  }

  function addItem(name, obj) {
    if (!name) return;

    const emails = safeUniq(extractEmailsDeep(obj))
      .filter(isEmail)
      .filter(isLikelyOfficialEmail);

    const aliasStrings = collectAliasStrings(obj, name);
    const aliasNorms = safeUniq(aliasStrings.map((s) => normalizeText(s)).filter(Boolean));

    items.push({
      name: String(name),
      norm: normalizeText(name),
      aliases: aliasStrings,
      aliasNorms,
      emails,
    });
  }

  if (!sectorJson || typeof sectorJson !== "object") return items;

  // oversight object
  if (sectorJson.oversight && typeof sectorJson.oversight === "object") {
    for (const key of Object.keys(sectorJson.oversight)) {
      const node = sectorJson.oversight[key];
      addItem(node?.name || key, node);
    }
  }

  // typical arrays
  ["core_institutions", "regulators", "watchdogs", "players"].forEach((key) => {
    if (Array.isArray(sectorJson[key])) {
      sectorJson[key].forEach((inst) => addItem(inst?.name || inst, inst));
    }
  });

  return items;
}

/**
 * =========================
 * ✅ Institution matching (robust)
 * =========================
 * Uses:
 * 1) Direct match from petition's TO/CC lines
 * 2) Alias substring match
 * 3) Token overlap match
 */
function findMentionedInstitutions(petitionText, catalog) {
  const textNorm = normalizeText(petitionText);
  const tokens = new Set(textNorm.split(" ").filter((w) => w.length > 2));
  const mentioned = [];

  const { toLine, ccItems } = parseToCcLines(petitionText);
  const focusNames = safeUniq([toLine, ...ccItems].filter(Boolean)).map((s) => normalizeText(s));

  // Helper: match a phrase against an item using aliases
  function itemMatchesPhrase(item, phraseNorm) {
    if (!phraseNorm) return false;
    if (item.norm && phraseNorm.includes(item.norm)) return true;
    if (item.aliasNorms && item.aliasNorms.some((a) => a && phraseNorm.includes(a))) return true;
    return false;
  }

  // 1) Strong signal: TO/CC line matching
  if (focusNames.length) {
    for (const phraseNorm of focusNames) {
      for (const item of catalog) {
        if (itemMatchesPhrase(item, phraseNorm)) mentioned.push(item);
      }
    }
  }

  // 2) General substring match in whole petition text
  for (const item of catalog) {
    if (!item) continue;

    // any alias appears as substring
    const hasAlias = item.aliasNorms?.some((a) => a && textNorm.includes(a));
    if (hasAlias) {
      mentioned.push(item);
      continue;
    }

    // token overlap match (fallback)
    const words = (item.norm || "").split(" ").filter((w) => w.length > 2);
    if (!words.length) continue;

    let matchCount = 0;
    for (const w of words) if (tokens.has(w)) matchCount++;

    if (matchCount >= Math.min(2, words.length)) mentioned.push(item);
  }

  // 3) Keep your police safety-net (but broader)
  const raw = (petitionText || "").toLowerCase();
  if (raw.includes("police")) {
    const policeItems = catalog.filter((c) =>
      c.aliasNorms?.some((a) => a.includes("police") || a.includes("nigeria police") || a.includes("police service commission"))
    );
    mentioned.push(...policeItems);
  }

  // Unique by name
  const seen = new Set();
  const uniq = [];
  for (const m of mentioned) {
    const k = m?.name || "";
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(m);
  }
  return uniq;
}

/**
 * =========================
 * ✅ Redirect builder
 * =========================
 */
function buildFrontendRedirectUrl(tx_ref) {
  const base = String(FRONTEND_BASE_URL || "").trim().replace(/\/+$/, "");
  return `${base}/?tx_ref=${encodeURIComponent(tx_ref)}`;
}

/**
 * =========================
 * ✅ Admin endpoints
 * =========================
 */
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

/**
 * Debug endpoint (admin only): see who would be recipients for a sector JSON
 * GET /sectors/:sector/recipients?name=someText
 */
app.get("/sectors/:sector/recipients", async (req, res) => {
  try {
    const token = String(req.headers["x-admin-token"] || "");
    const valid = await isAdminTokenValid(token);
    if (!valid) return res.status(401).json({ ok: false, error: "Unauthorized" });

    const sector = String(req.params.sector || "").trim();
    const sectorJson = loadSectorJson(sector);
    if (!sectorJson) return res.status(404).json({ ok: false, error: "Sector JSON not found" });

    const catalog = buildInstitutionCatalog(sectorJson);

    // Optional: pass a query text to see matches
    const sample = String(req.query.name || "").trim();
    const matches = sample ? findMentionedInstitutions(sample, catalog) : [];

    res.json({
      ok: true,
      sector,
      totalInstitutions: catalog.length,
      exampleMatches: matches.map((m) => ({ name: m.name, emails: m.emails, aliases: m.aliases })),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Recipients debug failed" });
  }
});

/**
 * =========================
 * ✅ Webhook: Flutterwave
 * =========================
 */
app.post("/flw-webhook", async (req, res) => {
  try {
    const hash = String(req.headers["verif-hash"] || "");
    const expected = FLW_WEBHOOK_HASH || FLW_SECRET_KEY;

    if (!FLW_WEBHOOK_HASH) {
      console.warn("⚠️ FLW_WEBHOOK_HASH not set. Using FLW_SECRET_KEY fallback (NOT recommended).");
    }

    if (!hash || hash !== expected) return res.status(401).end();

    const raw = req.rawBody ? req.rawBody.toString("utf8") : "";
    const payload = raw ? JSON.parse(raw) : req.body;

    if (payload.event === "charge.completed" && payload.data?.status === "successful") {
      const tx_ref = payload.data.tx_ref;
      const amount = Number(payload.data.amount || 0);
      const currency = String(payload.data.currency || "").toUpperCase();

      if (tx_ref?.startsWith("pd_") && amount >= PETITION_PRICE_NGN && currency === "NGN") {
        await markPaid(tx_ref);
        await redisIncr(METRICS.paymentSuccess);
        await redisSAdd(METRICS.uniquePaySuccess, tx_ref);
        console.log(`✅ Payment confirmed via webhook: ${tx_ref}`);
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err);
    res.sendStatus(400);
  }
});

/**
 * =========================
 * ✅ Core endpoints
 * =========================
 */
app.post("/track/visit", async (req, res) => {
  await redisIncr(METRICS.visits);
  res.json({ ok: true });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "petitiondesk-backend",
    time: new Date().toISOString(),
    redis: Boolean(redis),
    model: OPENAI_MODEL,
  });
});

app.post("/generate-petition", async (req, res) => {
  if (await rateLimit(req, res, "gen", RL_GEN_PER_HOUR)) return;

  const { complaint = "", petitioner = {} } = req.body || {};
  if (!String(complaint || "").trim()) return res.status(400).json({ error: "Complaint is required" });

  await redisIncr(METRICS.generated);

  const sector = detectSector(complaint);
  if (sector === "unknown") return res.status(400).json({ error: "Could not detect sector" });

  const pName = petitioner.fullName?.trim() || "[Your Full Name]";
  const pAddress = petitioner.address?.trim() || "[Your Address]";
  const pEmail = petitioner.email?.trim() || "[Your Email]";
  const pPhone = petitioner.phone?.trim() || "[Phone Number]";

  const autoDate = new Date().toLocaleDateString("en-GB");
  const caseType = inferCaseType(sector);

  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: "OPENAI_API_KEY not configured" });

  try {
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content: `You are an expert in drafting formal Nigerian petitions/complaints. Draft a professional, concise petition letter addressed to the PRIMARY institution responsible for the complaint.

MANDATORY STRUCTURE (use exactly this format, no deviations):

Date: ${autoDate}

PETITIONER DETAILS:
Name: ${pName}
Address: ${pAddress}
Email: ${pEmail}
Phone: ${pPhone}

TO: [Full official name of primary institution ONLY — DO NOT add email or address]
CC: [List any relevant oversight/regulatory bodies by name ONLY — DO NOT add emails]
SUBJECT: [Clear, specific subject line]

Dear Sir/Madam,

FACTS:
1. [Numbered facts from the complaint]
2. ...

LEGAL FRAMEWORK:
- [Relevant laws, regulations, consumer rights, etc.]

RELIEFS SOUGHT:
1. [Specific remedies requested]
2. ...

Yours faithfully,

${pName}
${pPhone}
${pEmail}

Additional instructions:
- Sector: ${sector} | Case Type: ${caseType}
- DO NOT include any email addresses, physical addresses, or other contact details in TO/CC or the body.
- Only mention institution names.
- Keep the letter professional, factual, and under 800 words.`,
        },
        { role: "user", content: `Complaint: ${complaint}` },
      ],
    });

    const petitionText = completion.choices?.[0]?.message?.content?.trim() || "Generation failed.";
    const subject = extractSubjectFromPetition(petitionText);

    const sectorJson = loadSectorJson(sector);
    const catalog = buildInstitutionCatalog(sectorJson);

    const mentioned = findMentionedInstitutions(petitionText, catalog);
    const toEmails = safeUniq(mentioned.flatMap((m) => m.emails))
      .filter(isEmail)
      .filter(isLikelyOfficialEmail);

    const adminCC = buildAdminOversightCC({ sector, caseType });

    const tx_ref = `pd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await setPetition(tx_ref, {
      petition: petitionText,
      sector,
      caseType,
      subject,
      mentionedInstitutions: mentioned.map((m) => m.name),
      toEmails,
      ccEmails: adminCC,
      paymentInitializedAt: null,
      createdAt: Date.now(),
      status: "created",
    });

    await redisIncr(METRICS.previewed);

    const preview = petitionText.length > 600 ? petitionText.substring(0, 600) + "..." : petitionText;

    res.json({
      needsPayment: true,
      amount: PETITION_PRICE_NGN,
      currency: "NGN",
      tx_ref,
      preview,
      // extra: help frontend build its own email UI without mailto limits
      emailPayload: {
        to: toEmails.slice(0, 20),
        cc: adminCC.slice(0, 20),
        subject,
      },
    });
  } catch (err) {
    console.error("Generation error:", err);
    res.status(500).json({ error: "Failed to generate petition" });
  }
});

app.post("/pay/initialize", async (req, res) => {
  if (await rateLimit(req, res, "payinit", RL_PAYINIT_PER_HOUR)) return;

  try {
    const { tx_ref, email, name, phone } = req.body || {};
    if (!tx_ref) return res.status(400).json({ ok: false, error: "Missing tx_ref" });

    const stored = await getPetition(tx_ref);
    if (!stored) return res.status(404).json({ ok: false, error: "Unknown tx_ref. Generate petition again." });

    await markPaymentInitialized(tx_ref);
    await redisIncr(METRICS.paymentInitiated);
    await redisSAdd(METRICS.uniquePayInit, tx_ref);

    const redirect_url = buildFrontendRedirectUrl(tx_ref);

    const payload = {
      tx_ref,
      amount: PETITION_PRICE_NGN,
      currency: "NGN",
      redirect_url,
      customer: {
        email: email || "user@petitiondesk.com",
        name: name || "User",
        phonenumber: phone || "",
      },
      customizations: { title: "PetitionDesk", description: "Unlock full petition" },
    };

    const { ok, data } = await flwFetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (!ok || !data?.data?.link) return res.status(400).json({ ok: false, error: "Payment failed" });

    res.json({ ok: true, tx_ref, link: data.data.link });
  } catch (err) {
    console.error("pay/initialize error:", err);
    res.status(500).json({ ok: false, error: "Payment error" });
  }
});

app.post("/unlock-petition", async (req, res) => {
  if (await rateLimit(req, res, "unlock", RL_UNLOCK_PER_HOUR)) return;

  const { tx_ref } = req.body || {};
  if (!tx_ref) return res.status(400).json({ ok: false, error: "Missing tx_ref" });

  const stored = await getPetition(tx_ref);
  if (!stored) return res.status(404).json({ ok: false, error: "Petition expired" });

  const adminToken = String(req.headers["x-admin-token"] || "");
  const adminOk = await isAdminTokenValid(adminToken);

  const makePayload = () => {
    const mailto = buildMailto({
      to: stored.toEmails,
      cc: stored.ccEmails,
      subject: stored.subject,
      body: stored.petition,
    });

    return {
      ok: true,
      unlocked: true,
      petition: stored.petition,
      sector: stored.sector,
      mentionedInstitutions: stored.mentionedInstitutions,
      to: stored.toEmails,
      cc: stored.ccEmails,
      mailto,
      // extra: frontend can copy full text and open email app with shorter body
      emailPayload: {
        to: stored.toEmails.slice(0, 50),
        cc: stored.ccEmails.slice(0, 50),
        subject: stored.subject,
        body: stored.petition,
      },
    };
  };

  try {
    // Admin bypass
    if (adminOk) return res.json({ ...makePayload(), admin: true });

    // Already unlocked (idempotent)
    if (await alreadyUnlocked(tx_ref)) return res.json({ ...makePayload(), alreadyUnlocked: true });

    // Acquire lock to prevent parallel verify/unlock race
    const gotLock = await acquireUnlockLock(tx_ref);
    if (!gotLock) {
      return res.status(409).json({ ok: false, error: "Unlock already in progress. Try again." });
    }

    try {
      // Webhook confirmed?
      if (await isPaid(tx_ref)) {
        const justSet = await markUnlocked(tx_ref);
        await redisIncr(METRICS.unlockedPaid);

        if (!redis) {
          USED_TX_REFS.add(tx_ref);
          petitionStore.delete(tx_ref);
        } else {
          stored.status = "unlocked";
          await setPetition(tx_ref, stored);
        }

        return res.json({ ...makePayload(), alreadyUnlocked: !justSet });
      }

      // Verify with Flutterwave
      let verifyResponse;
      try {
        verifyResponse = await flwFetch(
          `https://api.flutterwave.com/v3/transactions/verify?tx_ref=${encodeURIComponent(tx_ref)}`
        );
      } catch {
        verifyResponse = { ok: false, status: 0, data: {} };
      }

      if (!verifyResponse.ok) {
        const initAt = Number(stored.paymentInitializedAt || 0);
        const recentlyInitialized = initAt && Date.now() - initAt < 15 * 60 * 1000;

        if (recentlyInitialized) {
          return res.status(202).json({
            ok: false,
            pending: true,
            error: "Payment processing. Please wait a moment...",
          });
        }

        return res.status(402).json({ ok: false, error: "Payment not verified" });
      }

      const data = verifyResponse.data || {};
      const status = String(data?.data?.status || "").toLowerCase();
      const amount = Number(data?.data?.amount || 0);
      const currency = String(data?.data?.currency || "").toUpperCase();

      const verified = status === "successful" && currency === "NGN" && amount >= PETITION_PRICE_NGN;
      if (!verified) return res.status(402).json({ ok: false, error: "Payment not verified" });

      await markPaid(tx_ref);
      const justSet = await markUnlocked(tx_ref);
      await redisIncr(METRICS.unlockedPaid);

      if (!redis) {
        USED_TX_REFS.add(tx_ref);
        petitionStore.delete(tx_ref);
      } else {
        stored.status = "unlocked";
        await setPetition(tx_ref, stored);
      }

      return res.json({ ...makePayload(), alreadyUnlocked: !justSet });
    } finally {
      await releaseUnlockLock(tx_ref);
    }
  } catch (err) {
    console.error("Unlock error:", err);
    res.status(500).json({ ok: false, error: "Unlock failed" });
  }
});

/**
 * PDF download (GET for compatibility)
 * /download-pdf?text=...
 */
app.get("/download-pdf", (req, res) => {
  try {
    const text = decodeURIComponent(String(req.query.text || ""));
    if (!text) return res.status(400).send("Missing text");
    if (text.length > 200000) return res.status(413).send("Text too large");

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
    console.error(err);
    res.status(500).send("PDF generation failed");
  }
});

/**
 * =========================
 * ✅ Start server
 * =========================
 */
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 PetitionDesk backend running on port ${PORT}`);
  console.log(`Frontend base: ${FRONTEND_BASE_URL}`);
  console.log(
    `Webhook URL: ${process.env.RENDER_EXTERNAL_URL || `https://your-app.onrender.com`}/flw-webhook`
  );
  if (!redis) console.log("⚠️ Running without Redis: not recommended for real usage.");
  if (!FLW_WEBHOOK_HASH) console.log("⚠️ FLW_WEBHOOK_HASH not set: webhook verification is weaker.");
});

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
// ✅ dedicated webhook secret (recommended)
const FLW_WEBHOOK_HASH = String(process.env.FLW_WEBHOOK_HASH || "").trim();

const FRONTEND_BASE_URL = String(process.env.FRONTEND_BASE_URL || "https://petitiondesk.com")
  .trim()
  .replace(/\/+$/, "");

const PETITION_PRICE_NGN = Number(process.env.PETITION_PRICE_NGN || 1050);
const PETITION_TTL_SECONDS = Number(process.env.PETITION_TTL_SECONDS || 2 * 60 * 60); // default 2 hours

const ADMIN_UNLOCK_KEY = String(process.env.ADMIN_UNLOCK_KEY || "").trim();
const ADMIN_SESSION_TTL_SECONDS = Number(process.env.ADMIN_SESSION_TTL_SECONDS || 2 * 60 * 60); // default 2 hours

const FLW_TIMEOUT_MS = Number(process.env.FLW_TIMEOUT_MS || 20000); // default 20s
const VERIFY_PENDING_WINDOW_MS = Number(process.env.VERIFY_PENDING_WINDOW_MS || 15 * 60 * 1000); // 15 mins

// Optional safety toggles
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
   REDIS (Render Redis)
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

// Optional hard fallback list (UNVERIFIED by default).
// Best practice: set PCC_EMAIL properly in Render so you don't depend on this.
const PCC_FALLBACK_EMAILS = [
  // "complaints@pcc.gov.ng",
  // "info@pcc.gov.ng",
];

/* ======================================================
   IN-MEMORY FALLBACK STORAGE
====================================================== */
// Note: Render free tier restarts = memory resets. Redis is best.
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
    power: ["electricity", "nepa", "aedc", "power", "disco", "tcn", "nerc", "meter", "estimated billing", "transformer"],
    aviation: ["flight", "airport", "airline", "ncaa", "faan", "aviation", "air peace", "airpeace"],
    banking: ["bank", "atm", "pos", "debit", "transfer", "chargeback", "unlawful debit", "cbn", "failed transfer"],
    telecoms: ["airtime", "data", "network", "sim", "telecom", "ncc", "mtn", "airtel", "glo", "9mobile"],
    education: ["school", "university", "waec", "jamb", "nuc", "education", "tetfund", "transcript"],
    health: ["hospital", "clinic", "doctor", "ncdc", "nhis", "medical", "health"],
    security: ["police", "army", "navy", "airforce", "nscdc", "unlawful arrest", "immigration", "dss", "kidnap", "detention"],
    judiciary: ["court", "judge", "justice", "supreme", "magistrate", "bail", "delayed judgement", "njc"],
    international_escalation: [
      "un",
      "ecowas",
      "au",
      "icc",
      "eu",
      "international",
      "united nations",
      "un human rights",
      "congress",
      "u.s. congress",
      "house committee",
      "senate",
      "state department",
    ],
    anti_corruption: [
      "anti corruption",
      "anti-corruption",
      "corruption",
      "bribe",
      "bribery",
      "kickback",
      "procurement",
      "inflated contract",
      "contract inflation",
      "money laundering",
      "embezzlement",
      "ghost worker",
      "efcc",
      "icpc",
      "bpp",
      "bureau of public procurement",
      "ccb",
      "cct",
      "fraud",
    ],
    diaspora_report: [
      "diaspora",
      "nidcom",
      "embassy",
      "high commission",
      "consulate",
      "passport seized",
      "passport withheld",
      "detained abroad",
      "arrested abroad",
      "deportation",
      "stranded abroad",
      "trafficking",
      "human trafficking",
      "migration",
    ],
  };
}

function detectSector(text) {
  const lower = String(text || "").toLowerCase();

  // 1) JSON keywords first (best)
  for (const [sector, words] of SECTOR_KEYWORDS_INDEX.entries()) {
    if (words.some((w) => w && lower.includes(w))) return sector;
  }

  // 2) built-in fallback
  const map = builtInKeywordMap();
  for (const [sec, words] of Object.entries(map)) {
    if (words.some((w) => w && lower.includes(w))) return sec;
  }

  // fallback
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

  // don't CC PCC if sector is general (PCC can be TO)
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

// Address extraction (JSON-only; never guess)
function isLikelyAddress(s) {
  if (typeof s !== "string") return false;
  const v = s.trim();
  if (!v) return false;
  if (v.length < 8) return false;
  if (v.includes("@")) return false;
  if (/https?:\/\//i.test(v)) return false;
  return /(\bplot\b|\bstreet\b|\broad\b|\bavenue\b|\bclose\b|\bdrive\b|\blane\b|\bway\b|\bphase\b|\bkm\b|\bno\.\b|\bhouse\b|\boffice\b|\bcomplex\b|\babuja\b|\blagos\b|\bnigeria\b|\bstate\b|\bfct\b|\bpo box\b|\bp\.o\.\b)/i.test(
    v
  );
}

function extractAddressesDeep(value, out = [], keyHint = "") {
  if (!value) return out;

  if (typeof value === "string") {
    const v = value.trim();
    if (
      /address|hq|head[_\s-]?office|location|office[_\s-]?address/i.test(String(keyHint || "")) ||
      isLikelyAddress(v)
    ) {
      out.push(v);
    }
    return out;
  }

  if (Array.isArray(value)) {
    value.forEach((v) => extractAddressesDeep(v, out, keyHint));
    return out;
  }

  if (typeof value === "object" && value !== null) {
    Object.entries(value).forEach(([k, v]) => extractAddressesDeep(v, out, k));
    return out;
  }

  return out;
}

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

function buildInstitutionCatalog(sectorJson) {
  const items = [];

  function addItem(name, obj, extraAliases = []) {
    if (!name) return;

    const emails = safeUniq(extractEmailsDeep(obj)).filter(isEmail);
    const addresses = safeUniq(extractAddressesDeep(obj)).filter(isLikelyAddress);
    const primaryAddress = addresses[0] || "";

    const aliases = safeUniq([
      ...(Array.isArray(obj?.aliases) ? obj.aliases : []),
      ...extraAliases,
      ...extractParenAbbr(String(name)),
    ]);

    const norm = normalizeName(name);
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
    });
  }

  if (!sectorJson || typeof sectorJson !== "object") return items;

  // 1) Existing logic (keep)
  const oversightNode = sectorJson.oversight || sectorJson.oversight_ministry || sectorJson.oversightMinistry;
  if (oversightNode && typeof oversightNode === "object") {
    for (const key of Object.keys(oversightNode)) {
      const node = oversightNode[key];
      addItem(node?.name || key, node);
    }
  }

  // 2) Existing arrays + add "institutions" and "bodies" support
  const arrayKeys = ["core_institutions", "regulators", "watchdogs", "players", "institutions", "bodies"];
  for (const key of arrayKeys) {
    const arr = sectorJson[key];
    if (Array.isArray(arr)) {
      arr.forEach((inst) => addItem(inst?.name || inst, inst));
    }
  }

  // 3) ✅ Your Nigeria_Domestic_Escalation.bodies
  const nde = sectorJson.Nigeria_Domestic_Escalation;
  if (nde && Array.isArray(nde.bodies)) {
    nde.bodies.forEach((inst) => addItem(inst?.name || inst, inst));
  }

  // 4) ✅ Your top-level country nodes (United_States, United_Kingdom, etc.)
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

    // only treat as institution if it actually contains emails somewhere
    const hasEmails = extractEmailsDeep(v).some((e) => isEmail(e));
    if (!hasEmails) continue;

    const keyAlias = String(k).replace(/_/g, " ").replace(/\s+/g, " ").trim();
    addItem(v?.name || keyAlias, v, [keyAlias]);
  }

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
   DURABLE PETITION STORAGE (Redis + memory)
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

    // If you set FLW_WEBHOOK_HASH, enforce it
    if (FLW_WEBHOOK_HASH) {
      if (!headerHash || headerHash !== FLW_WEBHOOK_HASH) return res.status(401).end();
    } else {
      // Accept to avoid breaking unlock, but warn strongly
      if (!headerHash) {
        console.warn("⚠️ Webhook received without verif-hash. Set FLW_WEBHOOK_HASH in Flutterwave dashboard + Render env.");
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

  let sector = detectSector(complaint); // defaults to general

  // If general/unknown and AI classifier enabled, attempt AI override
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

  // Force TO for general, so tenant/landlord & random issues always route to PCC
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
- DO NOT invent institution addresses. The system will insert verified addresses automatically from JSON if present.
- Keep it professional, firm, evidence-led, and hard to ignore (SAN style).
- Under 950 words.`,
        },
        { role: "user", content: `Complaint: ${complaint}` },
      ],
      temperature: 0,
    });

    let petitionText = completion.choices?.[0]?.message?.content?.trim() || "Generation failed.";
    const subject = extractSubjectFromPetition(petitionText);

    // Load sector JSON and build catalog
    const sectorJson = loadSectorJson(sector);
    const sectorCatalog = buildInstitutionCatalog(sectorJson);

    // Parse TO/CC institution names from petition text
    const toNames = extractSectionInstitutionNames(petitionText, "TO");
    const ccNames = extractSectionInstitutionNames(petitionText, "CC");

    // Match institutions (sector-first + cross-sector fallback)
    const toItems = safeUniq(
      toNames
        .map((n) => matchInstitutionNameToCatalog(n, sectorCatalog) || matchInstitutionAcrossAllSectors(n, sector))
        .filter(Boolean)
    );

    const ccItems = safeUniq(
      ccNames
        .map((n) => matchInstitutionNameToCatalog(n, sectorCatalog) || matchInstitutionAcrossAllSectors(n, sector))
        .filter(Boolean)
    );

    // Inject verified addresses (JSON-only)
    petitionText = injectInstitutionAddressesIntoPetition(petitionText, toItems, ccItems);

    // Extract verified emails from JSON catalog hits
    const toEmailsFromJson = safeUniq(toItems.flatMap((m) => m.emails)).filter(isEmail);
    const ccEmailsFromJson = safeUniq(ccItems.flatMap((m) => m.emails)).filter(isEmail);

    // Add admin oversight CC rules
    const adminCC = buildAdminOversightCC({ sector, caseType });
    const finalCC = safeUniq([...ccEmailsFromJson, ...adminCC]).filter(isEmail);

    // FINAL TO logic:
    // - if sector is general: always TO PCC (env), else fallback list
    // - else: use JSON TO emails
    let finalToEmails = toEmailsFromJson;
    let finalToInstitutions = toItems.map((m) => m.name);

    if (sector === "general") {
      const pcc = OVERSIGHT_EMAILS.PCC && isEmail(OVERSIGHT_EMAILS.PCC) ? [OVERSIGHT_EMAILS.PCC] : PCC_FALLBACK_EMAILS;
      finalToEmails = pcc.filter(isEmail);
      finalToInstitutions = ["Public Complaints Commission (PCC)"];
    }

    if (!finalToEmails.length) {
      return res.status(400).json({
        ok: false,
        error: "No recipient email found for the detected TO institution in your sector JSON.",
        hint:
          "Fix: add emails to data/<sector>.json for the TO institution, OR for general set PCC_EMAIL in Render env.",
        sector,
      });
    }

    const tx_ref = `pd_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    await storePetition(tx_ref, {
      petition: petitionText,
      sector,
      caseType,
      subject,
      toInstitutions: finalToInstitutions,
      ccInstitutions: ccItems.map((m) => m.name),
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
   PAY INITIALIZE (Flutterwave)
   ✅ FIXED: getPetition(tx_ref) (no corrupted text)
====================================================== */
app.post("/pay/initialize", async (req, res) => {
  try {
    const tx_ref = String(req.body?.tx_ref || "").trim();
    if (!tx_ref) return res.status(400).json({ ok: false, error: "Missing tx_ref" });

    if (!FLW_SECRET_KEY) return res.status(500).json({ ok: false, error: "FLW_SECRET_KEY not configured" });

    // ✅ THIS IS THE FIX:
    const stored = await getPetition(tx_ref);
    if (!stored) return res.status(404).json({ ok: false, error: "Unknown tx_ref. Generate petition again." });

    // record initialization time
    stored.paymentInitializedAt = Date.now();

    // store return_to if provided by frontend (so user returns to exact page)
    const return_to = String(req.body?.return_to || "").trim();
    if (return_to && return_to.startsWith("/")) stored.return_to = return_to;

    await storePetition(tx_ref, stored);

    await redisIncr(METRICS.paymentInitiated);
    await redisSAdd(METRICS.uniquePayInit, tx_ref);

    const redirect_url =
      stored.return_to && stored.return_to.startsWith("/")
        ? buildFrontendRedirectUrlWithReturn(tx_ref, stored.return_to)
        : buildFrontendRedirectUrl(tx_ref);

    // Allow frontend to pass customer details; fall back to safe defaults
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
   UNLOCK PETITION (Admin override OR webhook OR verify)
====================================================== */
app.post("/unlock-petition", async (req, res) => {
  try {
    const v = validateTxRef(req.body || {});
    if (!v.ok) return res.status(400).json(v);

    const tx_ref = v.tx_ref;

    // if already unlocked, return stored unlocked payload
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

    // ✅ Admin override
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

    // ✅ Webhook-confirmed (or Redis-paid flag)
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

    // ✅ Verify with Flutterwave (fallback)
    if (!FLW_SECRET_KEY) return res.status(402).json({ ok: false, error: "Payment not verified" });

    const initAt = Number(stored.paymentInitializedAt || 0);
    const recentlyInitialized = initAt && Date.now() - initAt < VERIFY_PENDING_WINDOW_MS;

    // Prefer verify by transaction id if available
    const bodyTxId = String(v.transaction_id || "").trim();
    const storedTxId = await getTxId(tx_ref);
    const txIdToUse = bodyTxId || storedTxId;

    let verifyResponse;
    try {
      if (txIdToUse) {
        verifyResponse = await flwFetch(
          `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(txIdToUse)}/verify`
        );
      } else {
        verifyResponse = await flwFetch(
          `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(tx_ref)}`
        );
      }
    } catch {
      verifyResponse = { ok: false, status: 0, data: {} };
    }

    if (!verifyResponse.ok) {
      if (recentlyInitialized) {
        return res.status(202).json({
          ok: false,
          pending: true,
          error: "Payment processing. Please wait a moment and try again.",
        });
      }
      return res.status(402).json({ ok: false, error: "Payment not verified" });
    }

    const data = verifyResponse.data || {};
    let d = data?.data || {};
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
        return res.status(202).json({
          ok: false,
          pending: true,
          error: "Payment is still processing. Please try again shortly.",
        });
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
  console.log(
    `Webhook URL: ${
      process.env.RENDER_EXTERNAL_URL || `https://your-app.onrender.com`
    }/flw-webhook`
  );

  if (!FLW_WEBHOOK_HASH) {
    console.log(
      "⚠️ FLW_WEBHOOK_HASH not set — set Secret Hash in Flutterwave + set env var in Render (recommended)."
    );
  }
  if (!OPENAI_KEY) {
    console.log("⚠️ OPENAI_API_KEY not set — petition generation will fail.");
  }
});

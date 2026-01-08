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

// CORS
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
      req.rawBody = buf;
    },
  })
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// =====================
// ✅ Redis (Render Redis)
// =====================
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
  console.log("⚠️ REDIS_URL not set — counters disabled");
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

// =====================
// ✅ Admin Session (Option A)
// =====================
const ADMIN_UNLOCK_KEY = process.env.ADMIN_UNLOCK_KEY || "";
const ADMIN_SESSION_TTL_SECONDS = 30 * 60; // 30 mins

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
  }
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

// =====================
// ✅ Config
// =====================
const OVERSIGHT_EMAILS = {
  PCC: process.env.PCC_EMAIL || "",
  NHRC: process.env.NHRC_EMAIL || "",
  FCCPC: process.env.FCCPC_EMAIL || "",
  SERVICOM: process.env.SERVICOM_EMAIL || "",
  AGF: process.env.AGF_EMAIL || "",
};

const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY || "";
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || "https://petitiondesk.com";
const PETITION_PRICE_NGN = Number(process.env.PETITION_PRICE_NGN || 1050);

// In-memory storage
const petitionStore = new Map();
const USED_TX_REFS = new Set();

// Flutterwave helper
async function flwFetch(url, options = {}) {
  if (!FLW_SECRET_KEY) throw new Error("FLW_SECRET_KEY missing");

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

// Paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =====================
// ✅ Utilities
// =====================
function safeUniq(arr) {
  return [...new Set((arr || []).filter(Boolean))];
}

function isEmail(s) {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
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

/**
 * ✅ NEW (for SAN-format addresses):
 * Extract institution addresses ONLY from sector JSON.
 * We never guess. If your JSON doesn't have addresses, none will appear.
 */
function isLikelyAddress(s) {
  if (typeof s !== "string") return false;
  const v = s.trim();
  if (!v) return false;
  if (v.length < 8) return false;
  if (v.includes("@")) return false;
  if (/https?:\/\//i.test(v)) return false;
  // simple signal: address-like tokens
  return /(\bplot\b|\bstreet\b|\broad\b|\bavenue\b|\bclose\b|\bdrive\b|\blane\b|\bway\b|\bphase\b|\bkm\b|\bno\.\b|\bhouse\b|\boffice\b|\bcomplex\b|\babuja\b|\blagos\b|\bnigeria\b|\bstate\b|\bfct\b|\bzip\b|\bpostal\b|\bpo box\b|\bp\.o\.\b)/i.test(
    v
  );
}

function extractAddressesDeep(value, out = [], keyHint = "") {
  if (!value) return out;

  if (typeof value === "string") {
    const v = value.trim();
    // Only accept if the key strongly suggests address OR the text looks like an address
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

function extractSubjectFromPetition(petitionText = "") {
  const m =
    petitionText.match(/^\s*subject\s*:\s*(.+)\s*$/im) ||
    petitionText.match(/^\s*re\s*:\s*(.+)\s*$/im);
  return (m?.[1] || "").trim() || "Petition Regarding Complaint";
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
  // e.g. "Central Bank of Nigeria (CBN)" -> ["CBN"]
  const out = [];
  const re = /\(([A-Z0-9]{2,12})\)/g;
  let m;
  while ((m = re.exec(name)) !== null) out.push(m[1]);
  return out;
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

// =====================
// ✅ Sector detection (kept)
// ✅ ONLY change here: add the 2 new sectors
// =====================
function detectSector(text) {
  const lower = (text || "").toLowerCase();
  const map = {
    power: ["electricity", "nepa", "aedc", "transformer", "power", "disco", "tcn", "nerc"],
    aviation: ["flight", "airport", "airline", "ncaa", "faan", "aviation", "air peace", "airpeace"],
    banking: ["bank", "atm", "pos", "debit", "transfer", "chargeback", "unlawful debit"],
    telecoms: ["airtime", "data", "network", "sim", "telecom", "ncc", "mtn", "airtel", "glo", "9mobile"],
    education: ["school", "university", "waec", "jamb", "nuc", "education", "tetfund"],
    health: ["hospital", "clinic", "doctor", "ncdc", "nhis", "medical", "health"],
    security: ["police", "army", "navy", "airforce", "nscdc", "unlawful arrest", "immigration"],
    judiciary: ["court", "judge", "justice", "supreme", "petition", "magistrate"],
    international_escalation: ["un", "ecowas", "au", "icc", "eu", "international"],

    // ✅ NEW SECTOR 1: anti_corruption
    anti_corruption: [
      "corruption",
      "procurement",
      "contract inflation",
      "kickback",
      "bribe",
      "embezzle",
      "embezzlement",
      "ghost worker",
      "whistleblower",
      "over invoicing",
      "over-invoicing",
      "bpp",
      "bureau of public procurement",
      "efcc",
      "icpc",
      "code of conduct",
      "fraud",
    ],

    // ✅ NEW SECTOR 2: diaspora_report
    diaspora_report: [
      "diaspora",
      "embassy",
      "consulate",
      "deportation",
      "detained abroad",
      "passport seized",
      "trafficking",
      "stranded abroad",
      "migrant",
    ],
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

  // ✅ NEW: map the two new sectors
  if (sector === "anti_corruption") return "anti_corruption";
  if (sector === "diaspora_report") return "diaspora";

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
  const toList = safeUniq(to).filter(isEmail).slice(0, 10).join(",");
  const ccList = safeUniq(cc).filter(isEmail).slice(0, 10).join(",");
  if (!toList) return null;

  const s = encodeURIComponent(subject || "Petition");
  const b = encodeURIComponent(body || "");
  const ccParam = ccList ? `&cc=${encodeURIComponent(ccList)}` : "";
  return `mailto:${toList}?subject=${s}&body=${b}${ccParam}`;
}

// ✅ Option A redirect builder
function buildFrontendRedirectUrl(tx_ref) {
  const base = String(FRONTEND_BASE_URL || "").trim().replace(/\/+$/, "");
  return `${base}/?tx_ref=${encodeURIComponent(tx_ref)}`;
}

// =====================
// ✅ Funnel counters
// =====================
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

// =====================
// ✅ Catalog + Matching (FIXES “TO NOT CAPTURED”)
// ✅ Small addition: store institution addresses from JSON (no guessing)
// =====================
function buildInstitutionCatalog(sectorJson) {
  const items = [];

  function addItem(name, obj) {
    if (!name) return;

    const emails = safeUniq(extractEmailsDeep(obj)).filter(isEmail);

    // ✅ NEW: try to extract addresses (only from JSON)
    const addresses = safeUniq(extractAddressesDeep(obj)).filter(isLikelyAddress);
    const primaryAddress = addresses[0] || "";

    const aliases = safeUniq([
      ...(Array.isArray(obj?.aliases) ? obj.aliases : []),
      ...extractParenAbbr(String(name)),
    ]);

    const norm = normalizeName(name);
    const aliasNorms = safeUniq(aliases.map((a) => normalizeName(a))).filter(Boolean);

    // also add “shortened” variants (helps Airpeace vs Air Peace, PLC/Ltd noise)
    const shortNorm = stripCorporateSuffixes(name);
    const shortAliasNorms = safeUniq([shortNorm, ...aliasNorms.map(stripCorporateSuffixes)]).filter(Boolean);

    items.push({
      name: String(name),
      norm,
      shortNorm,
      aliases,
      aliasNorms,
      shortAliasNorms,
      emails,

      // ✅ NEW fields
      addresses,
      primaryAddress,
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

  // arrays (these keys are what your server expects)
  ["core_institutions", "regulators", "watchdogs", "players"].forEach((key) => {
    if (Array.isArray(sectorJson[key])) {
      sectorJson[key].forEach((inst) => addItem(inst?.name || inst, inst));
    }
  });

  return items;
}

function matchInstitutionNameToCatalog(name, catalog) {
  const q = normalizeName(name);
  const qShort = stripCorporateSuffixes(name);
  if (!q) return null;

  let best = null;
  let bestScore = 0;

  const qTokens = new Set(q.split(" ").filter((w) => w.length > 2));
  const qShortTokens = new Set(qShort.split(" ").filter((w) => w.length > 2));

  for (const item of catalog) {
    if (!item?.norm) continue;

    let score = 0;

    // strongest: exact normalized match
    if (q === item.norm || qShort === item.shortNorm) score += 100;

    // alias match
    if (item.aliasNorms.includes(q) || item.shortAliasNorms.includes(qShort)) score += 90;

    // substring
    if (q.includes(item.norm) || item.norm.includes(q)) score += 40;
    if (qShort && (qShort.includes(item.shortNorm) || item.shortNorm.includes(qShort))) score += 35;

    // token overlap
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

  // threshold to avoid false positives
  if (bestScore < 30) return null;
  return best;
}

function extractSectionInstitutionNames(petitionText, sectionLabel /* "TO" | "CC" */) {
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

    // stop on blank line
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

  // split multiple institutions
  return raw
    .split(/;|,|\s+\band\b\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * ✅ NEW: inject institution addresses into petition text
 * - Uses matched TO/CC institutions
 * - Uses addresses ONLY from JSON catalog (primaryAddress)
 * - Does not affect mailto logic at all
 */
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
    // keep as SAN style block
    toItems.forEach((it, idx) => {
      arr.push(`TO: ${it.name}`);
      if (it.primaryAddress) arr.push(`Address: ${it.primaryAddress}`);
      if (idx < toItems.length - 1) arr.push(""); // spacing
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
      if (!toInjected) {
        out.push(...renderToLines());
        toInjected = true;
      }
      skippingToBlock = true;
      skippingCcBlock = false;
      continue;
    }

    if (isCc) {
      if (!ccInjected) {
        out.push(...renderCcLines());
        ccInjected = true;
      }
      skippingCcBlock = true;
      skippingToBlock = false;
      continue;
    }

    if (isSubject) {
      // stop skipping once subject begins
      skippingToBlock = false;
      skippingCcBlock = false;
      out.push(line);
      continue;
    }

    // while skipping old TO/CC blocks, ignore their lines
    if (skippingToBlock || skippingCcBlock) {
      // ignore blank or any lines in TO/CC block
      if (!line.trim()) continue;
      continue;
    }

    out.push(line);
  }

  return out.join("\n").trim();
}

// =====================
// ✅ Admin endpoints
// =====================
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

// =====================
// ✅ Flutterwave webhook
// =====================
app.post("/flw-webhook", async (req, res) => {
  try {
    const hash = req.headers["verif-hash"];
    if (!hash || hash !== FLW_SECRET_KEY) return res.status(401).end();

    const raw = req.rawBody ? req.rawBody.toString("utf8") : "";
    const payload = raw ? JSON.parse(raw) : req.body;

    if (payload.event === "charge.completed" && payload.data?.status === "successful") {
      const tx_ref = payload.data.tx_ref;
      const amount = Number(payload.data.amount || 0);
      const currency = String(payload.data.currency || "").toUpperCase();

      if (tx_ref?.startsWith("pd_") && amount >= PETITION_PRICE_NGN && currency === "NGN") {
        USED_TX_REFS.add(tx_ref);

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

// =====================
// ✅ Basic endpoints
// =====================
app.post("/track/visit", async (req, res) => {
  await redisIncr(METRICS.visits);
  res.json({ ok: true });
});

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "petitiondesk-backend", time: new Date().toISOString() });
});

// =====================
// ✅ Generate petition
// =====================
app.post("/generate-petition", async (req, res) => {
  const { complaint = "", petitioner = {} } = req.body || {};
  if (!String(complaint).trim()) return res.status(400).json({ error: "Complaint is required" });

  await redisIncr(METRICS.generated);

  const sector = detectSector(complaint);
  if (sector === "unknown") return res.status(400).json({ error: "Could not detect sector" });

  const pName = (petitioner.fullName || "").trim() || "[Your Full Name]";
  const pAddress = (petitioner.address || "").trim() || "[Your Address]";
  const pEmail = (petitioner.email || "").trim() || "[Your Email]";
  const pPhone = (petitioner.phone || "").trim() || "[Phone Number]";

  const autoDate = new Date().toLocaleDateString("en-GB");
  const caseType = inferCaseType(sector);

  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: "OPENAI_API_KEY not configured" });

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
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

TO: [Full official name of primary institution ONLY — DO NOT add emails or phone numbers]
CC: [List relevant oversight/regulatory bodies by name ONLY — DO NOT add emails or phone numbers]

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
- DO NOT invent institution addresses. The system will insert verified institution addresses automatically from a database.
- Keep it professional, firm, evidence-led, and hard to ignore (SAN style).
- Under 950 words.`,
        },
        { role: "user", content: `Complaint: ${complaint}` },
      ],
    });

    let petitionText = completion.choices?.[0]?.message?.content?.trim() || "Generation failed.";
    const subject = extractSubjectFromPetition(petitionText);

    const sectorJson = loadSectorJson(sector);
    const catalog = buildInstitutionCatalog(sectorJson);

    // parse explicit TO and CC sections
    const toNames = extractSectionInstitutionNames(petitionText, "TO");
    const ccNames = extractSectionInstitutionNames(petitionText, "CC");

    const toItems = safeUniq(toNames.map((n) => matchInstitutionNameToCatalog(n, catalog)).filter(Boolean));
    const ccItems = safeUniq(ccNames.map((n) => matchInstitutionNameToCatalog(n, catalog)).filter(Boolean));

    // ✅ NEW: Inject verified addresses (from JSON) into the petition text
    petitionText = injectInstitutionAddressesIntoPetition(petitionText, toItems, ccItems);

    const toEmails = safeUniq(toItems.flatMap((m) => m.emails)).filter(isEmail);
    const ccEmailsFromJson = safeUniq(ccItems.flatMap((m) => m.emails)).filter(isEmail);

    // Admin oversight CC (env vars)
    const adminCC = buildAdminOversightCC({ sector, caseType });
    const finalCC = safeUniq([...ccEmailsFromJson, ...adminCC]).filter(isEmail);

    const tx_ref = `pd_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    petitionStore.set(tx_ref, {
      petition: petitionText,
      sector,
      caseType,
      subject,
      toInstitutions: toItems.map((m) => m.name),
      ccInstitutions: ccItems.map((m) => m.name),
      toEmails,
      ccEmails: finalCC,
      paymentInitializedAt: null,
    });

    await redisIncr(METRICS.previewed);

    const preview = petitionText.length > 600 ? petitionText.substring(0, 600) + "..." : petitionText;

    return res.json({
      needsPayment: true,
      amount: PETITION_PRICE_NGN,
      currency: "NGN",
      tx_ref,
      preview,
    });
  } catch (err) {
    console.error("Generation error:", err);
    return res.status(500).json({ error: "Failed to generate petition" });
  }
});

// =====================
// ✅ Pay initialize
// =====================
app.post("/pay/initialize", async (req, res) => {
  try {
    const { tx_ref, email, name, phone } = req.body || {};
    if (!tx_ref) return res.status(400).json({ ok: false, error: "Missing tx_ref" });

    const stored = petitionStore.get(tx_ref);
    if (!stored) return res.status(404).json({ ok: false, error: "Unknown tx_ref. Generate petition again." });

    stored.paymentInitializedAt = Date.now();
    petitionStore.set(tx_ref, stored);

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

    return res.json({ ok: true, tx_ref, link: data.data.link });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Payment error" });
  }
});

// =====================
// ✅ Unlock petition
// =====================
app.post("/unlock-petition", async (req, res) => {
  try {
    const { tx_ref } = req.body || {};
    if (!tx_ref) return res.status(400).json({ ok: false, error: "Missing tx_ref" });

    const stored = petitionStore.get(tx_ref);
    if (!stored) return res.status(404).json({ ok: false, error: "Petition expired" });

    // ✅ Admin override
    const adminToken = String(req.headers["x-admin-token"] || "");
    const adminOk = await isAdminTokenValid(adminToken);

    if (adminOk) {
      const mailto = buildMailto({
        to: stored.toEmails,
        cc: stored.ccEmails,
        subject: stored.subject,
        body: stored.petition,
      });

      return res.json({
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
      });
    }

    // ✅ Webhook-confirmed
    if (USED_TX_REFS.has(tx_ref)) {
      const mailto = buildMailto({
        to: stored.toEmails,
        cc: stored.ccEmails,
        subject: stored.subject,
        body: stored.petition,
      });

      petitionStore.delete(tx_ref);
      await redisIncr(METRICS.unlockedPaid);

      return res.json({
        ok: true,
        unlocked: true,
        petition: stored.petition,
        sector: stored.sector,
        toInstitutions: stored.toInstitutions,
        ccInstitutions: stored.ccInstitutions,
        to: stored.toEmails,
        cc: stored.ccEmails,
        mailto,
      });
    }

    // ✅ Verify with Flutterwave
    let verifyResponse;
    try {
      verifyResponse = await flwFetch(
        `https://api.flutterwave.com/v3/transactions/verify?tx_ref=${encodeURIComponent(tx_ref)}`
      );
    } catch {
      verifyResponse = { ok: false, status: 0, data: {} };
    }

    // Pending window
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

    USED_TX_REFS.add(tx_ref);
    petitionStore.delete(tx_ref);

    await redisIncr(METRICS.unlockedPaid);

    const mailto = buildMailto({
      to: stored.toEmails,
      cc: stored.ccEmails,
      subject: stored.subject,
      body: stored.petition,
    });

    return res.json({
      ok: true,
      unlocked: true,
      petition: stored.petition,
      sector: stored.sector,
      toInstitutions: stored.toInstitutions,
      ccInstitutions: stored.ccInstitutions,
      to: stored.toEmails,
      cc: stored.ccEmails,
      mailto,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Unlock failed" });
  }
});

// =====================
// ✅ PDF
// =====================
app.get("/download-pdf", (req, res) => {
  try {
    const text = decodeURIComponent(req.query.text || "");
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
    console.error(err);
    res.status(500).send("PDF generation failed");
  }
});

// =====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 PetitionDesk backend running on port ${PORT}`);
  console.log(
    `Webhook URL: ${process.env.RENDER_EXTERNAL_URL || `https://your-app.onrender.com`}/flw-webhook`
  );
});

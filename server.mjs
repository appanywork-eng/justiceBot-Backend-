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

// Allow all origins — no more CORS issues
app.use(cors({ origin: "*" }));

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
    // connect lazily
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
  if (!redis) return false; // admin sessions rely on Redis so they expire correctly
  try {
    const ok = await redis.get(`pd:admin:${token}`);
    return ok === "1";
  } catch {
    return false;
  }
}

// Config
const OVERSIGHT_EMAILS = {
  PCC: process.env.PCC_EMAIL || "",
  NHRC: process.env.NHRC_EMAIL || "",
  FCCPC: process.env.FCCPC_EMAIL || "",
  SERVICOM: process.env.SERVICOM_EMAIL || "",
  AGF: process.env.AGF_EMAIL || "",
};

const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY || "";
// ✅ IMPORTANT: Flutterwave webhook "verif-hash" should match this (set it in Render)
const FLW_WEBHOOK_HASH = process.env.FLW_WEBHOOK_HASH || "";

const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || "https://petitiondesk.com";
const PETITION_PRICE_NGN = Number(process.env.PETITION_PRICE_NGN || 1050);

// In-memory storage (kept as-is to not break working logic)
const petitionStore = new Map();
const USED_TX_REFS = new Set();

// Flutterwave helper
async function flwFetch(url, options = {}) {
  if (!FLW_SECRET_KEY) throw new Error("FLW_SECRET_KEY missing");

  // Node 18+ has global fetch
  if (typeof fetch !== "function") {
    throw new Error("Global fetch not found. Use Node 18+ runtime.");
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

// Paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Utilities
function safeUniq(arr) {
  return [...new Set((arr || []).filter(Boolean))];
}

function isEmail(s) {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

function isLikelyOfficialEmail(email) {
  if (!isEmail(email)) return false;
  const lower = email.toLowerCase();
  // still block obvious junk
  if (lower.startsWith("noreply@") || lower.startsWith("no-reply@")) return false;
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

// ✅ Create acronym: "Nigerian Civil Aviation Authority" -> "NCAA"
function makeAcronym(name = "") {
  const stop = new Set(["of", "and", "the", "for", "to", "in", "on", "at", "by", "with"]);
  const parts = String(name || "")
    .replace(/[()]/g, " ")
    .replace(/[.,]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const letters = parts
    .filter((w) => !stop.has(w.toLowerCase()))
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return letters.length >= 3 ? letters : "";
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

// ✅ YOUR AI SECTOR DETECTOR (kept)
function detectSector(text) {
  const lower = (text || "").toLowerCase();
  const map = {
    power: ["electricity", "nepa", "aedc", "transformer", "power", "disco", "tcn", "nberc"],
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
  const toList = safeUniq(to).filter(isEmail).slice(0, 10).join(",");
  const ccList = safeUniq(cc).filter(isEmail).slice(0, 10).join(",");
  if (!toList) return null;
  const s = encodeURIComponent(subject || "Petition");
  const b = encodeURIComponent(body || "");
  const ccParam = ccList ? `&cc=${encodeURIComponent(ccList)}` : "";
  return `mailto:${toList}?subject=${s}&body=${b}${ccParam}`;
}

/**
 * ✅ Parse TO / CC lines from AI petition.
 * This is the KEY to stop FCCPC becoming TO wrongly.
 */
function parseToCcLines(petitionText = "") {
  const lines = String(petitionText || "")
    .split(/\r?\n/)
    .map((l) => l.trim());

  let toLine = "";
  let ccLine = "";

  for (const l of lines) {
    if (!toLine && /^to\s*:/i.test(l)) toLine = l.replace(/^to\s*:/i, "").trim();
    if (!ccLine && /^cc\s*:/i.test(l)) ccLine = l.replace(/^cc\s*:/i, "").trim();
  }

  const ccItems = ccLine
    ? ccLine.split(/[;,]/).map((s) => s.trim()).filter(Boolean)
    : [];

  return { toLine, ccItems };
}

/**
 * ✅ Catalog now supports aliases/abbr/short_name + auto acronym
 * Your JSON can include: aliases, abbreviations, short_name
 */
function buildInstitutionCatalog(sectorJson) {
  const items = [];

  function collectAliases(name, obj) {
    const a = [];
    const push = (v) => {
      if (!v) return;
      if (typeof v === "string") a.push(v);
      if (Array.isArray(v)) v.forEach((x) => typeof x === "string" && a.push(x));
    };

    push(name);
    push(obj?.name);
    push(obj?.short_name);
    push(obj?.abbreviations);
    push(obj?.abbreviation);
    push(obj?.aliases);
    push(obj?.alias);

    const ac = makeAcronym(name || obj?.name || "");
    if (ac) a.push(ac);

    return safeUniq(a).map(normalizeName).filter(Boolean);
  }

  function addItem(name, obj) {
    if (!name) return;
    const emails = safeUniq(extractEmailsDeep(obj))
      .filter(isEmail)
      .filter(isLikelyOfficialEmail);

    const aliasNorms = collectAliases(name, obj);

    items.push({
      name: String(name),
      norm: normalizeName(name),
      aliasNorms,
      emails,
    });
  }

  if (!sectorJson || typeof sectorJson !== "object") return items;

  if (sectorJson.oversight && typeof sectorJson.oversight === "object") {
    for (const key of Object.keys(sectorJson.oversight)) {
      const node = sectorJson.oversight[key];
      addItem(node?.name || key, node);
    }
  }

  ["core_institutions", "regulators", "watchdogs", "players"].forEach((key) => {
    if (Array.isArray(sectorJson[key])) {
      sectorJson[key].forEach((inst) => addItem(inst?.name || inst, inst));
    }
  });

  return items;
}

/**
 * ✅ Match a single phrase (e.g., "Airpeace Limited", "NCAA") to catalog
 */
function matchInstitutionByPhrase(phrase, catalog) {
  const p = normalizeName(phrase || "");
  if (!p) return [];

  // Strong: exact contains on aliases
  const hits = [];
  for (const item of catalog) {
    if (!item) continue;
    if (item.aliasNorms?.some((a) => a && (p === a || p.includes(a) || a.includes(p)))) {
      hits.push(item);
    }
  }

  // de-dupe by name
  const seen = new Set();
  const out = [];
  for (const h of hits) {
    if (!seen.has(h.name)) {
      seen.add(h.name);
      out.push(h);
    }
  }
  return out;
}

/**
 * ✅ Resolve recipients from petition text using TO/CC lines.
 * This prevents watchdogs from becoming TO by accident.
 */
function resolveRecipientsFromPetition(petitionText, catalog, adminCCEmails) {
  const { toLine, ccItems } = parseToCcLines(petitionText);

  const toMatches = matchInstitutionByPhrase(toLine, catalog);
  const ccMatches = ccItems.flatMap((c) => matchInstitutionByPhrase(c, catalog));

  // ✅ TO emails = ONLY from TO line institutions
  const toEmails = safeUniq(toMatches.flatMap((m) => m.emails))
    .filter(isEmail)
    .filter(isLikelyOfficialEmail);

  // ✅ CC emails = CC line institutions + your oversight CC
  const ccEmailsFromJson = safeUniq(ccMatches.flatMap((m) => m.emails))
    .filter(isEmail)
    .filter(isLikelyOfficialEmail);

  const ccEmails = safeUniq([...(ccEmailsFromJson || []), ...(adminCCEmails || [])]).filter(isEmail);

  const mentionedInstitutions = safeUniq([
    ...toMatches.map((m) => m.name),
    ...ccMatches.map((m) => m.name),
  ]);

  return { toEmails, ccEmails, mentionedInstitutions };
}

// ✅ Option A redirect builder: always return to SAME page with tx_ref
function buildFrontendRedirectUrl(tx_ref) {
  const base = String(FRONTEND_BASE_URL || "").trim().replace(/\/+$/, "");
  return `${base}/?tx_ref=${encodeURIComponent(tx_ref)}`;
}

// =====================
// ✅ Funnel counters helper keys
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
// ✅ Admin endpoints
// =====================

// Create admin session (30 mins)
app.post("/admin/session", async (req, res) => {
  try {
    const key = String(req.body?.key || "");
    if (!ADMIN_UNLOCK_KEY) return res.status(500).json({ ok: false, error: "ADMIN_UNLOCK_KEY not configured" });
    if (!key || key !== ADMIN_UNLOCK_KEY) return res.status(401).json({ ok: false, error: "Invalid admin key" });

    const token = await createAdminSession();
    await redisIncr(METRICS.adminSessions);

    return res.json({
      ok: true,
      token,
      expiresInSeconds: ADMIN_SESSION_TTL_SECONDS,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "Admin session failed" });
  }
});

// Simple admin stats (optional)
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
    const hash = String(req.headers["verif-hash"] || "");

    // ✅ BEST PRACTICE: use FLW_WEBHOOK_HASH. fallback to FLW_SECRET_KEY only if not set.
    const expected = FLW_WEBHOOK_HASH || FLW_SECRET_KEY;

    if (!hash || hash !== expected) {
      return res.status(401).end();
    }

    const raw = req.rawBody ? req.rawBody.toString("utf8") : "";
    const payload = raw ? JSON.parse(raw) : req.body;

    if (payload.event === "charge.completed" && payload.data?.status === "successful") {
      const tx_ref = payload.data.tx_ref;
      const amount = Number(payload.data.amount || 0);
      const currency = String(payload.data.currency || "").toUpperCase();

      if (tx_ref?.startsWith("pd_") && amount >= PETITION_PRICE_NGN && currency === "NGN") {
        USED_TX_REFS.add(tx_ref);

        // ✅ metrics
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
// ✅ Endpoints
// =====================

// Track visits
app.post("/track/visit", async (req, res) => {
  await redisIncr(METRICS.visits);
  res.json({ ok: true });
});

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "petitiondesk-backend", time: new Date().toISOString() });
});

app.post("/generate-petition", async (req, res) => {
  const { complaint = "", petitioner = {} } = req.body || {};
  if (!String(complaint).trim()) return res.status(400).json({ error: "Complaint is required" });

  await redisIncr(METRICS.generated);

  const sector = detectSector(complaint);
  if (sector === "unknown") return res.status(400).json({ error: "Could not detect sector" });

  const pName = petitioner.fullName?.trim() || "[Your Full Name]";
  const pAddress = petitioner.address?.trim() || "[Your Address]"; // ✅ FIXED
  const pEmail = petitioner.email?.trim() || "[Your Email]";
  const pPhone = petitioner.phone?.trim() || "[Phone Number]";

  const autoDate = new Date().toLocaleDateString("en-GB");
  const caseType = inferCaseType(sector);

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY not configured" });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
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

CRITICAL RULES:
- Sector: ${sector} | Case Type: ${caseType}
- NEVER include any email addresses, physical addresses, phone numbers, or contact details in TO, CC, or anywhere in the letter.
- Only mention official institution NAMES.
- Keep the letter professional, factual, and under 800 words.
- The system will automatically add verified contact emails from a trusted database — do NOT guess, invent, or include any contact information yourself.`,
        },
        { role: "user", content: `Complaint: ${complaint}` },
      ],
    });

    const petitionText = completion.choices?.[0]?.message?.content?.trim() || "Generation failed.";
    const subject = extractSubjectFromPetition(petitionText);

    const sectorJson = loadSectorJson(sector);
    const catalog = buildInstitutionCatalog(sectorJson);

    const adminCC = buildAdminOversightCC({ sector, caseType });

    // ✅ IMPORTANT: resolve recipients from TO/CC lines (fixes FCCPC-as-TO bug)
    const { toEmails, ccEmails, mentionedInstitutions } = resolveRecipientsFromPetition(
      petitionText,
      catalog,
      adminCC
    );

    const tx_ref = `pd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    petitionStore.set(tx_ref, {
      petition: petitionText,
      sector,
      caseType,
      subject,
      mentionedInstitutions,
      toEmails, // ✅ now only TO institution emails
      ccEmails, // ✅ CC institution emails + oversight
      paymentInitializedAt: null,
    });

    await redisIncr(METRICS.previewed);

    const preview = petitionText.length > 600 ? petitionText.substring(0, 600) + "..." : petitionText;

    res.json({
      needsPayment: true,
      amount: PETITION_PRICE_NGN,
      currency: "NGN",
      tx_ref,
      preview,
      // helpful debug info for frontend (optional)
      recipients: { to: toEmails, cc: ccEmails },
    });
  } catch (err) {
    console.error("Generation error:", err);
    res.status(500).json({ error: "Failed to generate petition" });
  }
});

app.post("/pay/initialize", async (req, res) => {
  try {
    const { tx_ref, email, name, phone } = req.body || {};
    if (!tx_ref) return res.status(400).json({ ok: false, error: "Missing tx_ref" });

    const stored = petitionStore.get(tx_ref);
    if (!stored) {
      return res.status(404).json({ ok: false, error: "Unknown tx_ref. Generate petition again." });
    }

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

    res.json({ ok: true, tx_ref, link: data.data.link });
  } catch (err) {
    console.error("pay/initialize error:", err);
    res.status(500).json({ ok: false, error: "Payment error" });
  }
});

app.post("/unlock-petition", async (req, res) => {
  try {
    const { tx_ref } = req.body || {};
    if (!tx_ref) return res.status(400).json({ ok: false, error: "Missing tx_ref" });

    const stored = petitionStore.get(tx_ref);
    if (!stored) return res.status(404).json({ ok: false, error: "Petition expired" });

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
        mentionedInstitutions: stored.mentionedInstitutions,
        to: stored.toEmails,
        cc: stored.ccEmails,
        mailto,
      });
    }

    if (USED_TX_REFS.has(tx_ref)) {
      const mailto = buildMailto({
        to: stored.toEmails,
        cc: stored.ccEmails,
        subject: stored.subject,
        body: stored.petition,
      });

      USED_TX_REFS.add(tx_ref);
      petitionStore.delete(tx_ref);

      await redisIncr(METRICS.unlockedPaid);

      return res.json({
        ok: true,
        unlocked: true,
        petition: stored.petition,
        sector: stored.sector,
        mentionedInstitutions: stored.mentionedInstitutions,
        to: stored.toEmails,
        cc: stored.ccEmails,
        mailto,
      });
    }

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
      mentionedInstitutions: stored.mentionedInstitutions,
      to: stored.toEmails,
      cc: stored.ccEmails,
      mailto,
    });
  } catch (err) {
    console.error("unlock error:", err);
    res.status(500).json({ ok: false, error: "Unlock failed" });
  }
});

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 PetitionDesk backend running on port ${PORT}`);
  console.log(
    `Webhook URL: ${process.env.RENDER_EXTERNAL_URL || `https://your-app.onrender.com`}/flw-webhook`
  );
});

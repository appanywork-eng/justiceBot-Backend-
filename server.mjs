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
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || "https://petitiondesk.com";
const PETITION_PRICE_NGN = Number(process.env.PETITION_PRICE_NGN || 1050);

// In-memory storage (kept as-is to not break working logic)
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
  const badDomains = [
    "gmail.com",
    "yahoo.com",
    "hotmail.com",
    "outlook.com",
    "live.com",
    "aol.com",
    "proton.me",
    "protonmail.com",
  ];
  const domain = lower.split("@")[1] || "";
  if (badDomains.includes(domain)) return false;
  if (lower.startsWith("noreply@") || lower.startsWith("no-reply@")) return false;
  return true;
}

function extractEmailsDeep(value, out = []) {
  if (!value) return out;
  if (typeof value === "string" && isEmail(value.trim())) out.push(value.trim());
  if (Array.isArray(value)) value.forEach((v) => extractEmailsDeep(v, out));
  if (typeof value === "object" && value !== null) {
    Object.values(value).forEach((v) => extractEmailsDeep(v, out));
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

function loadSectorJson(sector) {
  const filePath = path.join(__dirname, "data", `${sector}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

// ✅ YOUR SECTOR DETECTOR (kept)
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

function buildInstitutionCatalog(sectorJson) {
  const items = [];
  function addItem(name, obj, isPrimary = false) {
    if (!name) return;
    const emails = safeUniq(extractEmailsDeep(obj)).filter(isLikelyOfficialEmail);
    const primaryNorm = normalizeName(name);
    const aliasNorms = Array.isArray(obj?.aliases)
      ? safeUniq(obj.aliases.map(normalizeName)).filter(n => n && n !== primaryNorm)
      : [];
    items.push({ name: String(name), norm: primaryNorm, aliasNorms, emails, isPrimary });
  }
  if (!sectorJson || typeof sectorJson !== "object") return items;

  const currentSector = (sectorJson.sector || "").toLowerCase();

  if (sectorJson.oversight && typeof sectorJson.oversight === "object") {
    for (const key of Object.keys(sectorJson.oversight)) {
      const node = sectorJson.oversight[key];
      addItem(node?.name || key, node, false);
    }
  }

  ["core_institutions", "regulators", "watchdogs", "players"].forEach((key) => {
    if (Array.isArray(sectorJson[key])) {
      sectorJson[key].forEach((inst) => addItem(inst?.name || inst, inst, false));
    }
  });

  // Sector-specific primary entities
  if (currentSector === "aviation" && Array.isArray(sectorJson.airlines_operating_in_nigeria?.domestic_scheduled_airlines)) {
    sectorJson.airlines_operating_in_nigeria.domestic_scheduled_airlines.forEach((inst) => addItem(inst?.name || inst, inst, true));
  }

  if (currentSector === "banking" && Array.isArray(sectorJson.banks)) {
    sectorJson.banks.forEach((inst) => addItem(inst?.name || inst, inst, true));
  }

  if (currentSector === "telecoms" && Array.isArray(sectorJson.major_operators?.mobile_network_operators)) {
    sectorJson.major_operators.mobile_network_operators.forEach((inst) => addItem(inst?.name || inst, inst, true));
  }

  if (currentSector === "power" && Array.isArray(sectorJson.discos)) {
    sectorJson.discos.forEach((inst) => addItem(inst?.name || inst, inst, true));
  }
  if (currentSector === "power" && Array.isArray(sectorJson.gencos)) {
    sectorJson.gencos.forEach((inst) => addItem(inst?.name || inst, inst, true));
  }

  if (currentSector === "health" && Array.isArray(sectorJson.hospitals)) {
    sectorJson.hospitals.forEach((inst) => addItem(inst?.name || inst, inst, true));
  }
  if (currentSector === "health" && Array.isArray(sectorJson.providers)) {
    sectorJson.providers.forEach((inst) => addItem(inst?.name || inst, inst, true));
  }

  if (currentSector === "education" && Array.isArray(sectorJson.universities)) {
    sectorJson.universities.forEach((inst) => addItem(inst?.name || inst, inst, true));
  }
  if (currentSector === "education" && Array.isArray(sectorJson.schools)) {
    sectorJson.schools.forEach((inst) => addItem(inst?.name || inst, inst, true));
  }

  if (currentSector === "judiciary" && Array.isArray(sectorJson.courts)) {
    sectorJson.courts.forEach((inst) => addItem(inst?.name || inst, inst, true));
  }

  if (currentSector === "security" && Array.isArray(sectorJson.forces)) {
    sectorJson.forces.forEach((inst) => addItem(inst?.name || inst, inst, true));
  }
  if (currentSector === "security" && Array.isArray(sectorJson.police_commands)) {
    sectorJson.police_commands.forEach((inst) => addItem(inst?.name || inst, inst, true));
  }

  if (currentSector === "international_escalation" && Array.isArray(sectorJson.organizations)) {
    sectorJson.organizations.forEach((inst) => addItem(inst?.name || inst, inst, true));
  }

  return items;
}

function findMentionedInstitutions(petitionText, catalog) {
  const textNorm = normalizeName(petitionText);
  const mentionedSet = new Set();

  for (const item of catalog) {
    const matchesPrimary = item?.norm && textNorm.includes(item.norm);
    const matchesAlias = item.aliasNorms?.some(aliasNorm => aliasNorm && textNorm.includes(aliasNorm));
    if (matchesPrimary || matchesAlias) {
      mentionedSet.add(item);
    }
  }

  const raw = (petitionText || "").toLowerCase();
  if (raw.includes("police")) {
    const policeItems = catalog.filter(
      (c) =>
        c.norm.includes("police") ||
        c.norm.includes("nigeria police") ||
        c.norm.includes("police service commission") ||
        c.norm.includes("ministry of police") ||
        (c.aliasNorms && c.aliasNorms.some(a => a.includes("police")))
    );
    policeItems.forEach(p => mentionedSet.add(p));
  }

  return Array.from(mentionedSet);
}

// === NEW: Extract TO/CC institution names from AI draft ===
function extractIntentInstitutions(petitionText) {
  const lines = petitionText.split("\n");
  let toNames = [];
  let ccNames = [];

  let current = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^TO:/i.test(trimmed)) {
      current = "to";
      toNames.push(trimmed.replace(/^TO:\s*/i, "").trim());
    } else if (/^CC:/i.test(trimmed)) {
      current = "cc";
      ccNames.push(trimmed.replace(/^CC:\s*/i, "").trim());
    } else if (current && trimmed) {
      // Multi-line continuation
      if (current === "to") toNames[toNames.length - 1] += " " + trimmed;
      if (current === "cc") ccNames[ccNames.length - 1] += " " + trimmed;
    }
  }

  // Clean and dedup
  toNames = safeUniq(toNames.map(n => n.replace(/\[.*?\]/g, "").trim()).filter(Boolean));
  ccNames = safeUniq(ccNames.map(n => n.replace(/\[.*?\]/g, "").trim()).filter(Boolean));

  return { toNames, ccNames };
}

// === NEW: Map extracted names to catalog items ===
function mapNamesToCatalogItems(names, catalog) {
  const matched = [];
  const seen = new Set();

  for (const name of names) {
    const norm = normalizeName(name);
    for (const item of catalog) {
      if (seen.has(item.norm)) continue;
      const matchesPrimary = item.norm === norm || (item.norm && norm.includes(item.norm));
      const matchesAlias = item.aliasNorms?.some(a => a === norm || norm.includes(a));
      if (matchesPrimary || matchesAlias) {
        matched.push(item);
        seen.add(item.norm);
        break; // best match
      }
    }
  }
  return matched;
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
// ✅ HYBRID SECTOR VALIDATION (PATCH)
// AI validates meaning; your rule-detector is the guard rail.
// =====================
const ALLOWED_SECTORS = [
  "power",
  "aviation",
  "banking",
  "telecoms",
  "education",
  "health",
  "security",
  "judiciary",
  "international_escalation",
];

async function aiDetectSector(complaint) {
  try {
    const r = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            `Classify this complaint into exactly ONE sector from: ${ALLOWED_SECTORS.join(
              ", "
            )}. Respond with ONLY the sector name.`,
        },
        { role: "user", content: String(complaint || "") },
      ],
      temperature: 0,
    });

    const raw = String(r.choices?.[0]?.message?.content || "").trim().toLowerCase();
    return ALLOWED_SECTORS.includes(raw) ? raw : "unknown";
  } catch {
    return "unknown";
  }
}

async function detectSectorHybrid(complaint) {
  const ruleSector = detectSector(complaint);
  const aiSector = await aiDetectSector(complaint);

  if (ruleSector !== "unknown" && aiSector !== "unknown" && ruleSector === aiSector) {
    return ruleSector;
  }

  if (ruleSector !== "unknown") return ruleSector;

  if (aiSector !== "unknown") return aiSector;

  return "unknown";
}

// =====================
// ✅ OPTION B: AI institution-name fallback (PATCH)
// =====================
function pickTopUnique(arr = [], limit = 6) {
  const out = [];
  const seen = new Set();
  for (const x of arr) {
    const v = String(x || "").trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= limit) break;
  }
  return out;
}

async function aiPickInstitutionsFromCatalog({ complaint, petitionText, catalogNames }) {
  if (!Array.isArray(catalogNames) || catalogNames.length === 0) return [];

  const names = catalogNames.slice(0, 120);

  try {
    const r = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You are helping route a Nigerian petition to the correct institutions. " +
            "You will be given a complaint, a drafted petition, and a list of institution NAMES. " +
            "Select the best matching institutions from the list ONLY. " +
            "Return ONLY a JSON array of institution names (strings). No extra text.",
        },
        {
          role: "user",
          content: JSON.stringify(
            {
              complaint: String(complaint || "").slice(0, 1500),
              petition_excerpt: String(petitionText || "").slice(0, 1800),
              institution_names: names,
              instruction:
                "Pick 3 to 6 institutions that should receive the petition (most relevant first). Use exact names from the list.",
            },
            null,
            2
          ),
        },
      ],
    });

    const raw = String(r.choices?.[0]?.message?.content || "").trim();

    let parsed = [];
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw
        .split("\n")
        .map((x) => x.replace(/^[-*\d.\s"]+|"+$/g, "").trim())
        .filter(Boolean);
    }

    if (!Array.isArray(parsed)) return [];
    return pickTopUnique(parsed, 6);
  } catch {
    return [];
  }
}

function mapAiNamesToCatalogItems(aiNames, catalog) {
  const byNorm = new Map();
  for (const item of catalog || []) {
    if (item?.norm) byNorm.set(item.norm, item);
    if (item.aliasNorms) {
      for (const an of item.aliasNorms) {
        if (an) byNorm.set(an, item);
      }
    }
  }

  const out = [];
  const seen = new Set();
  for (const name of aiNames || []) {
    const norm = normalizeName(name);
    const hit = byNorm.get(norm);
    if (hit && !seen.has(hit.norm)) {
      seen.add(hit.norm);
      out.push(hit);
    }
  }
  return out;
}

// =====================
// ✅ Admin endpoints / webhook / other endpoints unchanged (same as before)
// =====================

// ... (keep all admin, webhook, track/visit, health, pay/initialize, unlock-petition, download-pdf exactly as in previous version)

// =====================
// ✅ generate-petition (with new intent-based routing)
// =====================
app.post("/generate-petition", async (req, res) => {
  const { complaint = "", petitioner = {} } = req.body;
  if (!complaint.trim()) return res.status(400).json({ error: "Complaint is required" });

  await redisIncr(METRICS.generated);

  const sector = await detectSectorHybrid(complaint);
  if (sector === "unknown") return res.status(400).json({ error: "Could not detect sector" });

  const pName = petitioner.fullName?.trim() || "[Your Full Name]";
  const pAddress = petitioner.address?.trim() || "[Your Address]";
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
          content: `Draft a professional Nigerian petition letter.
MANDATORY FORMAT:
Date: ${autoDate}
PETITIONER DETAILS:
Name: ${pName}
Address: ${pAddress}
Email: ${pEmail}
Phone: ${pPhone}

TO: [Primary institution]
CC: [Oversight bodies]

SUBJECT: [Clear subject]

FACTS: [Numbered]

LEGAL FRAMEWORK: [Relevant laws]

RELIEFS SOUGHT: [Numbered]

SIGNATURE:
${pName}
${pPhone}

Sector: ${sector} | Case: ${caseType}`,
        },
        { role: "user", content: `Complaint: ${complaint}` },
      ],
    });

    const petitionText = completion.choices?.[0]?.message?.content?.trim() || "Generation failed.";
    const subject = extractSubjectFromPetition(petitionText);

    const sectorJson = loadSectorJson(sector);
    const catalog = buildInstitutionCatalog(sectorJson);

    // === NEW: Primary routing from AI draft intent ===
    const { toNames, ccNames } = extractIntentInstitutions(petitionText);

    let toItems = mapNamesToCatalogItems(toNames, catalog);
    let ccItems = mapNamesToCatalogItems(ccNames, catalog);

    let toEmails = safeUniq(toItems.flatMap(m => m.emails)).filter(isLikelyOfficialEmail);
    let ccEmails = safeUniq(ccItems.flatMap(m => m.emails)).filter(isLikelyOfficialEmail);

    // Always add admin oversight to CC
    const adminCC = buildAdminOversightCC({ sector, caseType });
    ccEmails = safeUniq([...ccEmails, ...adminCC]);

    // === Fallback if draft parsing failed (rare) ===
    if (toEmails.length === 0 && ccEmails.length === 0) {
      // Use string matching as backup
      const mentioned = findMentionedInstitutions(petitionText, catalog);
      const primaryMentioned = mentioned.filter(item => item.isPrimary);
      const nonPrimaryMentioned = mentioned.filter(item => !item.isPrimary);

      toEmails = safeUniq(primaryMentioned.flatMap(m => m.emails)).filter(isLikelyOfficialEmail);
      ccEmails = safeUniq(nonPrimaryMentioned.flatMap(m => m.emails)).filter(isLikelyOfficialEmail);
      ccEmails = safeUniq([...ccEmails, ...adminCC]);

      if (toEmails.length === 0 && nonPrimaryMentioned.length > 0) {
        toEmails = safeUniq(nonPrimaryMentioned.flatMap(m => m.emails)).filter(isLikelyOfficialEmail);
      }
    }

    // === AI fallback if still nothing ===
    if (toEmails.length === 0 && ccEmails.length === 0 && catalog.length > 0) {
      const catalogNames = catalog.map((x) => x.name).filter(Boolean);
      const aiNames = await aiPickInstitutionsFromCatalog({ complaint, petitionText, catalogNames });
      if (aiNames.length > 0) {
        const aiItems = mapAiNamesToCatalogItems(aiNames, catalog);
        if (aiItems.length > 0) {
          const aiPrimary = aiItems.filter(item => item.isPrimary);
          const aiNonPrimary = aiItems.filter(item => !item.isPrimary);

          toEmails = safeUniq(aiPrimary.flatMap(m => m.emails)).filter(isLikelyOfficialEmail);
          ccEmails = safeUniq(aiNonPrimary.flatMap(m => m.emails)).filter(isLikelyOfficialEmail);
          ccEmails = safeUniq([...ccEmails, ...adminCC]);

          if (toEmails.length === 0 && aiNonPrimary.length > 0) {
            toEmails = safeUniq(aiNonPrimary.flatMap(m => m.emails)).filter(isLikelyOfficialEmail);
          }
        }
      }
    }

    const mentionedInstitutions = [...toItems, ...ccItems].map(m => m.name);

    const tx_ref = `pd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    petitionStore.set(tx_ref, {
      petition: petitionText,
      sector,
      caseType,
      subject,
      mentionedInstitutions: safeUniq(mentionedInstitutions),

      toEmails,
      ccEmails,

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
    });
  } catch (err) {
    console.error("Generation error:", err);
    res.status(500).json({ error: "Failed to generate petition" });
  }
});

// ... (rest of file unchanged: pay/initialize, unlock-petition, download-pdf, listen)

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 PetitionDesk backend running on port ${PORT}`);
  console.log(
    `Webhook URL: ${process.env.RENDER_EXTERNAL_URL || `https://your-app.onrender.com`}/flw-webhook`
  );
});

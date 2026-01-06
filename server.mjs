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

app.use(cors({ origin: "*" }));

app.use(
  express.json({
    limit: "5mb",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// METRICS
const METRICS = {
  generated: "pd:metrics:generated",
  previewed: "pd:metrics:previewed",
  paid_attempts: "pd:metrics:paid_attempts",
  paid_success: "pd:metrics:paid_success",
  downloaded: "pd:metrics:downloaded",
};

// Redis (optional)
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
}

async function redisIncr(key) {
  if (!redis) return;
  try {
    await redis.incr(key);
  } catch {}
}

// Admin (Redis + in-memory fallback)
const ADMIN_UNLOCK_KEY = process.env.ADMIN_UNLOCK_KEY || "";
const ADMIN_SESSION_TTL_SECONDS = 30 * 60;
const adminTokens = new Set();

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
    adminTokens.add(token);
    setTimeout(() => adminTokens.delete(token), ADMIN_SESSION_TTL_SECONDS * 1000);
  }
  return token;
}

async function isAdminTokenValid(token) {
  if (!token) return false;
  if (redis) {
    try {
      const ok = await redis.get(`pd:admin:${token}`);
      return ok === "1";
    } catch {
      return false;
    }
  }
  return adminTokens.has(token);
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
const FLW_SECRET_HASH = process.env.FLW_WEBHOOK_SECRET_HASH || FLW_SECRET_KEY;
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || "https://petitiondesk.com";
const PETITION_PRICE_NGN = Number(process.env.PETITION_PRICE_NGN || 1050);

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

// Utilities
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function safeUniq(arr) {
  return [...new Set((arr || []).filter(Boolean))];
}

function isEmail(s) {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

function isLikelyOfficialEmail(email) {
  if (!isEmail(email)) return false;
  const lower = email.toLowerCase();
  const badDomains = ["gmail.com","yahoo.com","hotmail.com","outlook.com","live.com","aol.com","proton.me","protonmail.com"];
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
  } catch (e) {
    console.error(`Error loading ${sector}.json:`, e.message);
    return null;
  }
}

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

async function detectSectorHybrid(text) {
  return detectSector(text);
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

  if (currentSector === "aviation" && Array.isArray(sectorJson.airlines_operating_in_nigeria?.domestic_scheduled_airlines)) {
    sectorJson.airlines_operating_in_nigeria.domestic_scheduled_airlines.forEach((inst) => addItem(inst?.name || inst, inst, true));
  }

  if (currentSector === "banking" && Array.isArray(sectorJson.banks)) {
    sectorJson.banks.forEach((inst) => addItem(inst?.name || inst, inst, true));
  }

  if (currentSector === "telecoms" && Array.isArray(sectorJson.major_operators?.mobile_network_operators)) {
    sectorJson.major_operators.mobile_network_operators.forEach((inst) => addItem(inst?.name || inst, inst, true));
  }

  return items;
}

function findMentionedInstitutions(petitionText, catalog) {
  const textNorm = normalizeName(petitionText);
  const mentioned = [];

  for (const item of catalog) {
    if (!item?.norm) continue;

    if (textNorm.includes(item.norm) || item.aliasNorms?.some(a => textNorm.includes(a))) {
      mentioned.push(item);
      continue;
    }

    const parts = item.norm.split(" ").filter(p => p.length >= 4);
    const hits = parts.filter(p => textNorm.includes(p));
    if (hits.length >= Math.max(1, Math.floor(parts.length / 2))) {
      mentioned.push(item);
    }
  }

  const raw = (petitionText || "").toLowerCase();
  if (raw.includes("police")) {
    mentioned.push(...catalog.filter(c => c.norm.includes("police") || c.aliasNorms?.some(a => a.includes("police"))));
  }

  return safeUniq(mentioned);
}

async function aiPickInstitutionsFromCatalog({ complaint, petitionText, catalogNames }) {
  if (!process.env.OPENAI_API_KEY || catalogNames.length === 0) return [];

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: `You are an expert in Nigerian institutions. Return ONLY the exact names from this list that should receive the petition (TO or CC) as a JSON array of strings. If none, return [].\n\nList:\n${catalogNames.join("\n")}`,
        },
        { role: "user", content: `Complaint: ${complaint}\n\nPetition:\n${petitionText}` },
      ],
    });

    const text = completion.choices?.[0]?.message?.content?.trim() || "[]";
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = []; }
    return Array.isArray(parsed) ? parsed.filter(n => typeof n === "string" && n.trim()) : [];
  } catch (e) {
    console.error("AI institution picker error:", e.message);
    return [];
  }
}

function mapAiNamesToCatalogItems(aiNames, catalog) {
  const normMap = new Map();
  for (const item of catalog) {
    if (item.norm) normMap.set(item.norm, item);
    for (const alias of item.aliasNorms || []) normMap.set(alias, item);
  }

  const result = [];
  for (const name of aiNames) {
    const norm = normalizeName(name);
    const item = normMap.get(norm);
    if (item && !result.includes(item)) result.push(item);
  }
  return result;
}

// /admin-unlock
app.post("/admin-unlock", async (req, res) => {
  const { key } = req.body;
  if (!key || key !== ADMIN_UNLOCK_KEY) {
    return res.status(401).json({ error: "Invalid admin key" });
  }

  const token = await createAdminSession();
  res.json({ success: true, token });
});

// /generate-petition — FULLY FIXED
app.post("/generate-petition", async (req, res) => {
  try {
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

    let mentioned = findMentionedInstitutions(petitionText, catalog);

    let primary = mentioned.filter(i => i.isPrimary);
    let nonPrimary = mentioned.filter(i => !i.isPrimary);

    let toEmails = safeUniq(primary.flatMap(m => m.emails)).filter(isLikelyOfficialEmail);
    let ccEmails = safeUniq(nonPrimary.flatMap(m => m.emails)).filter(isLikelyOfficialEmail);

    ccEmails = safeUniq([...ccEmails, ...buildAdminOversightCC({ sector, caseType })]);

    if (toEmails.length === 0 && nonPrimary.length > 0) {
      toEmails = safeUniq(nonPrimary.flatMap(m => m.emails)).filter(isLikelyOfficialEmail);
    }

    if (mentioned.length === 0 && catalog.length > 0) {
      const catalogNames = catalog.map(x => x.name).filter(Boolean);
      const aiNames = await aiPickInstitutionsFromCatalog({ complaint, petitionText, catalogNames });
      if (aiNames.length > 0) {
        const aiItems = mapAiNamesToCatalogItems(aiNames, catalog);
        if (aiItems.length > 0) {
          mentioned = aiItems;
          primary = aiItems.filter(i => i.isPrimary);
          nonPrimary = aiItems.filter(i => !i.isPrimary);
          toEmails = safeUniq(primary.flatMap(m => m.emails)).filter(isLikelyOfficialEmail);
          ccEmails = safeUniq(nonPrimary.flatMap(m => m.emails)).filter(isLikelyOfficialEmail);
          ccEmails = safeUniq([...ccEmails, ...buildAdminOversightCC({ sector, caseType })]);
          if (toEmails.length === 0 && nonPrimary.length > 0) {
            toEmails = safeUniq(nonPrimary.flatMap(m => m.emails)).filter(isLikelyOfficialEmail);
          }
        }
      }
    }

    const tx_ref = `pd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    petitionStore.set(tx_ref, {
      petition: petitionText,
      sector,
      caseType,
      subject,
      mentionedInstitutions: mentioned.map(m => m.name),
      toEmails,
      ccEmails,
      paymentInitializedAt: null,
      paid: false,
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

// /initiate-payment — phone_number optional
app.post("/initiate-payment", async (req, res) => {
  const { tx_ref, customer = {} } = req.body;

  if (!tx_ref?.trim()) {
    return res.status(400).json({ error: "tx_ref is required" });
  }

  const petitionData = petitionStore.get(tx_ref);
  if (!petitionData) {
    return res.status(404).json({ error: "Petition session not found or expired" });
  }

  if (USED_TX_REFS.has(tx_ref)) {
    return res.status(400).json({ error: "This transaction reference has already been used" });
  }

  if (petitionData.paymentInitializedAt) {
    return res.status(400).json({ error: "Payment already initialized for this petition" });
  }

  const customerEmail = customer.email?.trim();
  const customerPhone = customer.phone?.trim();
  const customerName = customer.name?.trim() || "PetitionDesk User";

  if (!customerEmail || !isEmail(customerEmail)) {
    return res.status(400).json({ error: "Valid customer email is required" });
  }

  const customerObj = {
    email: customerEmail,
    name: customerName,
  };
  if (customerPhone) {
    customerObj.phone_number = customerPhone;
  }

  const payload = {
    tx_ref,
    amount: PETITION_PRICE_NGN,
    currency: "NGN",
    redirect_url: `${FRONTEND_BASE_URL}/payment-success?tx_ref=${tx_ref}`,
    payment_options: "card,mobilemoney,ussd,banktransfer",
    meta: {
      petition_tx_ref: tx_ref,
      sector: petitionData.sector,
    },
    customer: customerObj,
    customizations: {
      title: "PetitionDesk - Unlock Your Petition",
      description: "Payment to access full petition and delivery options",
      logo: "https://petitiondesk.com/logo.png",
    },
  };

  try {
    const { ok, status, data } = await flwFetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (!ok || data.status !== "success") {
      console.error("Flutterwave init failed:", data);
      return res.status(502).json({ error: "Payment initialization failed. Please try again." });
    }

    petitionData.paymentInitializedAt = Date.now();
    petitionStore.set(tx_ref, petitionData);

    await redisIncr(METRICS.paid_attempts);

    res.json({
      success: true,
      payment_link: data.data.link,
      tx_ref,
    });
  } catch (err) {
    console.error("Payment init error:", err);
    res.status(500).json({ error: "Internal server error during payment setup" });
  }
});

// /flw-webhook
app.post("/flw-webhook", async (req, res) => {
  const signature = req.headers["verif-hash"];
  if (!signature || signature !== FLW_SECRET_HASH) {
    console.warn("Invalid webhook signature");
    return res.status(401).send("Unauthorized");
  }

  const payload = req.body;

  if (payload.event !== "charge.completed" || payload.data.status !== "successful") {
    return res.status(200).send("Ignored");
  }

  const tx_ref = payload.data.tx_ref;
  const amount = payload.data.amount;
  const currency = payload.data.currency;

  if (currency !== "NGN" || amount !== PETITION_PRICE_NGN) {
    return res.status(200).send("Ignored");
  }

  const petitionData = petitionStore.get(tx_ref);
  if (!petitionData || petitionData.paid) {
    return res.status(200).send("Already processed or not found");
  }

  petitionData.paid = true;
  petitionData.paymentDate = new Date().toISOString();
  petitionData.flw_ref = payload.data.flw_ref;
  petitionStore.set(tx_ref, petitionData);
  USED_TX_REFS.add(tx_ref);

  await redisIncr(METRICS.paid_success);

  res.status(200).send("OK");
});

// /download-pdf/:tx_ref
app.get("/download-pdf/:tx_ref", async (req, res) => {
  const { tx_ref } = req.params;

  if (!tx_ref) {
    return res.status(400).json({ error: "tx_ref is required" });
  }

  const petitionData = petitionStore.get(tx_ref);
  if (!petitionData) {
    return res.status(404).json({ error: "Petition not found or expired" });
  }

  if (!petitionData.paid) {
    return res.status(402).json({ error: "Payment required to download PDF" });
  }

  try {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Petition_${tx_ref}.pdf"`);

    const doc = new PDFDocument({ size: "A4", margin: 50 });
    doc.pipe(res);

    doc.fontSize(20).text("PETITION LETTER", { align: "center" });
    doc.moveDown(2);

    const lines = petitionData.petition.split("\n");
    for (const line of lines) {
      if (line.trim() === "") doc.moveDown();
      else doc.fontSize(12).text(line);
    }

    doc.moveDown(3);
    doc.fontSize(10).text(`Generated by PetitionDesk • ${new Date().toLocaleDateString("en-GB")}`, { align: "center" });

    doc.end();

    await redisIncr(METRICS.downloaded);
  } catch (err) {
    console.error("PDF generation error:", err);
    res.status(500).json({ error: "Failed to generate PDF" });
  }
});

// Server start
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`PetitionDesk backend running on port ${PORT}`);
  console.log(`Webhook URL: ${process.env.RENDER_EXTERNAL_URL || "https://your-app.onrender.com"}/flw-webhook`);
});

import express from "express";
import cors from "cors";
import OpenAI from "openai";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import PDFDocument from "pdfkit";

dotenv.config();

const app = express();

/* ============================================================
   ENV
============================================================ */
const {
  OPENAI_API_KEY = "",
  FLW_SECRET_KEY = "",
  FRONTEND_BASE_URL = "http://localhost:5173",
  ALLOWED_ORIGINS = "http://localhost:5173",
  PETITION_PRICE_NGN = "1050",

  // Oversight
  PCC_EMAIL = "", // set on Render
  NHRC_EMAIL = "",
  FCCPC_EMAIL = "",
  SERVICOM_EMAIL = "",
  AGF_EMAIL = "",
} = process.env;

if (!OPENAI_API_KEY) console.warn("⚠️ OPENAI_API_KEY missing");
if (!FLW_SECRET_KEY) console.warn("⚠️ FLW_SECRET_KEY missing");

const PRICE_NGN = Number(PETITION_PRICE_NGN) || 1050;

/* ============================================================
   PATHS
============================================================ */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ============================================================
   CORS (PRODUCTION SAFE: NEVER THROW)
============================================================ */
const allowedOrigins = new Set(
  String(ALLOWED_ORIGINS)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

app.use(
  cors({
    origin(origin, cb) {
      // allow server-to-server, health checks, some mobile webviews
      if (!origin) return cb(null, true);

      if (allowedOrigins.has(origin)) return cb(null, true);

      // IMPORTANT: do not throw -> prevents browser “Failed to fetch”
      console.warn("CORS blocked:", origin);
      return cb(null, false);
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.options("*", cors());
app.use(express.json({ limit: "5mb" }));

/* ============================================================
   OPENAI
============================================================ */
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

/* ============================================================
   FLUTTERWAVE HELPERS
============================================================ */
async function flwFetch(url, options = {}) {
  if (!FLW_SECRET_KEY) throw new Error("FLW_SECRET_KEY missing");
  if (typeof fetch !== "function") throw new Error("Global fetch not available. Use Node 18+.");

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

/* ============================================================
   UTIL
============================================================ */
function safeUniq(arr) {
  return [...new Set((arr || []).filter(Boolean))];
}

function isEmail(s) {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function isLikelyOfficialEmail(email) {
  if (!isEmail(email)) return false;
  const lower = email.toLowerCase();
  const badDomains = new Set([
    "gmail.com",
    "yahoo.com",
    "hotmail.com",
    "outlook.com",
    "live.com",
    "aol.com",
    "proton.me",
    "protonmail.com",
  ]);
  const domain = lower.split("@")[1] || "";
  if (badDomains.has(domain)) return false;
  if (lower.startsWith("noreply@") || lower.startsWith("no-reply@")) return false;
  return true;
}

function extractEmailsDeep(value, out = []) {
  if (!value) return out;

  if (typeof value === "string") {
    const s = value.trim();
    const matches = s.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
    matches.forEach((m) => out.push(m.trim()));
    if (isEmail(s)) out.push(s);
  } else if (Array.isArray(value)) {
    value.forEach((v) => extractEmailsDeep(v, out));
  } else if (typeof value === "object") {
    Object.values(value).forEach((v) => extractEmailsDeep(v, out));
  }
  return out;
}

function extractSubjectFromPetition(petitionText = "") {
  const m =
    petitionText.match(/^\s*subject\s*:\s*(.+)\s*$/im) ||
    petitionText.match(/^\s*re\s*:\s*(.+)\s*$/im);
  return (m?.[1] || "").trim();
}

function normalizeName(s = "") {
  return String(s)
    .toLowerCase()
    .replace(/[\u2019’]/g, "'")
    .replace(/[^a-z0-9\s().,&/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ============================================================
   SECTOR JSON LOADING
============================================================ */
function loadSectorJson(sector) {
  try {
    const filePath = path.join(__dirname, "data", `${sector}.json`);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    console.error("Sector JSON load error:", e);
    return null;
  }
}

/* ============================================================
   AI: SECTOR + CASE META
============================================================ */
const SECTORS = [
  "power",
  "aviation",
  "banking",
  "telecoms",
  "education",
  "health",
  "security",
  "judiciary",
  "immigration",
  "correctional",
  "consumer_protection",
  "transport",
  "oil_and_gas",
  "international_escalation",
  "other",
];

async function detectSectorAI(complaint) {
  try {
    const r = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `
Classify this Nigerian complaint into ONE sector.
Allowed sectors:
${SECTORS.join(", ")}

Return ONLY the sector key. If unsure, return "other".
          `.trim(),
        },
        { role: "user", content: complaint },
      ],
    });

    const sector = r.choices?.[0]?.message?.content?.trim().toLowerCase();
    return SECTORS.includes(sector) ? sector : "other";
  } catch (e) {
    console.error("detectSectorAI error:", e);
    return "other";
  }
}

function detectSectorFallback(text = "") {
  const lower = text.toLowerCase();
  if (["mtn", "glo", "airtel", "ncc", "airtime", "data", "sim"].some((k) => lower.includes(k))) return "telecoms";
  if (["bank", "atm", "pos", "cbn", "transfer", "chargeback"].some((k) => lower.includes(k))) return "banking";
  if (["electric", "nepa", "disco", "transformer", "power"].some((k) => lower.includes(k))) return "power";
  if (["flight", "airport", "airline", "ncaa", "faan"].some((k) => lower.includes(k))) return "aviation";
  if (["hospital", "clinic", "doctor", "nhis"].some((k) => lower.includes(k))) return "health";
  if (["school", "university", "waec", "jamb", "nuc"].some((k) => lower.includes(k))) return "education";
  if (["police", "arrest", "detain", "nscdc", "army", "navy"].some((k) => lower.includes(k))) return "security";
  if (["court", "judge", "magistrate", "njc"].some((k) => lower.includes(k))) return "judiciary";
  return "other";
}

async function detectCaseMetaAI(complaint) {
  try {
    const r = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `
You are a Nigerian legal analyst.

Infer:
- caseType: one of [human_rights, service_delivery, maladministration, criminal, consumer_protection, other]
- severity: integer 1 (low) to 5 (extreme)

Respond ONLY as valid JSON:
{"caseType":"...","severity":2}
          `.trim(),
        },
        { role: "user", content: complaint },
      ],
    });

    const raw = r.choices?.[0]?.message?.content?.trim() || "";
    const parsed = JSON.parse(raw);

    const caseType = String(parsed.caseType || "other");
    const severity = Number(parsed.severity || 2);

    return {
      caseType: ["human_rights", "service_delivery", "maladministration", "criminal", "consumer_protection", "other"].includes(caseType)
        ? caseType
        : "other",
      severity: Number.isFinite(severity) ? Math.min(5, Math.max(1, severity)) : 2,
    };
  } catch (e) {
    console.error("detectCaseMetaAI error:", e);
    return { caseType: "service_delivery", severity: 2 };
  }
}

function shouldCCPCC(caseType) {
  return caseType === "maladministration" || caseType === "service_delivery";
}

/* ============================================================
   COMPREHENSIVE RECIPIENTS: JSON-DRIVEN (NO HARD-CODE MAP)
============================================================ */
function buildInstitutionCatalog(sectorJson) {
  const items = [];

  function addItem(name, obj) {
    if (!name) return;
    const emails = safeUniq(extractEmailsDeep(obj)).filter(isLikelyOfficialEmail);
    items.push({ name: String(name), norm: normalizeName(name), emails });
  }

  if (!sectorJson || typeof sectorJson !== "object") return items;

  // Arrays
  ["regulators", "oversight", "ministries", "watchdogs", "players", "core_institutions"].forEach((k) => {
    if (Array.isArray(sectorJson[k])) sectorJson[k].forEach((x) => addItem(x?.name || x, x));
  });

  // Oversight can be object-map in some JSONs
  if (sectorJson.oversight && typeof sectorJson.oversight === "object" && !Array.isArray(sectorJson.oversight)) {
    Object.keys(sectorJson.oversight).forEach((k) => {
      const node = sectorJson.oversight[k];
      addItem(node?.name || k, node);
    });
  }

  // Catch-all: pull any embedded official emails anywhere in JSON
  addItem("Sector Contacts", sectorJson);

  // Dedup by norm
  const uniq = [];
  const seen = new Set();
  for (const it of items) {
    if (!it.norm || seen.has(it.norm)) continue;
    seen.add(it.norm);
    uniq.push(it);
  }
  return uniq;
}

function findMentionedInstitutions(text, catalog) {
  const t = normalizeName(text);
  const matches = [];

  for (const item of catalog) {
    if (item?.norm && t.includes(item.norm)) matches.push(item);
  }

  // Helpful heuristics for common mentions
  const raw = String(text || "").toLowerCase();
  if (raw.includes("police") || raw.includes("igp")) {
    catalog.forEach((c) => {
      if (c.norm.includes("police")) matches.push(c);
      if (c.norm.includes("police service commission")) matches.push(c);
      if (c.norm.includes("ministry of police")) matches.push(c);
    });
  }

  const uniq = [];
  const seen = new Set();
  for (const m of matches) {
    if (!m?.norm || seen.has(m.norm)) continue;
    seen.add(m.norm);
    uniq.push(m);
  }
  return uniq;
}

function extractOfficialEmailsFromSectorJson(sectorJson) {
  if (!sectorJson) return [];
  return safeUniq(extractEmailsDeep(sectorJson)).filter(isLikelyOfficialEmail);
}

/* ============================================================
   MAILTO (DEVICE EMAIL)
============================================================ */
function buildMailto({ to = [], cc = [], subject = "", body = "" }) {
  const toList = safeUniq(to).filter(isEmail).slice(0, 10).join(",");
  const ccList = safeUniq(cc).filter(isEmail).slice(0, 10).join(",");
  if (!toList) return null;

  const params = new URLSearchParams({
    subject: subject || "Petition Regarding Complaint",
    body: body || "",
  });

  if (ccList) params.append("cc", ccList);

  return `mailto:${toList}?${params.toString()}`;
}

/* ============================================================
   OVERSIGHT EMAILS (ENV)
============================================================ */
const OVERSIGHT_EMAILS = {
  PCC: PCC_EMAIL || "",
  NHRC: NHRC_EMAIL || "",
  FCCPC: FCCPC_EMAIL || "",
  SERVICOM: SERVICOM_EMAIL || "",
  AGF: AGF_EMAIL || "",
};

function buildAdminOversightCC({ sector, caseType }) {
  const cc = [];

  // PCC on maladministration/service-delivery injustice (your rule)
  if (OVERSIGHT_EMAILS.PCC && shouldCCPCC(caseType)) cc.push(OVERSIGHT_EMAILS.PCC);

  // Human rights escalation
  if (caseType === "human_rights" && OVERSIGHT_EMAILS.NHRC) cc.push(OVERSIGHT_EMAILS.NHRC);

  // Service delivery / consumer cases
  if ((caseType === "service_delivery" || caseType === "consumer_protection") && OVERSIGHT_EMAILS.SERVICOM) cc.push(OVERSIGHT_EMAILS.SERVICOM);
  if ((caseType === "service_delivery" || caseType === "consumer_protection") && OVERSIGHT_EMAILS.FCCPC) cc.push(OVERSIGHT_EMAILS.FCCPC);

  // International escalation
  if (sector === "international_escalation" && OVERSIGHT_EMAILS.AGF) cc.push(OVERSIGHT_EMAILS.AGF);

  return safeUniq(cc).filter(isEmail);
}

/* ============================================================
   STORAGE + TTL CLEANUP
============================================================ */
const petitionStore = new Map();
const USED_TX_REFS = new Set();

const TTL_MS = 30 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of petitionStore.entries()) {
    if (!v?.createdAt || now - v.createdAt > TTL_MS) petitionStore.delete(k);
  }
}, 10 * 60 * 1000);

/* ============================================================
   DEBUG: CORS (B)
============================================================ */
app.get("/debug/cors", (req, res) => {
  const origin = req.headers.origin || "(none)";
  res.json({
    receivedOrigin: origin,
    isAllowed: origin !== "(none)" ? allowedOrigins.has(origin) : true,
    allowedOrigins: [...allowedOrigins].join(", "),
    hint: "If isAllowed=false, update Render env ALLOWED_ORIGINS and redeploy.",
  });
});

/* ============================================================
   ENDPOINTS
============================================================ */
app.get("/health", (req, res) => {
  res.json({ ok: true, service: "justicebot-backend", time: new Date().toISOString() });
});

app.post("/generate-petition", async (req, res) => {
  try {
    const complaint = String(req.body.complaint || "").trim();
    const petitioner = req.body.petitioner || {};

    if (!complaint) return res.status(400).json({ error: "Complaint is required." });
    if (!OPENAI_API_KEY) return res.status(500).json({ error: "OPENAI_API_KEY not configured." });

    let sector = await detectSectorAI(complaint);
    if (sector === "other") sector = detectSectorFallback(complaint);

    const { caseType, severity } = await detectCaseMetaAI(complaint);

    const pName = petitioner.fullName?.trim() || "[Your Full Name]";
    const pAddress = petitioner.address?.trim() || "[Your Address]";
    const pEmail = petitioner.email?.trim() || "[Your Email]";
    const pPhone = petitioner.phone?.trim() || "[Phone Number]";
    const pEvidence = petitioner.evidenceName || "None";

    const autoDate = new Date().toLocaleDateString("en-GB");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `
Draft a well-structured Nigerian petition letter with clear sections.

MANDATORY OUTPUT FORMAT (exact headings):

Date: ${autoDate}

PETITIONER DETAILS:
Name: ${pName}
Address: ${pAddress}
Email: ${pEmail}
Phone: ${pPhone}
Evidence/Attachments: ${pEvidence}

TO: [Primary institution]
THROUGH: [If appropriate — NEVER PCC]
CC: [Relevant oversight bodies]

IMPORTANT: For domestic cases, PCC MUST be in CC (not Through).

SUBJECT: [Strong subject line]

FACTS: [Numbered points]

APPLICABLE LEGAL/RIGHTS FRAMEWORK: [Cite relevant Constitution sections, Acts, regulations]

RELIEFS SOUGHT: [Numbered]

ATTACHMENTS: [List]

SIGNATURE:
[Name]
[Phone]

Context:
Sector: ${sector}
CaseType: ${caseType}
Severity: ${severity}/5
          `.trim(),
        },
        { role: "user", content: `Complaint:\n${complaint}` },
      ],
    });

    const petitionText = completion.choices?.[0]?.message?.content?.trim();
    if (!petitionText) return res.status(500).json({ error: "Failed to generate petition." });

    const subject =
      extractSubjectFromPetition(petitionText) ||
      "Petition Regarding Fundamental Rights Violation / Service Failure";

    // Build recipients early (used again after unlock)
    const sectorJson = loadSectorJson(sector);
    const catalog = buildInstitutionCatalog(sectorJson);
    const mentioned = findMentionedInstitutions(petitionText, catalog);

    const mentionedEmails = safeUniq(mentioned.flatMap((m) => m.emails)).filter(isLikelyOfficialEmail);
    const allSectorEmails = extractOfficialEmailsFromSectorJson(sectorJson);

    const initialTo = mentionedEmails.length ? mentionedEmails : allSectorEmails;

    const tx_ref = `pd_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    petitionStore.set(tx_ref, {
      createdAt: Date.now(),
      petition: petitionText,
      sector,
      caseType,
      severity,
      subject,
      mentionedInstitutions: mentioned.map((m) => m.name),
      initialRecipients: { to: initialTo },
    });

    const preview = petitionText.length > 600 ? petitionText.slice(0, 600) + "..." : petitionText;

    res.json({
      needsPayment: true,
      amount: PRICE_NGN,
      currency: "NGN",
      tx_ref,
      preview,
      message: "Payment required to unlock full petition and email actions",
    });
  } catch (err) {
    console.error("Petition generation error:", err);
    res.status(500).json({ error: "Failed to generate petition." });
  }
});

app.post("/pay/initialize", async (req, res) => {
  try {
    const { tx_ref, amount = PRICE_NGN, currency = "NGN", email, name, phone } = req.body;

    if (!tx_ref) return res.status(400).json({ ok: false, error: "Missing tx_ref" });
    if (!petitionStore.has(tx_ref)) return res.status(404).json({ ok: false, error: "Unknown tx_ref" });

    const redirect_url = `${FRONTEND_BASE_URL}?tx_ref=${encodeURIComponent(tx_ref)}`;

    const payload = {
      tx_ref,
      amount,
      currency,
      redirect_url,
      customer: {
        email: email || "user@petitiondesk.com",
        name: name || "PetitionDesk User",
        phonenumber: phone || "",
      },
      customizations: { title: "PetitionDesk", description: "Unlock full petition & email" },
    };

    const { ok, data } = await flwFetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (!ok || !data?.data?.link) {
      return res.status(400).json({ ok: false, error: data?.message || "Payment failed" });
    }

    res.json({ ok: true, tx_ref, link: data.data.link });
  } catch (e) {
    console.error("pay/initialize error:", e);
    res.status(500).json({ ok: false, error: "Payment init error" });
  }
});

app.post("/unlock-petition", async (req, res) => {
  try {
    const { tx_ref } = req.body;
    if (!tx_ref) return res.status(400).json({ ok: false, error: "Missing tx_ref" });
    if (USED_TX_REFS.has(tx_ref)) return res.status(409).json({ ok: false, error: "Transaction already used" });

    const { ok, data } = await flwFetch(
      `https://api.flutterwave.com/v3/transactions/verify?tx_ref=${encodeURIComponent(tx_ref)}`
    );

    const paymentOk =
      ok &&
      data?.status === "success" &&
      data?.data?.status === "successful" &&
      String(data?.data?.currency || "NGN").toUpperCase() === "NGN" &&
      Number(data?.data?.amount || 0) >= PRICE_NGN;

    if (!paymentOk) return res.status(402).json({ ok: false, error: "Payment not successful" });

    const stored = petitionStore.get(tx_ref);
    if (!stored) return res.status(404).json({ ok: false, error: "Petition not found (expired or server restarted)" });

    USED_TX_REFS.add(tx_ref);
    petitionStore.delete(tx_ref);

    const sectorJson = loadSectorJson(stored.sector);
    const catalog = buildInstitutionCatalog(sectorJson);

    // Prefer mentioned institutions (most relevant); fallback to all sector emails
    const mentioned = findMentionedInstitutions(stored.petition, catalog);
    const mentionedEmails = safeUniq(mentioned.flatMap((m) => m.emails)).filter(isLikelyOfficialEmail);

    const toEmails = mentionedEmails.length
      ? mentionedEmails
      : safeUniq(extractOfficialEmailsFromSectorJson(sectorJson)).filter(isLikelyOfficialEmail);

    // Admin/oversight CC (includes PCC rule)
    const adminCC = buildAdminOversightCC({ sector: stored.sector, caseType: stored.caseType });

    // Also add oversight/ministry emails from JSON to CC (but avoid duplicating TO)
    const oversightPool = [];
    if (sectorJson?.oversight) oversightPool.push(...extractEmailsDeep(sectorJson.oversight));
    if (sectorJson?.ministries) oversightPool.push(...extractEmailsDeep(sectorJson.ministries));
    const oversightOfficial = safeUniq(oversightPool).filter(isLikelyOfficialEmail);

    const ccEmails = safeUniq([
      ...adminCC,
      ...oversightOfficial.filter((e) => !toEmails.includes(e)),
    ]).filter(isEmail);

    const mailto = buildMailto({
      to: toEmails,
      cc: ccEmails,
      subject: stored.subject || `FORMAL PETITION: ${String(stored.sector || "GENERAL").toUpperCase()}`,
      body: stored.petition,
    });

    res.json({
      ok: true,
      unlocked: true,
      petition: stored.petition,
      sector: stored.sector,
      caseType: stored.caseType,
      severity: stored.severity,
      subject: stored.subject,
      mentionedInstitutions: stored.mentionedInstitutions || [],
      recipients: { to: toEmails, cc: ccEmails }, // A) frontend can edit
      mailto, // opens device email
    });
  } catch (err) {
    console.error("Unlock error:", err);
    res.status(500).json({ ok: false, error: "Unlock failed" });
  }
});

app.get("/download-pdf", (req, res) => {
  try {
    const { sector = "general", text = "" } = req.query;
    if (!text) return res.status(400).send("Missing text");

    const decoded = decodeURIComponent(text);
    const filename = `${sector}-petition.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    const pdf = new PDFDocument({ margin: 50 });
    pdf.pipe(res);

    pdf.fontSize(20).text("PETITION", { align: "center" });
    pdf.moveDown();
    pdf.fontSize(12).text(decoded, { align: "justify" });
    pdf.moveDown(3);
    pdf.fontSize(10).text("Generated by PetitionDesk", { align: "center" });

    pdf.end();
  } catch (err) {
    console.error("PDF error:", err);
    res.status(500).send("PDF generation failed");
  }
});

/* ============================================================
   START
============================================================ */
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Backend running on port ${PORT}`);
  console.log(`✅ Allowed origins: ${[...allowedOrigins].join(", ") || "(none)"}`);
});

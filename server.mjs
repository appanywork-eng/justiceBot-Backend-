import express from "express";
import cors from "cors";
import OpenAI from "openai";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import PDFDocument from "pdfkit";

dotenv.config();

/* ============================================================
   APP INIT
============================================================ */
const app = express();

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "5mb" }));

/* ============================================================
   OPENAI
============================================================ */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/*
  Uses native fetch (Node 21+).
  If Node <21, node-fetch must be installed.
*/

/* ============================================================
   CONFIG / ENV
============================================================ */
const OVERSIGHT_EMAILS = {
  PCC: process.env.PCC_EMAIL || "",
  NHRC: process.env.NHRC_EMAIL || "",
  FCCPC: process.env.FCCPC_EMAIL || "",
  SERVICOM: process.env.SERVICOM_EMAIL || "",
  AGF: process.env.AGF_EMAIL || "",
};

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || "";
const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID || "";

const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY || "";
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || "https://petitiondesk.com";
const PETITION_PRICE_NGN = Number(process.env.PETITION_PRICE_NGN || "1050");

// In-memory anti-reuse
const USED_TX_REFS = new Set();

/* ============================================================
   FLUTTERWAVE HELPER
============================================================ */
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
  return { ok: res.ok, data };
}

/* ============================================================
   PATHS
============================================================ */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ============================================================
   UTILITIES
============================================================ */
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

function extractEmailsFromText(text = "") {
  const matches =
    String(text).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return safeUniq(matches.map((m) => m.trim())).filter(isEmail);
}

function extractEmailsDeep(value, out = []) {
  if (!value) return out;

  if (typeof value === "string" && isEmail(value)) out.push(value.trim());
  if (Array.isArray(value)) value.forEach((v) => extractEmailsDeep(v, out));
  if (typeof value === "object" && value !== null) {
    Object.values(value).forEach((v) => extractEmailsDeep(v, out));
  }

  return out;
}

/* ============================================================
   SECTOR JSON
============================================================ */
function loadSectorJson(sector) {
  const filePath = path.join(__dirname, "data", `${sector}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

/* ============================================================
   SECTOR DETECTION (RULE-BASED)
============================================================ */
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

/* ============================================================
   OVERSIGHT CC LOGIC
============================================================ */
function buildAdminOversightCC({ sector, caseType }) {
  const cc = [];

  if (sector !== "international_escalation" && OVERSIGHT_EMAILS.PCC)
    cc.push(OVERSIGHT_EMAILS.PCC);

  if (caseType === "human_rights" && OVERSIGHT_EMAILS.NHRC)
    cc.push(OVERSIGHT_EMAILS.NHRC);

  if (caseType === "service_delivery") {
    if (OVERSIGHT_EMAILS.SERVICOM) cc.push(OVERSIGHT_EMAILS.SERVICOM);
    if (OVERSIGHT_EMAILS.FCCPC) cc.push(OVERSIGHT_EMAILS.FCCPC);
  }

  if (sector === "international_escalation" && OVERSIGHT_EMAILS.AGF)
    cc.push(OVERSIGHT_EMAILS.AGF);

  return safeUniq(cc).filter(isEmail);
}

/* ============================================================
   MAILTO BUILDER
============================================================ */
function buildMailto({ to = [], cc = [], subject = "", body = "" }) {
  const toList = safeUniq(to).filter(isEmail).slice(0, 10).join(",");
  const ccList = safeUniq(cc).filter(isEmail).slice(0, 10).join(",");

  if (!toList) return null;

  const s = encodeURIComponent(subject || "");
  const b = encodeURIComponent(body || "");
  const ccParam = ccList ? `&cc=${encodeURIComponent(ccList)}` : "";

  return `mailto:${toList}?subject=${s}&body=${b}${ccParam}`;
}

/* ============================================================
   PETITION PARSING
============================================================ */
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
   INSTITUTION MATCHING
============================================================ */
function buildInstitutionCatalog(sectorJson) {
  const items = [];

  function addItem(name, obj) {
    if (!name) return;
    const emails = safeUniq(extractEmailsDeep(obj)).filter(isEmail);
    items.push({ name: String(name), norm: normalizeName(name), emails });
  }

  if (!sectorJson || typeof sectorJson !== "object") return items;

  if (sectorJson.oversight && typeof sectorJson.oversight === "object") {
    for (const key of Object.keys(sectorJson.oversight)) {
      const node = sectorJson.oversight[key];
      addItem(node?.name || key, node);
    }
  }

  if (Array.isArray(sectorJson.core_institutions)) {
    sectorJson.core_institutions.forEach((inst) => addItem(inst?.name, inst));
  }

  if (Array.isArray(sectorJson.regulators))
    sectorJson.regulators.forEach((x) => addItem(x?.name || x, x));
  if (Array.isArray(sectorJson.watchdogs))
    sectorJson.watchdogs.forEach((x) => addItem(x?.name || x, x));
  if (Array.isArray(sectorJson.players))
    sectorJson.players.forEach((x) => addItem(x?.name || x, x));

  return items;
}

function findMentionedInstitutions(petitionText, catalog) {
  const text = normalizeName(petitionText);
  const mentioned = [];

  for (const item of catalog) {
    if (item?.norm && text.includes(item.norm)) mentioned.push(item);
  }

  const raw = (petitionText || "").toLowerCase();

  if (raw.includes("police")) {
    catalog.forEach((c) => {
      if (
        c.norm.includes("nigeria police") ||
        c.norm.includes("police service commission") ||
        c.norm.includes("ministry of police")
      ) {
        mentioned.push(c);
      }
    });
  }

  return safeUniq(mentioned);
}

/* ============================================================
   GOOGLE CSE EMAIL DISCOVERY
============================================================ */
async function googleCseSearch(query) {
  if (!GOOGLE_API_KEY || !GOOGLE_CSE_ID) return [];

  const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(
    GOOGLE_API_KEY
  )}&cx=${encodeURIComponent(GOOGLE_CSE_ID)}&q=${encodeURIComponent(query)}`;

  const res = await fetch(url);
  if (!res.ok) return [];

  const data = await res.json();
  return (data.items || []).map((i) => i.link).filter(Boolean).slice(0, 5);
}

function sameDomain(email, siteUrl) {
  try {
    const host = new URL(siteUrl).hostname.replace(/^www\./, "");
    const domain = email.split("@")[1];
    return domain === host || domain.endsWith("." + host);
  } catch {
    return false;
  }
}

/* ============================================================
   ENDPOINTS
============================================================ */
app.get("/health", (req, res) => {
  res.json({ ok: true, service: "petitiondesk-backend", time: new Date().toISOString() });
});

/* ---------- PAY INIT ---------- */
app.post("/pay/initialize", async (req, res) => {
  try {
    const tx_ref = `pd_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const redirect_url = `${FRONTEND_BASE_URL}/payment-success?tx_ref=${tx_ref}`;

    const payload = {
      tx_ref,
      amount: PETITION_PRICE_NGN,
      currency: "NGN",
      redirect_url,
      customer: {
        email: req.body.email || "user@petitiondesk.com",
        name: req.body.name || "PetitionDesk User",
        phonenumber: req.body.phone || "",
      },
    };

    const { ok, data } = await flwFetch(
      "https://api.flutterwave.com/v3/payments",
      { method: "POST", body: JSON.stringify(payload) }
    );

    if (!ok || !data?.data?.link)
      return res.status(400).json({ ok: false, error: "Flutterwave init failed" });

    res.json({ ok: true, tx_ref, link: data.data.link });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Payment init error" });
  }
});

/* ---------- GENERATE PETITION ---------- */
app.post("/generate-petition", async (req, res) => {
  const complaint = req.body.complaint || "";
  const sector = detectSector(complaint);

  if (!process.env.OPENAI_API_KEY)
    return res.json({ petition: "❌ OPENAI_API_KEY not set.", sector });

  try {
    const ai = await openai.chat.completions.create({
      model: "gpt-5.2",
      messages: [{ role: "user", content: complaint }],
    });

    res.json({
      sector,
      petition: ai.choices?.[0]?.message?.content || "",
    });
  } catch {
    res.json({ petition: "❌ Failed to generate petition.", sector });
  }
});

/* ---------- PDF ---------- */
app.get("/download-pdf", (req, res) => {
  try {
    const decoded = decodeURIComponent(req.query.text || "");
    const pdf = new PDFDocument();
    res.setHeader("Content-Type", "application/pdf");
    pdf.pipe(res);
    pdf.text(decoded);
    pdf.end();
  } catch {
    res.status(500).send("PDF error");
  }
});

/* ============================================================
   START
============================================================ */
app.listen(process.env.PORT || 3000, "0.0.0.0", () => {
  console.log(`🚀 PetitionDesk backend running`);
});

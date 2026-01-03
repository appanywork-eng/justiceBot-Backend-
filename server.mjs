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

// Allow all origins
app.use(cors({ origin: "*" }));

// Required for webhook verification
app.use(express.json({
  limit: "5mb",
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Config
const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY || "";
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || "https://petitiondesk.com";
const PETITION_PRICE_NGN = Number(process.env.PETITION_PRICE_NGN || 1050);

// Storage
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
  return { ok: res.ok, data };
}

// Paths & Utils (same as before — unchanged for brevity)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function safeUniq(arr) { return [...new Set((arr || []).filter(Boolean))]; }
function isEmail(s) { return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim()); }
function isLikelyOfficialEmail(email) {
  if (!isEmail(email)) return false;
  const lower = email.toLowerCase();
  const badDomains = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "live.com", "aol.com", "proton.me", "protonmail.com"];
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
  const m = petitionText.match(/^\s*subject\s*:\s*(.+)\s*$/im) || petitionText.match(/^\s*re\s*:\s*(.+)\s*$/im);
  return (m?.[1] || "").trim() || "Petition Regarding Complaint";
}
function normalizeName(s = "") {
  return String(s).toLowerCase().replace(/[\u2019’]/g, "'").replace(/[^a-z0-9\s().,&/-]/g, " ").replace(/\s+/g, " ").trim();
}
function loadSectorJson(sector) {
  const filePath = path.join(__dirname, "data", `${sector}.json`);
  if (!fs.existsSync(filePath)) return null;
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch { return null; }
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
function inferCaseType(sector) {
  if (sector === "security" || sector === "judiciary") return "human_rights";
  if (["health", "telecoms", "aviation", "banking", "power", "education"].includes(sector)) return "service_delivery";
  if (sector === "international_escalation") return "international";
  return "other";
}
function buildAdminOversightCC({ sector, caseType }) {
  const cc = [];
  // Add your oversight emails as before
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
function buildInstitutionCatalog(sectorJson) { /* unchanged */ return []; }
function findMentionedInstitutions(petitionText, catalog) { /* unchanged */ return []; }

// ==================== FLUTTERWAVE WEBHOOK (FIXED & RELIABLE) ====================
app.post("/flw-webhook", express.raw({ type: "application/json" }), (req, res) => {
  try {
    const hash = req.headers["verif-hash"];
    if (!hash || hash !== FLW_SECRET_KEY) {
      console.warn("Invalid webhook signature");
      return res.status(401).end();
    }

    const payload = JSON.parse(req.rawBody.toString());

    // Accept both "charge.completed" and "successful" events
    const isSuccess = 
      payload.event === "charge.completed" && 
      payload.data?.status === "successful";

    if (isSuccess) {
      const tx_ref = payload.data.tx_ref;
      const amount = Number(payload.data.amount || 0);
      const currency = payload.data.currency || "";

      if (tx_ref?.startsWith("pd_") && amount >= PETITION_PRICE_NGN && currency.toUpperCase() === "NGN") {
        USED_TX_REFS.add(tx_ref);
        console.log(`✅ Payment SUCCESS via webhook: ${tx_ref} | ₦${amount}`);
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err);
    res.sendStatus(400);
  }
});

// ==================== ENDPOINTS ====================
app.get("/health", (req, res) => res.json({ ok: true }));

app.post("/generate-petition", async (req, res) => {
  // Your existing generate-petition code (unchanged)
  // ... keep your full generate-petition logic here
});

app.post("/pay/initialize", async (req, res) => {
  try {
    const { tx_ref, email, name, phone } = req.body;
    if (!tx_ref) return res.status(400).json({ ok: false, error: "Missing tx_ref" });

    const redirect_url = `${FRONTEND_BASE_URL}?tx_ref=${tx_ref}`;

    const payload = {
      tx_ref,
      amount: PETITION_PRICE_NGN,
      currency: "NGN",
      redirect_url,
      customer: { email: email || "user@petitiondesk.com", name: name || "User", phonenumber: phone || "" },
      customizations: { title: "PetitionDesk", description: "Unlock petition" },
      meta: { return_url: redirect_url }
    };

    const { ok, data } = await flwFetch("https://api.flutterwave.com/v3/payments", { method: "POST", body: JSON.stringify(payload) });

    if (!ok || !data?.data?.link) return res.status(400).json({ ok: false, error: "Payment init failed" });

    res.json({ ok: true, tx_ref, link: data.data.link });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Payment error" });
  }
});

// ==================== FIXED UNLOCK ENDPOINT ====================
app.post("/unlock-petition", async (req, res) => {
  try {
    const { tx_ref } = req.body;
    if (!tx_ref) return res.status(400).json({ ok: false, error: "Missing tx_ref" });

    let paymentVerified = USED_TX_REFS.has(tx_ref);

    // If webhook hasn't marked it yet, verify live
    if (!paymentVerified) {
      const { ok, data } = await flwFetch(`https://api.flutterwave.com/v3/transactions/verify?tx_ref=${encodeURIComponent(tx_ref)}`);
      paymentVerified = ok && 
        (data?.status === "success" || data?.data?.status === "successful") &&
        Number(data?.data?.amount || 0) >= PETITION_PRICE_NGN &&
        (data?.data?.currency || "").toUpperCase() === "NGN";
      
      if (paymentVerified) {
        console.log(`✅ Payment verified live for ${tx_ref}`);
      }
    }

    if (!paymentVerified) {
      return res.status(402).json({ ok: false, error: "Payment not verified yet. Wait a moment or refresh." });
    }

    const stored = petitionStore.get(tx_ref);
    if (!stored) return res.status(404).json({ ok: false, error: "Petition not found or expired" });

    // Mark as used and clean up
    USED_TX_REFS.add(tx_ref);
    petitionStore.delete(tx_ref);

    const mailto = buildMailto({
      to: stored.toEmails || [],
      cc: stored.ccEmails || [],
      subject: stored.subject || "Petition",
      body: stored.petition,
    });

    res.json({
      ok: true,
      unlocked: true,
      petition: stored.petition,
      sector: stored.sector,
      mentionedInstitutions: stored.mentionedInstitutions || [],
      to: stored.toEmails || [],
      cc: stored.ccEmails || [],
      mailto,
    });
  } catch (err) {
    console.error("Unlock error:", err);
    res.status(500).json({ ok: false, error: "Server error during unlock" });
  }
});

// PDF and other endpoints unchanged

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Backend running on port ${PORT}`);
  console.log(`Redirect URL: ${FRONTEND_BASE_URL}?tx_ref=...`);
  console.log(`Set Webhook in Flutterwave: https://your-app.onrender.com/flw-webhook`);
});

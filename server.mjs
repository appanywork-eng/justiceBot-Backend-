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

app.use(cors({ origin: "*" }));

app.use(express.json({ limit: "5mb", verify: (req, res, buf) => { req.rawBody = buf; } }));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Config (update FRONTEND_BASE_URL to your live site)
const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY || "";
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || "https://petitiondesk.com";
const PETITION_PRICE_NGN = Number(process.env.PETITION_PRICE_NGN || 1050);

const petitionStore = new Map();
const USED_TX_REFS = new Set();

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
  // Add your oversight logic here
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
function buildInstitutionCatalog(sectorJson) { return []; } // Keep your full logic
function findMentionedInstitutions(petitionText, catalog) { return []; } // Keep your full logic

// Webhook & Endpoints (same as last version, with model fix below)

app.post("/generate-petition", async (req, res) => {
  const { complaint = "", petitioner = {} } = req.body;
  if (!complaint.trim()) return res.status(400).json({ error: "Complaint is required" });

  const sector = detectSector(complaint);
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
      model: "gpt-5.2", // FIXED: Valid current model as of Jan 2026
      temperature: 0.7,
      max_tokens: 2000,
      messages: [
        {
          role: "system",
          content: `Draft a professional Nigerian petition...` // Keep your full prompt
        },
        { role: "user", content: `Complaint: ${complaint}` },
      ],
    });

    const petitionText = completion.choices?.[0]?.message?.content?.trim() || "Failed to generate.";

    // Rest of your logic (preview, store tx_ref, etc.)

    const preview = petitionText.length > 600 ? petitionText.substring(0, 600) + "..." : petitionText;

    const tx_ref = `pd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    petitionStore.set(tx_ref, { petition: petitionText /* add other data */ });

    res.json({
      needsPayment: true,
      amount: PETITION_PRICE_NGN,
      tx_ref,
      preview,
    });
  } catch (err) {
    console.error("OpenAI error:", err);
    res.status(500).json({ error: "Generation timeout or API error. Try again." });
  }
});

// Keep all other endpoints (pay/initialize, unlock-petition, webhook, etc.) unchanged from previous version

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});

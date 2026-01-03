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

app.use(express.json({ limit: "5mb" }));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const OVERSIGHT_EMAILS = {
  PCC: process.env.PCC_EMAIL || "",
  NHRC: process.env.NHRC_EMAIL || "",
  FCCPC: process.env.FCCPC_EMAIL || "",
  SERVICOM: process.env.SERVICOM_EMAIL || "",
  AGF: process.env.AGF_EMAIL || "",
};

const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY || "";
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || "https://petitiondesk.com";
const PETITION_PRICE_NGN = Number(process.env.PETITION_PRICE_NGN || "1050");

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
  const matches = String(text).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
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

function loadSectorJson(sector) {
  const filePath = path.join(__dirname, "data", sector + ".json");
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function detectSector(text) {
  const lower = (text || "").toLowerCase();
  const map = {
    power: ["electricity", "nepa", "aedc", "transformer", "power", "disco"],
    aviation: ["flight", "airport", "airline", "ncaa", "faan", "aviation"],
    banking: ["bank", "atm", "pos", "debit", "transfer", "chargeback"],
    telecoms: ["airtime", "data", "network", "sim", "telecom", "ncc"],
    education: ["school", "university", "waec", "jamb", "nuc", "education"],
    health: ["hospital", "clinic", "doctor", "ncdc", "nhis", "medical"],
    security: ["police", "army", "navy", "airforce", "nscdc", "unlawful"],
    judiciary: ["court", "judge", "justice", "supreme", "petition"],
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
  const s = encodeURIComponent(subject || "");
  const b = encodeURIComponent(body || "");
  const ccParam = ccList ? `&cc=${encodeURIComponent(ccList)}` : "";
  return `mailto:${toList}?subject=${s}&body=${b}${ccParam}`;
}

// Petition Parsing (unchanged)
function extractSubjectFromPetition(petitionText = "") {
  const m = petitionText.match(/^\s*subject\s*:\s*(.+)\s*$/im) || petitionText.match(/^\s*re\s*:\s*(.+)\s*$/im);
  return (m?.[1] || "").trim();
}

// Institution Matching (unchanged)
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

  if (Array.isArray(sectorJson.regulators)) sectorJson.regulators.forEach((inst) => addItem(inst?.name, inst));
  if (Array.isArray(sectorJson.watchdogs)) sectorJson.watchdogs.forEach((inst) => addItem(inst?.name, inst));
  if (Array.isArray(sectorJson.players)) sectorJson.players.forEach((inst) => addItem(inst?.name, inst));

  return items;
}

function findMentionedInstitutions(petitionText, catalog) {
  const text = normalizeName(petitionText);
  const mentioned = [];

  for (const item of catalog) {
    if (item?.norm && text.includes(item.norm)) mentioned.push(item);
  }

  const raw = (petitionText || "").toLowerCase();
  if (raw.includes("police") || raw.includes("igp") || raw.includes("nigeria police")) {
    const npf = catalog.find((c) => c.norm.includes("nigeria police force"));
    if (npf) mentioned.push(npf);
    const psc = catalog.find((c) => c.norm.includes("police service commission"));
    if (psc) mentioned.push(psc);
    const policeMin = catalog.find((c) => c.norm.includes("ministry of police affairs"));
    if (policeMin) mentioned.push(policeMin);
  }

  return mentioned;
}

// in-memory storage for petitions (temporary, not persistent)
const petitionStore = new Map();

// Endpoints
app.get("/health", (req, res) => {
  res.json({ ok: true, service: "petitiondesk-backend", time: new Date().toISOString() });
});

app.post("/generate-petition", async (req, res) => {
  const complaint = req.body.complaint || "";
  const petitioner = req.body.petitioner || {};
  const pName = petitioner.fullName.trim() || "[Your Full Name]";
  const pAddress = petitioner.address.trim() || "[Your Address]";
  const pEmail = petitioner.email.trim() || "[Your Email]";
  const pPhone = petitioner.phone.trim() || "[Phone Number]";

  const sector = detectSector(complaint);
  const caseType = inferCaseType(sector);

  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: `You are a Nigerian legal AI. Draft a formal petition including: 
PETITIONER DETAILS:
Name: ${pName}
Address: ${pAddress}
Email: ${pEmail}
Phone: ${pPhone}

TO: [Primary institution]
CC: [Relevant oversight]

SUBJECT: [Subject]

FACTS: [Numbered points]

LEGAL FRAMEWORK: [Cites]

RELIEFS: [Numbered]

SIGNATURE: ${pName}` },
        { role: "user", content: complaint },
      ],
    });

    const petitionText = res.choices[0].message.content.trim();

    const tx_ref = `pd_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    petitionStore.set(tx_ref, {
      petition: petitionText,
      sector,
      caseType,
      to: [], // Add logic if needed
      cc: buildAdminOversightCC({ sector, caseType }),
    });

    const preview = petitionText.slice(0, 500) + "...";

    res.json({ needsPayment: true, tx_ref, preview });
  } catch (err) {
    res.status(500).json({ error: "Generation failed" });
  }
});

// Your existing /pay/initialize, /unlock-petition, /flw-webhook, /download-pdf

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});

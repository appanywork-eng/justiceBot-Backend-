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

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "5mb" }));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---------- CONFIG ----------
const OVERSIGHT_EMAILS = {
  PCC: process.env.PCC_EMAIL || "",
  NHRC: process.env.NHRC_EMAIL || "",
  FCCPC: process.env.FCCPC_EMAIL || "",
  SERVICOM: process.env.SERVICOM_EMAIL || "",
  AGF: process.env.AGF_EMAIL || "",
};

const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY || "";
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || "http://localhost:5173"; // Change in production
const PETITION_PRICE_NGN = Number(process.env.PETITION_PRICE_NGN || 1050);

// In-memory storage (temporary)
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

// ---------- HELPERS ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function safeUniq(arr) {
  return [...new Set((arr || []).filter(Boolean))];
}

function isEmail(s) {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
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
    power: ["electricity", "nepa", "aedc", "transformer", "power", "disco", "light"],
    aviation: ["flight", "airport", "airline", "ncaa", "faan", "aviation"],
    banking: ["bank", "atm", "pos", "debit", "transfer", "chargeback", "cbn"],
    telecoms: ["airtime", "data", "network", "sim", "telecom", "ncc", "mtn", "glo", "airtel"],
    education: ["school", "university", "waec", "jamb", "nuc", "education"],
    health: ["hospital", "clinic", "doctor", "ncdc", "nhis", "medical"],
    security: ["police", "army", "navy", "airforce", "nscdc", "unlawful", "arrest"],
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
  const s = encodeURIComponent(subject || "Petition Regarding Complaint");
  const b = encodeURIComponent(body || "");
  const ccParam = ccList ? `&cc=${encodeURIComponent(ccList)}` : "";
  return `mailto:${toList}?subject=${s}&body=${b}${ccParam}`;
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

function buildInstitutionCatalog(sectorJson) {
  const items = [];

  function addItem(name, obj) {
    if (!name) return;
    const emails = safeUniq(extractEmailsDeep(obj)).filter(isEmail);
    items.push({
      name: String(name),
      norm: normalizeName(name),
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

  if (Array.isArray(sectorJson.core_institutions)) {
    sectorJson.core_institutions.forEach((inst) => addItem(inst?.name || inst, inst));
  }
  if (Array.isArray(sectorJson.regulators)) sectorJson.regulators.forEach((r) => addItem(r?.name || r, r));
  if (Array.isArray(sectorJson.watchdogs)) sectorJson.watchdogs.forEach((w) => addItem(w?.name || w, w));
  if (Array.isArray(sectorJson.players)) sectorJson.players.forEach((p) => addItem(p?.name || p, p));

  return items;
}

function findMentionedInstitutions(petitionText, catalog) {
  const text = normalizeName(petitionText);
  const mentioned = [];

  for (const item of catalog) {
    if (item?.norm && text.includes(item.norm)) mentioned.push(item);
  }

  const raw = (petitionText || "").toLowerCase();
  if (raw.includes("police") || raw.includes("igp") || raw.includes("nigerian police")) {
    const npf = catalog.find((c) => c.norm.includes("nigeria police force"));
    if (npf) mentioned.push(npf);
    const psc = catalog.find((c) => c.norm.includes("police service commission"));
    if (psc) mentioned.push(psc);
    const policeMin = catalog.find((c) => c.norm.includes("ministry of police affairs"));
    if (policeMin) mentioned.push(policeMin);
  }

  if (raw.includes("immigration")) {
    const nis = catalog.find((c) => c.norm.includes("nigeria immigration service"));
    if (nis) mentioned.push(nis);
  }

  if (raw.includes("correction") || raw.includes("prison")) {
    const ncos = catalog.find((c) => c.norm.includes("nigerian correctional service"));
    if (ncos) mentioned.push(ncos);
  }

  if (raw.includes("civil defence") || raw.includes("nscdc")) {
    const nscdc = catalog.find((c) => c.norm.includes("nigeria security and civil defence"));
    if (nscdc) mentioned.push(nscdc);
  }

  const uniq = [];
  const seen = new Set();
  for (const m of mentioned) {
    if (!m?.norm || seen.has(m.norm)) continue;
    seen.add(m.norm);
    uniq.push(m);
  }
  return uniq;
}

// ---------- ENDPOINTS ----------

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "petitiondesk-backend", time: new Date().toISOString() });
});

app.post("/generate-petition", async (req, res) => {
  const complaint = req.body.complaint || "";
  const sector = req.body.sector || detectSector(complaint) || "unknown";
  const petitioner = req.body.petitioner || {};
  const pName = petitioner.fullName?.trim() || "[Your Full Name]";
  const pAddress = petitioner.address?.trim() || "[Your Address]";
  const pEmail = petitioner.email?.trim() || "[Your Email]";
  const pPhone = petitioner.phone?.trim() || "[Phone Number]";
  const pEvidence = petitioner.evidenceName || "None";

  if (sector === "unknown") {
    return res.status(400).json({ error: "Could not detect sector from complaint." });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY not configured." });
  }

  try {
    const autoDate = new Date().toLocaleDateString("en-GB");
    const caseType = inferCaseType(sector);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o", // Use valid model: gpt-4o or gpt-4-turbo
      messages: [
        {
          role: "system",
          content: `Draft a well-structured Nigerian petition letter with clear sections.
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

Keep readable with blank lines between sections.
Sector: ${sector} | CaseType: ${caseType}`.trim(),
        },
        { role: "user", content: `Complaint:\n${complaint}` },
      ],
    });

    const petitionText = completion.choices?.[0]?.message?.content?.trim() || "Failed to generate text.";

    const subject = extractSubjectFromPetition(petitionText) || "Petition Regarding Fundamental Rights Violation / Service Failure";

    const sectorJson = loadSectorJson(sector);
    const catalog = buildInstitutionCatalog(sectorJson);
    const mentioned = findMentionedInstitutions(petitionText, catalog);

    const mentionedEmails = safeUniq(mentioned.flatMap((m) => m.emails)).filter(isLikelyOfficialEmail);
    const adminCC = buildAdminOversightCC({ sector, caseType });

    const toFull = mentionedEmails.length > 0 ? mentionedEmails : adminCC.slice(0, 1); // fallback
    const ccFull = safeUniq([...adminCC, ...mentionedEmails.filter((e) => !toFull.includes(e))]);

    const mailto = buildMailto({ to: toFull, cc: ccFull, subject, body: petitionText });

    const tx_ref = `pd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    petitionStore.set(tx_ref, {
      petition: petitionText,
      sector,
      date: autoDate,
      subject,
      caseType,
      mentionedInstitutions: mentioned.map((m) => m.name),
      to: toFull,
      cc: ccFull,
      mailto,
    });

    const preview = petitionText.length > 600 ? petitionText.substring(0, 600) + "..." : petitionText;

    res.json({
      needsPayment: true,
      amount: PETITION_PRICE_NGN,
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

// Payment endpoints (initialize and unlock) — unchanged, just fixed small bugs
app.post("/pay/initialize", async (req, res) => {
  try {
    const { tx_ref, amount = PETITION_PRICE_NGN, currency = "NGN", email, name, phone } = req.body;

    if (!tx_ref) return res.status(400).json({ ok: false, error: "Missing tx_ref" });

    const redirect_url = `${FRONTEND_BASE_URL}?tx_ref=${tx_ref}`;

    const payload = {
      tx_ref,
      amount,
      currency,
      redirect_url,
      customer: { email: email || "user@petitiondesk.com", name: name || "PetitionDesk User", phonenumber: phone || "" },
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

    const { ok, data } = await flwFetch(`https://api.flutterwave.com/v3/transactions/verify?tx_ref=${encodeURIComponent(tx_ref)}`);

    if (!ok || data?.status !== "success" || data?.data?.status !== "successful") {
      return res.status(402).json({ ok: false, error: "Payment not successful" });
    }

    if (USED_TX_REFS.has(tx_ref)) {
      return res.status(409).json({ ok: false, error: "Transaction already used" });
    }
    USED_TX_REFS.add(tx_ref);

    const stored = petitionStore.get(tx_ref);
    if (!stored) return res.status(404).json({ ok: false, error: "Petition not found" });

    petitionStore.delete(tx_ref);

    res.json({ ok: true, unlocked: true, ...stored });
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 PetitionDesk backend running on http://localhost:${PORT}`);
});

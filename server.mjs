// server.mjs
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
  return { ok: res.ok, data };
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
  function addItem(name, obj) {
    if (!name) return;
    const emails = safeUniq(extractEmailsDeep(obj)).filter(isLikelyOfficialEmail);
    items.push({ name: String(name), norm: normalizeName(name), emails });
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

function findMentionedInstitutions(petitionText, catalog) {
  const text = normalizeName(petitionText);
  const mentioned = [];

  for (const item of catalog) {
    if (item?.norm && text.includes(item.norm)) mentioned.push(item);
  }

  const raw = (petitionText || "").toLowerCase();
  if (raw.includes("police")) {
    const policeItems = catalog.filter(
      (c) =>
        c.norm.includes("police") ||
        c.norm.includes("nigeria police") ||
        c.norm.includes("police service commission") ||
        c.norm.includes("ministry of police")
    );
    mentioned.push(...policeItems);
  }

  return safeUniq(mentioned);
}

// ✅ Option A redirect builder: always return to SAME page with tx_ref
function buildFrontendRedirectUrl(tx_ref) {
  const base = String(FRONTEND_BASE_URL || "").trim().replace(/\/+$/, "");
  // Always send user back to your homepage with tx_ref for unlock
  return `${base}/?tx_ref=${encodeURIComponent(tx_ref)}`;
}

// === FLUTTERWAVE WEBHOOK (RELIABLE UNLOCK MARK) ===
app.post("/flw-webhook", (req, res) => {
  try {
    const hash = req.headers["verif-hash"];
    if (!hash || hash !== FLW_SECRET_KEY) {
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
        console.log(`✅ Payment confirmed via webhook: ${tx_ref}`);
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err);
    res.sendStatus(400);
  }
});

// Endpoints
app.get("/health", (req, res) => {
  res.json({ ok: true, service: "petitiondesk-backend", time: new Date().toISOString() });
});

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
    const mentioned = findMentionedInstitutions(petitionText, catalog);
    const mentionedEmails = safeUniq(mentioned.flatMap((m) => m.emails)).filter(isLikelyOfficialEmail);

    const adminCC = buildAdminOversightCC({ sector, caseType });

    const tx_ref = `pd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    petitionStore.set(tx_ref, {
      petition: petitionText,
      sector,
      caseType,
      subject,
      mentionedInstitutions: mentioned.map((m) => m.name),
      toEmails: mentionedEmails.length ? mentionedEmails : [],
      ccEmails: adminCC,
    });

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

app.post("/pay/initialize", async (req, res) => {
  try {
    const { tx_ref, email, name, phone } = req.body;
    if (!tx_ref) return res.status(400).json({ ok: false, error: "Missing tx_ref" });

    // (Optional safety) Ensure tx_ref exists
    if (!petitionStore.has(tx_ref)) {
      return res.status(404).json({ ok: false, error: "Unknown tx_ref. Generate petition again." });
    }

    // ✅ IMPORTANT FIX: redirect back to SAME PAGE WITH tx_ref
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
    console.error(err);
    res.status(500).json({ ok: false, error: "Payment error" });
  }
});

app.post("/unlock-petition", async (req, res) => {
  try {
    const { tx_ref } = req.body;
    if (!tx_ref) return res.status(400).json({ ok: false, error: "Missing tx_ref" });

    // Accept unlock if webhook marked it OR verify again
    if (!USED_TX_REFS.has(tx_ref)) {
      const { ok, data } = await flwFetch(
        `https://api.flutterwave.com/v3/transactions/verify?tx_ref=${encodeURIComponent(tx_ref)}`
      );

      const status = String(data?.data?.status || "").toLowerCase();
      const amount = Number(data?.data?.amount || 0);
      const currency = String(data?.data?.currency || "").toUpperCase();

      const verified =
        ok && status === "successful" && currency === "NGN" && amount >= PETITION_PRICE_NGN;

      if (!verified) {
        return res.status(402).json({ ok: false, error: "Payment not verified" });
      }
    }

    const stored = petitionStore.get(tx_ref);
    if (!stored) return res.status(404).json({ ok: false, error: "Petition expired" });

    USED_TX_REFS.add(tx_ref);
    petitionStore.delete(tx_ref);

    const mailto = buildMailto({
      to: stored.toEmails,
      cc: stored.ccEmails,
      subject: stored.subject,
      body: stored.petition,
    });

    res.json({
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
    console.error(err);
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
    `Webhook URL: ${
      process.env.RENDER_EXTERNAL_URL || `https://your-app.onrender.com`
    }/flw-webhook`
  );
});

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

// Use native fetch (stable in Node.js 21+ as of 2025). No extra import needed.
// If running on older Node (<21), add: import fetch from "node-fetch"; and use that.

// ---------- CONFIG ----------
const OVERSIGHT_EMAILS = {
  PCC: process.env.PCC_EMAIL || "",
  NHRC: process.env.NHRC_EMAIL || "",
  FCCPC: process.env.FCCPC_EMAIL || "",
  SERVICOM: process.env.SERVICOM_EMAIL || "",
  AGF: process.env.AGF_EMAIL || "",
};

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || "";
const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID || "";

// ===== Flutterwave Paywall CONFIG =====
const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY || "";
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || "https://petitiondesk.com";
const PETITION_PRICE_NGN = Number(process.env.PETITION_PRICE_NGN || "1050");

// in-memory anti-reuse (not persistent)
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

// ---------- PETITION PARSING ----------
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

  if (Array.isArray(sectorJson.regulators)) sectorJson.regulators.forEach((x) => addItem(x?.name || x, x));
  if (Array.isArray(sectorJson.watchdogs)) sectorJson.watchdogs.forEach((x) => addItem(x?.name || x, x));
  if (Array.isArray(sectorJson.players)) sectorJson.players.forEach((x) => addItem(x?.name || x, x));

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
  if (raw.includes("immigration")) {
    const nis = catalog.find((c) => c.norm.includes("nigeria immigration service"));
    if (nis) mentioned.push(nis);
  }
  if (raw.includes("correction") || raw.includes("prison") || raw.includes("ncos")) {
    const ncos = catalog.find((c) => c.norm.includes("nigerian correctional service"));
    if (ncos) mentioned.push(ncos);
  }
  if (raw.includes("civil defence") || raw.includes("nscdc")) {
    const nscdc = catalog.find((c) => c.norm.includes("nigeria security and civil defence corps"));
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

// ---------- GOOGLE CSE LOOKUP ----------
async function googleCseSearch(query) {
  if (!GOOGLE_API_KEY || !GOOGLE_CSE_ID) return [];
  const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(
    GOOGLE_API_KEY
  )}&cx=${encodeURIComponent(GOOGLE_CSE_ID)}&q=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  const items = Array.isArray(data.items) ? data.items : [];
  return items.map((it) => it?.link).filter(Boolean).slice(0, 5);
}

function sameDomain(email, siteUrl) {
  try {
    const host = new URL(siteUrl).hostname.replace(/^www\./, "").toLowerCase();
    const domain = String(email).split("@")[1]?.toLowerCase() || "";
    return domain === host || domain.endsWith("." + host) || host.endsWith("." + domain);
  } catch {
    return false;
  }
}

async function fetchOfficialEmailsFromUrl(url) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "PetitionDeskEmailResolver/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const emails = extractEmailsFromText(html).filter(isLikelyOfficialEmail);
    const filtered = emails.filter((e) => sameDomain(e, url));
    return safeUniq(filtered).slice(0, 10);
  } catch {
    return [];
  }
}

async function resolveMissingEmailsForInstitution(instName) {
  const q = `${instName} official website contact email`;
  const links = await googleCseSearch(q);
  for (const link of links) {
    const lower = link.toLowerCase();
    if (
      lower.includes(".gov.ng") ||
      lower.includes(".org.ng") ||
      lower.includes(".mil.ng") ||
      lower.endsWith(".ng")
    ) {
      const emails = await fetchOfficialEmailsFromUrl(link);
      if (emails.length) return emails;
    }
  }
  return [];
}

// ---------- ENDPOINTS ----------


// ===== Flutterwave Paywall =====

// Start payment
app.post("/pay/initialize", async (req, res) => {
  try {
    const amount = Number(req.body?.amount || PETITION_PRICE_NGN);
    const currency = String(req.body?.currency || "NGN");
    const email = String(req.body?.email || "user@petitiondesk.com");
    const name = String(req.body?.name || "PetitionDesk User");
    const phone = String(req.body?.phone || "");

    const tx_ref = `pd_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const redirect_url = `${FRONTEND_BASE_URL}/payment-success?tx_ref=${encodeURIComponent(tx_ref)}`;

    const payload = {
      tx_ref,
      amount,
      currency,
      redirect_url,
      customer: { email, phonenumber: phone, name },
      customizations: {
        title: "PetitionDesk",
        description: "Unlock petition actions (Send Email / Download PDF)",
      },
    };

    const { ok, data } = await flwFetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (!ok || !data?.data?.link) {
      return res.status(400).json({ ok: false, error: data?.message || "Flutterwave init failed" });
    }

    return res.json({ ok: true, tx_ref, link: data.data.link });
  } catch (e) {
    console.error("pay/initialize error:", e);
    return res.status(500).json({ ok: false, error: "Payment init error" });
  }
});

// Verify payment
app.get("/pay/verify", async (req, res) => {
  try {
    const transaction_id = String(req.query?.transaction_id || "").trim();
    const tx_ref = String(req.query?.tx_ref || "").trim();

    if (!transaction_id && !tx_ref) {
      return res.status(400).json({ ok: false, error: "Missing transaction_id or tx_ref" });
    }

    // Prefer transaction verify (Flutterwave best practice)
    if (transaction_id) {
      const { ok, data } = await flwFetch(
        `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(transaction_id)}/verify`,
        { method: "GET" }
      );

      if (!ok) return res.status(400).json({ ok: false, error: data?.message || "Verify failed" });

      const d = data?.data || {};
      const paidStatus = String(d.status || "").toLowerCase();
      const paidAmount = Number(d.amount || 0);
      const paidCurrency = String(d.currency || "");
      const ref = String(d.tx_ref || tx_ref || "");

      if (ref && USED_TX_REFS.has(ref)) {
        return res.status(400).json({ ok: false, error: "This payment reference has already been used." });
      }

      const okPaid =
        (paidStatus === "successful" || paidStatus === "success") &&
        paidCurrency === "NGN" &&
        paidAmount >= PETITION_PRICE_NGN;

      if (!okPaid) {
        return res.status(400).json({ ok: false, error: "Payment not successful or amount mismatch", tx_ref: ref });
      }

      if (ref) USED_TX_REFS.add(ref);

      return res.json({ ok: true, tx_ref: ref, amount: paidAmount, currency: paidCurrency, status: paidStatus });
    }

    // tx_ref-only verify not supported (needs transaction_id)
    return res.status(400).json({ ok: false, error: "transaction_id required for verification" });
  } catch (e) {
    console.error("pay/verify error:", e);
    return res.status(500).json({ ok: false, error: "Payment verify error" });
  }
});

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "petitiondesk-backend", time: new Date().toISOString() });
});

app.post("/classify-sector", async (req, res) => {
  const complaint = req.body.complaint || "";
  if (!process.env.OPENAI_API_KEY) return res.json({ sector: detectSector(complaint) });

  try {
    const ai = await openai.chat.completions.create({
      model: "gpt-5.2", // Updated to latest flagship model as of Dec 2025
      messages: [
        {
          role: "system",
          content:
            "Classify the complaint into exactly one sector: power, aviation, banking, telecoms, education, health, security, judiciary, international_escalation.",
        },
        { role: "user", content: complaint },
      ],
    });
    const raw = (ai.choices?.[0]?.message?.content || "").trim().toLowerCase();
    const allowed = new Set([
      "power",
      "aviation",
      "banking",
      "telecoms",
      "education",
      "health",
      "security",
      "judiciary",
      "international_escalation",
    ]);
    res.json({ sector: allowed.has(raw) ? raw : detectSector(complaint) });
  } catch (err) {
    console.error("Classification error:", err);
    res.json({ sector: detectSector(complaint) });
  }
});

app.post("/generate-petition", async (req, res) => {
  const complaint = req.body.complaint || "";
  const sector = (req.body.sector || detectSector(complaint) || "unknown").toLowerCase();

  const petitioner = req.body.petitioner || {};
  const pName = petitioner.fullName || "[Your Full Name]";
  const pAddress = petitioner.address || "[Your Address]";
  const pPhone = petitioner.phone || "[Phone Number]";
  const pEvidence = petitioner.evidenceName || "None";

  if (sector === "unknown") return res.status(400).json({ error: "Sector not recognized." });

  if (!process.env.OPENAI_API_KEY) {
    return res.json({ sector, petition: "❌ OPENAI_API_KEY not set." });
  }

  try {
    const autoDate = new Date().toLocaleDateString("en-GB");
    const caseType = inferCaseType(sector);

    const ai = await openai.chat.completions.create({
      model: "gpt-5.2", // Updated to latest model
      messages: [
        {
          role: "system",
          content: `
Draft a well-structured Nigerian petition letter with clear sections and spacing.
MANDATORY OUTPUT FORMAT (exact headings):

Date: ${autoDate}

PETITIONER DETAILS:
Name: ${pName}
Address: ${pAddress}
Phone: ${pPhone}
Evidence/Attachments: ${pEvidence}

TO: [Primary institution]

THROUGH: [If appropriate — NEVER PCC]

CC: [Relevant oversight bodies]

IMPORTANT: For domestic cases, PCC MUST be in CC (not Through).

SUBJECT: [Strong subject line]

FACTS: [Numbered points]

APPLICABLE LEGAL/RIGHTS FRAMEWORK:
[Cite relevant Constitution sections, Acts, regulations]

RELIEFS SOUGHT: [Numbered]

ATTACHMENTS: [List]

SIGNATURE: [Name + phone]

Keep readable with blank lines between sections.
Sector: ${sector} | CaseType: ${caseType}
`.trim(),
        },
        { role: "user", content: `Complaint:\n${complaint}` },
      ],
    });

    const petitionText = ai.choices?.[0]?.message?.content?.trim() || "❌ Generation failed.";
    const subject = extractSubjectFromPetition(petitionText) || "";

    res.json({ petition: petitionText, sector, date: autoDate, subject });
  } catch (err) {
    console.error("Petition generation error:", err);
    res.json({ petition: "❌ Failed to generate petition.", sector });
  }
});

app.post("/email-draft", async (req, res) => {
  try {
    const { complaint = "", sector: sectorIn = "", petitionText = "" } = req.body;
    const sector = (sectorIn || detectSector(complaint) || "unknown").toLowerCase();
    if (sector === "unknown") return res.status(400).json({ error: "Sector not recognized." });

    const caseType = inferCaseType(sector);
    const adminCC = buildAdminOversightCC({ sector, caseType });
    const sectorJson = loadSectorJson(sector);
    const catalog = buildInstitutionCatalog(sectorJson);
    const mentioned = findMentionedInstitutions(petitionText || complaint, catalog);

    let mentionedEmails = safeUniq(mentioned.flatMap((m) => m.emails)).filter(isEmail);

    if (mentionedEmails.length === 0 && mentioned.length > 0) {
      for (const m of mentioned) {
        const rescued = await resolveMissingEmailsForInstitution(m.name);
        if (rescued.length) {
          mentionedEmails = safeUniq([...mentionedEmails, ...rescued]).filter(isEmail);
        }
      }
    }

    if (mentionedEmails.length === 0 && sectorJson) {
      const fallback = safeUniq(extractEmailsDeep(sectorJson)).filter(isEmail);
      mentionedEmails = fallback.slice(0, 15);
    }

    const subject = extractSubjectFromPetition(petitionText) || `Petition — ${new Date().toLocaleDateString("en-GB")}`;
    const body = (petitionText || complaint || "").toString();

    const toFull = safeUniq(mentionedEmails).filter(isEmail);
    const ccFull = safeUniq([...adminCC, ...mentionedEmails.filter(e => !toFull.includes(e))]).filter(isEmail); // Avoid duplicates

    const toMailto = toFull.slice(0, 10);
    const ccMailto = ccFull.slice(0, 10);

    const mailto = buildMailto({ to: toMailto, cc: ccMailto, subject, body });

    if (!mailto) {
      return res.status(404).json({
        error: "No verified emails found.",
        note: "Check sector JSON or enable Google CSE.",
        mentionedInstitutions: mentioned.map(m => m.name),
      });
    }

    res.json({
      sector,
      caseType,
      subject,
      mentionedInstitutions: mentioned.map(m => m.name),
      to: toFull,
      cc: ccFull,
      mailto,
    });
  } catch (err) {
    console.error("Email draft error:", err);
    res.status(500).json({ error: "Failed to build email draft." });
  }
});

app.get("/download-pdf", (req, res) => {
  try {
    const sector = String(req.query.sector || "").trim();
    const textRaw = String(req.query.text || "");
    if (!sector || !textRaw) return res.status(400).send("Invalid request");

    const decoded = decodeURIComponent(textRaw);
    const filename = `${sector}-petition.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    const pdf = new PDFDocument({ margin: 40 });
    pdf.pipe(res);

    pdf.fontSize(16).text("PETITION", { align: "center" });
    pdf.moveDown(0.5);
    pdf.fontSize(11).text(`Sector: ${sector.toUpperCase()}`);
    pdf.fontSize(11).text(`Date: ${new Date().toLocaleDateString("en-GB")}`);
    pdf.moveDown(1);
    pdf.fontSize(12).text(decoded);
    pdf.moveDown(2);
    pdf.fontSize(8).text("Powered by PetitionDesk", { align: "center" });

    pdf.end();
  } catch (err) {
    console.error("PDF error:", err);
    res.status(500).send("Failed to generate PDF");
  }
});

app.listen(process.env.PORT || 3000, "0.0.0.0", () => {
  console.log(`🚀 PetitionDesk backend running on port ${process.env.PORT || 3000}`);
});


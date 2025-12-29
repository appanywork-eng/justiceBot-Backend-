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

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || "";
const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID || "";

// ---------- HELPERS ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function safeUniq(arr) {
  return [...new Set((arr || []).filter(Boolean))];
}

function isEmail(s) {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

// Avoid obvious junk addresses
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
  // common no-reply junk
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
  if (typeof value === "object") Object.values(value).forEach((v) => extractEmailsDeep(v, out));
  return out;
}

function loadSectorJson(sector) {
  const filePath = path.join(__dirname, "data", `${sector}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function detectSector(text) {
  const lower = (text || "").toLowerCase();
  const map = {
    power: ["electricity", "nepa", "aedc", "transformer", "power", "disco", "tcn", "nbet", "nerc"],
    aviation: ["flight", "airport", "airline", "ncaa", "faaan", "aviation"],
    banking: ["bank", "atm", "pos", "debit", "transfer", "chargeback", "unlawful debit", "c bn", "cbn"],
    telecoms: ["airtime", "data", "network", "sim", "telecom", "ncc", "mtn", "airtel", "glo", "9mobile"],
    education: ["school", "university", "waec", "jamb", "nuc", "education", "tetfund"],
    health: ["hospital", "clinic", "doctor", "ncdc", "nhis", "medical", "health"],
    security: ["police", "army", "navy", "airforce", "nscdc", "unlawful arrest", "immigration", "corrections", "detention", "brutality"],
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

// PCC must be CC for Nigerian domestic cases (NOT Through)
function buildAdminOversightCC({ sector, caseType }) {
  const cc = [];

  // Always CC PCC for domestic Nigeria
  if (sector !== "international_escalation" && OVERSIGHT_EMAILS.PCC) cc.push(OVERSIGHT_EMAILS.PCC);

  if (caseType === "human_rights" && OVERSIGHT_EMAILS.NHRC) cc.push(OVERSIGHT_EMAILS.NHRC);

  if (caseType === "service_delivery") {
    if (OVERSIGHT_EMAILS.SERVICOM) cc.push(OVERSIGHT_EMAILS.SERVICOM);
    if (OVERSIGHT_EMAILS.FCCPC) cc.push(OVERSIGHT_EMAILS.FCCPC);
  }

  if (sector === "international_escalation" && OVERSIGHT_EMAILS.AGF) cc.push(OVERSIGHT_EMAILS.AGF);

  return safeUniq(cc).filter(isEmail);
}

/**
 * IMPORTANT:
 * - DO NOT encode the "to" list in mailto (it breaks parsing on many clients).
 * - Encode subject/body/cc only.
 */
function buildMailto({ to = [], cc = [], subject = "", body = "" }) {
  const toList = safeUniq(to).filter(isEmail).slice(0, 10).join(",");
  const ccList = safeUniq(cc).filter(isEmail).slice(0, 10).join(",");

  if (!toList) return null;

  const s = encodeURIComponent(subject || "");
  const b = encodeURIComponent(body || "");
  const ccParam = ccList ? `&cc=${encodeURIComponent(ccList)}` : "";

  return `mailto:${toList}?subject=${s}&body=${b}${ccParam}`;
}

// ---------- PETITION PARSING (subject + institution mentions) ----------
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

// Build a catalog of {name, emails[]} from the sector JSON (works with your current structure)
function buildInstitutionCatalog(sectorJson) {
  const items = [];

  function addItem(name, obj) {
    if (!name) return;
    const emails = safeUniq(extractEmailsDeep(obj)).filter(isEmail);
    items.push({ name: String(name), norm: normalizeName(name), emails });
  }

  if (!sectorJson || typeof sectorJson !== "object") return items;

  // Common structures we saw in your files:
  if (sectorJson.oversight && typeof sectorJson.oversight === "object") {
    for (const key of Object.keys(sectorJson.oversight)) {
      const node = sectorJson.oversight[key];
      addItem(node?.name || key, node);
    }
  }

  if (Array.isArray(sectorJson.core_institutions)) {
    for (const inst of sectorJson.core_institutions) {
      addItem(inst?.name, inst);
    }
  }

  // Fallback generic
  if (Array.isArray(sectorJson.regulators)) sectorJson.regulators.forEach((x) => addItem(x?.name || x?.title, x));
  if (Array.isArray(sectorJson.watchdogs)) sectorJson.watchdogs.forEach((x) => addItem(x?.name || x?.title, x));
  if (Array.isArray(sectorJson.players)) sectorJson.players.forEach((x) => addItem(x?.name || x?.title, x));

  return items;
}

function findMentionedInstitutions(petitionText, catalog) {
  const text = normalizeName(petitionText);
  const mentioned = [];

  for (const item of catalog) {
    if (!item?.norm) continue;
    // simple contains match (works for “Nigeria Police Force (NPF)” etc.)
    if (text.includes(item.norm)) mentioned.push(item);
  }

  // Extra “smart” security shortcuts (so "police brutality" → NPF even if AI didn't write full name)
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
    const ncos = catalog.find((c) => c.norm.includes("correctional service"));
    if (ncos) mentioned.push(ncos);
  }
  if (raw.includes("civil defence") || raw.includes("nscdc")) {
    const nscdc = catalog.find((c) => c.norm.includes("civil defence"));
    if (nscdc) mentioned.push(nscdc);
  }

  // uniq by norm
  const uniq = [];
  const seen = new Set();
  for (const m of mentioned) {
    if (!m?.norm || seen.has(m.norm)) continue;
    seen.add(m.norm);
    uniq.push(m);
  }
  return uniq;
}

// ---------- GOOGLE CSE LOOKUP (official-site-only email rescue) ----------
async function googleCseSearch(query) {
  if (!GOOGLE_API_KEY || !GOOGLE_CSE_ID) return [];
  const url =
    `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(GOOGLE_API_KEY)}` +
    `&cx=${encodeURIComponent(GOOGLE_CSE_ID)}` +
    `&q=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  const items = Array.isArray(data.items) ? data.items : [];
  return items
    .map((it) => it?.link)
    .filter(Boolean)
    .slice(0, 5); // keep it small & safe
}

function sameDomain(email, siteUrl) {
  try {
    const host = new URL(siteUrl).hostname.replace(/^www\./, "").toLowerCase();
    const domain = String(email).split("@")[1]?.toLowerCase() || "";
    // allow subdomains
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
        "Accept": "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return [];
    const html = await res.text();

    const emails = extractEmailsFromText(html).filter(isLikelyOfficialEmail);

    // Keep only emails likely tied to this domain
    const filtered = emails.filter((e) => sameDomain(e, url));
    return safeUniq(filtered).slice(0, 10);
  } catch {
    return [];
  }
}

async function resolveMissingEmailsForInstitution(instName) {
  // Search for official contact pages
  const q = `${instName} official website contact email`;
  const links = await googleCseSearch(q);

  for (const link of links) {
    // only accept “official-looking” domains quickly (gov.ng etc) – helps avoid junk
    const lower = link.toLowerCase();
    if (
      !(
        lower.includes(".gov.ng") ||
        lower.includes(".org.ng") ||
        lower.includes(".mil.ng") ||
        lower.includes(".ng/") ||
        lower.includes(".ng")
      )
    ) {
      continue;
    }

    const emails = await fetchOfficialEmailsFromUrl(link);
    if (emails.length) return emails;
  }
  return [];
}

// ---------- BASIC HEALTH ----------
app.get("/health", (req, res) => {
  res.json({ ok: true, service: "petitiondesk-backend", time: new Date().toISOString() });
});

// ---------- AI SECTOR CLASSIFICATION ----------
app.post("/classify-sector", async (req, res) => {
  const complaint = req.body.complaint || "";

  // fallback if no key
  if (!process.env.OPENAI_API_KEY) return res.json({ sector: detectSector(complaint) });

  try {
    const ai = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            'Classify into exactly one of: power, aviation, banking, telecoms, education, health, security, judiciary, international_escalation. Respond ONLY with that one word in lowercase.',
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
  } catch {
    res.json({ sector: detectSector(complaint) });
  }
});

// ---------- PETITION GENERATION ----------
app.post("/generate-petition", async (req, res) => {
  const complaint = req.body.complaint || "";
  const sector = (req.body.sector || detectSector(complaint) || "unknown").toLowerCase();

  // 👇 NEW: receive petitioner details so AI writes them inside, not placeholders
  const petitioner = req.body.petitioner || {};
  const pName = petitioner.fullName || "[Your Full Name]";
  const pAddress = petitioner.address || "[Your Address]";
  const pPhone = petitioner.phone || "[Phone Number]";
  const pEvidence = petitioner.evidenceName || "None";

  if (sector === "unknown") return res.status(400).json({ petition: "❌ Sector not recognized.", sector });

  if (!process.env.OPENAI_API_KEY) {
    return res.json({
      sector,
      petition: "❌ OPENAI_API_KEY not set on backend. Set it and restart.",
    });
  }

  try {
    const autoDate = new Date().toLocaleDateString("en-GB");
    const caseType = inferCaseType(sector);

    const ai = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
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

TO:
[Put the correct primary institution for this matter]

THROUGH:
[Only if appropriate for that sector's oversight/regulator chain — NEVER PCC]

CC:
[Include the relevant watchdogs and oversight]
- IMPORTANT RULE: For domestic Nigeria cases, PCC MUST appear in CC list (not Through).

SUBJECT:
[One strong subject line]

FACTS:
[Numbered points]

APPLICABLE LEGAL/RIGHTS FRAMEWORK:
- Cite relevant Nigerian Constitution fundamental rights sections where relevant
- Cite relevant Acts/regulations for the sector where relevant
- Do NOT impersonate a lawyer

RELIEFS SOUGHT:
[Numbered]

ATTACHMENTS:
[List]

SIGNATURE:
[Name + phone]

Keep it readable, with blank lines between sections.
Sector: ${sector}
CaseType: ${caseType}
`.trim(),
        },
        { role: "user", content: `Complaint:\n${complaint}` },
      ],
    });

    const petitionText = ai.choices?.[0]?.message?.content?.trim() || "❌ Failed to generate petition.";
    const subject = extractSubjectFromPetition(petitionText) || "";

    res.json({ petition: petitionText, sector, date: autoDate, subject });
  } catch {
    res.json({ petition: "❌ Failed to generate petition.", sector });
  }
});

// ---------- EMAIL DRAFT (routing matches petition mentions + web lookup for missing emails) ----------
app.post("/email-draft", async (req, res) => {
  try {
    const { complaint = "", sector: sectorIn = "", petitionText = "" } = req.body || {};
    const sector = (sectorIn || detectSector(complaint) || "unknown").toLowerCase();
    if (sector === "unknown") return res.status(400).json({ error: "Sector not recognized." });

    const caseType = inferCaseType(sector);
    const adminCC = buildAdminOversightCC({ sector, caseType });

    const sectorJson = loadSectorJson(sector);
    const catalog = buildInstitutionCatalog(sectorJson);

    // 1) Find which institutions are actually mentioned in the petition
    const mentioned = findMentionedInstitutions(petitionText || complaint, catalog);

    // 2) Build TO and CC strictly from mentioned institutions (plus admin CC rule)
    // We treat the first “TO:” institution mentioned as TO, others can be CC if needed,
    // BUT email clients limit recipients; we keep it simple: TO = mentioned emails, CC = admin oversight.
    let mentionedEmails = safeUniq(mentioned.flatMap((m) => m.emails)).filter(isEmail);

    // 3) If mentioned institution has USE_DYNAMIC_LOOKUP, do web lookup (official site) to rescue emails
    // We only do lookup if mentioned emails are empty.
    if (mentionedEmails.length === 0 && mentioned.length > 0) {
      for (const m of mentioned) {
        const rescued = await resolveMissingEmailsForInstitution(m.name);
        if (rescued.length) {
          mentionedEmails = safeUniq([...mentionedEmails, ...rescued]).filter(isEmail);
        }
      }
    }

    // 4) If still empty, fallback to deep extraction for the sector (but this is your “last resort”)
    // This prevents “email scrape doesn’t work” hard failure.
    if (mentionedEmails.length === 0 && sectorJson) {
      const fallback = safeUniq(extractEmailsDeep(sectorJson)).filter(isEmail);
      mentionedEmails = fallback.slice(0, 15);
    }

    // Subject = subject inside petition
    const subjectFromPetition = extractSubjectFromPetition(petitionText) || "";
    const subject = subjectFromPetition || `Official Petition Submission — ${new Date().toLocaleDateString("en-GB")}`;
    const body = (petitionText || complaint || "").toString();

    // TO and CC lists
    const toFull = safeUniq(mentionedEmails).filter(isEmail);
    const ccFull = safeUniq(adminCC).filter(isEmail);

    // mailto safe (client limits)
    const toMailto = toFull.slice(0, 10);
    const ccMailto = ccFull.slice(0, 10);

    const mailto = buildMailto({ to: toMailto, cc: ccMailto, subject, body });

    if (!mailto) {
      return res.status(404).json({
        error: "No verified emails found for routing.",
        sector,
        caseType,
        mentionedInstitutions: mentioned.map((m) => m.name),
        to: toFull,
        cc: ccFull,
        note:
          "Fix the sector JSON official emails OR enable GOOGLE_API_KEY + GOOGLE_CSE_ID for web rescue.",
      });
    }

    res.json({
      sector,
      caseType,
      subject,
      mentionedInstitutions: mentioned.map((m) => m.name),
      to: toFull,
      cc: ccFull,
      mailto_to: toMailto,
      mailto_cc: ccMailto,
      truncated: {
        to: toFull.length > toMailto.length,
        cc: ccFull.length > ccMailto.length,
      },
      mailto,
    });
  } catch (e) {
    res.status(500).json({ error: "Failed to build email draft." });
  }
});

// ---------- PDF DOWNLOAD ----------
app.get("/download-pdf", (req, res) => {
  try {
    const sector = String(req.query.sector || "").trim();
    const textRaw = String(req.query.text || "");
    if (!sector || !textRaw) return res.status(400).send("Invalid request");

    let decoded = "";
    try {
      decoded = decodeURIComponent(textRaw);
    } catch {
      decoded = textRaw;
    }

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
  } catch {
    res.status(500).send("Failed to generate PDF");
  }
});

// ---------- START SERVER ----------
app.listen(process.env.PORT || 3000, "0.0.0.0", () => {
  console.log(`🚀 PetitionDesk backend running on port ${process.env.PORT || 3000}`);
});

export default app;

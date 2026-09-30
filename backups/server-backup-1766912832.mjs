import express from "express";
import cors from "cors";
import OpenAI from "openai";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ---------- CONFIG (NO INVENTED CONTACTS) ----------
const OVERSIGHT_EMAILS = {
  PCC: process.env.PCC_EMAIL || "",
  NHRC: process.env.NHRC_EMAIL || "",
  FCCPC: process.env.FCCPC_EMAIL || "",
  SERVICOM: process.env.SERVICOM_EMAIL || "",
  AGF: process.env.AGF_EMAIL || "" // Attorney-General of the Federation (optional, used only for international_escalation when needed)
};

// ---------- HELPERS ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function safeUniq(arr) {
  return [...new Set((arr || []).filter(Boolean))];
}

function isEmail(s) {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

// Deep-scan any JSON object for emails (works even if schema changes)
function extractEmailsDeep(value, out = []) {
  if (value == null) return out;
  if (typeof value === "string") {
    const maybe = value.trim();
    if (isEmail(maybe)) out.push(maybe);
    return out;
  }
  if (Array.isArray(value)) {
    for (const v of value) extractEmailsDeep(v, out);
    return out;
  }
  if (typeof value === "object") {
    for (const k of Object.keys(value)) extractEmailsDeep(value[k], out);
    return out;
  }
  return out;
}

function loadSectorJson(sector) {
  // Your files are in ./data/<sector>.json
  const filePath = path.join(__dirname, "data", `${sector}.json`);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function buildMailto({ to = [], cc = [], subject = "", body = "" }) {
  // mailto supports comma-separated to/cc; body/subject must be URL-encoded
  const toStr = safeUniq(to).join(",");
  const ccStr = safeUniq(cc).join(",");
  const params = new URLSearchParams();
  if (ccStr) params.set("cc", ccStr);
  if (subject) params.set("subject", subject);
  if (body) params.set("body", body);
  return `mailto:${encodeURIComponent(toStr)}?${params.toString()}`;
}

// Case-type rules (your policy)
function inferCaseType(sector, complaintText = "") {
  // baseline:
  if (sector === "security" || sector === "judiciary") return "human_rights";
  if (
    sector === "health" ||
    sector === "telecoms" ||
    sector === "aviation" ||
    sector === "banking" ||
    sector === "power" ||
    sector === "education"
  ) return "service_delivery";

  // international escalation tends to be human_rights / diplomacy
  if (sector === "international_escalation") return "international";

  // fallback heuristic for admin matters
  const t = (complaintText || "").toLowerCase();
  const adminHints = [
    "promotion","retirement","resignation","disciplinary","query",
    "salary","allowance","pension","posting","transfer","appointment",
    "employment","recruitment","confirmation","civil service","ministry","agency","mdas"
  ];
  if (adminHints.some(w => t.includes(w))) return "administrative";

  return "other";
}

function buildOversightCC({ sector, caseType }) {
  const cc = [];

  // Always copy PCC for administrative cases
  if (caseType === "administrative") {
    if (OVERSIGHT_EMAILS.PCC) cc.push(OVERSIGHT_EMAILS.PCC);
  }

  // Human rights cases: NHRC + PCC
  if (caseType === "human_rights") {
    if (OVERSIGHT_EMAILS.NHRC) cc.push(OVERSIGHT_EMAILS.NHRC);
    if (OVERSIGHT_EMAILS.PCC) cc.push(OVERSIGHT_EMAILS.PCC);
  }

  // Service delivery: FCCPC + SERVICOM
  // (explicitly NOT for police/security or judiciary)
  if (caseType === "service_delivery") {
    if (OVERSIGHT_EMAILS.FCCPC) cc.push(OVERSIGHT_EMAILS.FCCPC);
    if (OVERSIGHT_EMAILS.SERVICOM) cc.push(OVERSIGHT_EMAILS.SERVICOM);
  }

  // International escalation: sometimes add AGF (optional)
  // We do NOT add by default unless you request it from frontend or complaint hints it strongly.
  if (sector === "international_escalation") {
    // keep it optional; frontend can pass forceAgf=true when desired
  }

  return safeUniq(cc);
}

// ---------- Keyword-based sector detection (fallback) ----------
const keywords = {
  power: ["electricity", "nepa", "aedc", "transformer", "power"],
  aviation: ["flight", "airport", "airline", "ncaa", "aviation"],
  banking: ["bank", "fintech", "atm", "pos", "debit", "transfer", "unlawful debit"],
  telecoms: ["airtime", "data", "network", "sim", "telecom", "ncc"],
  education: ["school", "university", "neco", "waec", "jamb", "nuc", "education"],
  health: ["hospital", "clinic", "nhis", "doctor", "ncdc", "nma", "medical"],
  security: ["police", "army", "navy", "airforce", "nscdc", "nigeria security", "unlawful arrest"],
  judiciary: ["court", "judge", "lawyer", "justice", "supreme", "petition"],
  international_escalation: ["un", "ecowas", "au", "icc", "eu", "afdb", "international court"]
};

function detectSector(text) {
  const lower = (text || "").toLowerCase();
  for (const [sector, words] of Object.entries(keywords)) {
    if (words.some(w => lower.includes(w))) return sector;
  }
  return "unknown";
}

// ---------- AI-powered sector classifier ----------
app.post("/classify-sector", async (req, res) => {
  const complaint = req.body.complaint || "";
  try {
    const ai = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: `Classify the complaint into ONLY one of these Nigerian sectors:
power, aviation, banking, telecoms, education, health, security, judiciary, international_escalation.
Respond ONLY with the sector name in lowercase, nothing else.`
        },
        { role: "user", content: complaint }
      ]
    });
    const sector = ai.choices[0].message.content.trim().toLowerCase();
    res.json({ sector });
  } catch (err) {
    console.warn("Classifier error:", err?.message || err);
    res.json({ sector: "unknown" });
  }
});

// ---------- Petition generator (NO lawyer/SAN tagging) ----------
app.post("/generate-petition", async (req, res) => {
  const complaint = req.body.complaint || "";
  let sector = req.body.sector || detectSector(complaint);

  if (sector === "unknown") {
    try {
      const ai = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content: `Classify the complaint into ONLY one of these Nigerian sectors:
power, aviation, banking, telecoms, education, health, security, judiciary, international_escalation.
Respond ONLY with the sector name in lowercase, nothing else.`
          },
          { role: "user", content: complaint }
        ]
      });
      sector = ai.choices[0].message.content.trim().toLowerCase();
    } catch {
      return res.status(400).json({ petition: "❌ Sector not recognized." });
    }
  }

  if (sector === "unknown") return res.status(400).json({ petition: "❌ Sector not recognized." });

  try {
    const ai = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
`Draft a formal Nigerian petition using:
To:
Through: (if applicable)
CC:
Subject:
Body:
Reliefs Sought:
Conclusion:
Signature block:

IMPORTANT RULES:
- Do NOT claim the writer is a lawyer, SAN, counsel, or law firm.
- Write as a normal petitioner / victim / eyewitness / representative.
- Do NOT include personal names (use placeholders like [Full Name], [Address], [Phone], [Email]).
- Be formal, factual, persuasive, and well-structured with clean spacing.`
        },
        { role: "user", content: `Sector: ${sector}\nComplaint: ${complaint}` }
      ]
    });

    const petition = ai.choices[0].message.content.trim();
    res.json({ petition, sector });
  } catch {
    res.json({ petition: "❌ Failed to generate petition." });
  }
});

// ---------- Email auto-fill endpoint (core JusticeBot objective) ----------
app.post("/email-draft", async (req, res) => {
  try {
    const { complaint = "", sector: sectorIn = "", petition = "", forceAgf = false } = req.body || {};
    const sector = sectorIn || detectSector(complaint) || "unknown";
    if (sector === "unknown") {
      return res.status(400).json({ error: "Sector not recognized for email routing." });
    }

    const caseType = inferCaseType(sector, complaint);

    // 1) pull verified emails from your sector JSON file
    const sectorJson = loadSectorJson(sector);
    const extracted = sectorJson ? extractEmailsDeep(sectorJson) : [];
    const sectorEmails = safeUniq(extracted);

    // 2) apply oversight CC rules
    let cc = buildOversightCC({ sector, caseType });

    // International escalation: optionally add AGF when you want it
    if (sector === "international_escalation" && forceAgf && OVERSIGHT_EMAILS.AGF) {
      cc = safeUniq([...cc, OVERSIGHT_EMAILS.AGF]);
    }

    // 3) Build subject/body
    const subject = "Official Petition";
    const body = petition || complaint || "";

    // 4) To = sector primary emails (cap to avoid mailto length issues)
    // If you want ALL emails, increase cap, but mailto may break on phones if too long.
    const to = sectorEmails.slice(0, 10);

    const mailto = buildMailto({ to, cc, subject, body });

    res.json({
      sector,
      caseType,
      to,
      cc,
      subject,
      body,
      mailto,
      notes: {
        toCountAvailableInData: sectorEmails.length,
        toLimitApplied: 10
      }
    });
  } catch (e) {
    console.warn("email-draft error:", e?.message || e);
    res.status(500).json({ error: "Failed to build email draft." });
  }
});

// Start server (no regression)
app.listen(process.env.PORT || 3000, "0.0.0.0", () => {
  console.log(`🚀 JusticeBot backend running on port ${process.env.PORT || 3000}`);
});

export default app;

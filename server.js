import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import fetch from "node-fetch";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";
const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";

// -----------------------------
// Load institutions database
// -----------------------------
const dataDir = path.join(process.cwd(), "data");
const institutionsFile = path.join(dataDir, "institutions.json");

let institutionsDb = {};

function loadInstitutions() {
  try {
    const raw = fs.readFileSync(institutionsFile, "utf8");
    institutionsDb = JSON.parse(raw);
    console.log("📘 Institutions database loaded successfully.");
  } catch (err) {
    console.error("❌ Failed to load institutions database:", err.message);
    institutionsDb = {};
  }
}

loadInstitutions();

// -----------------------------
// Helper: classify complaint
// -----------------------------
function classifyComplaint(message) {
  const text = message.toLowerCase();

  if (
    text.includes("police") ||
    text.includes("sars") ||
    text.includes("station") ||
    text.includes("detain") ||
    text.includes("arrest")
  ) {
    return "police_abuse";
  }

  if (
    text.includes("salary") ||
    text.includes("wage") ||
    text.includes("unpaid") ||
    text.includes("employer") ||
    text.includes("labour")
  ) {
    return "unpaid_salary";
  }

  return "general";
}

// -----------------------------
// Helper: rights + steps
// -----------------------------
function buildRightsAndSteps(category) {
  if (category === "police_abuse") {
    return {
      rights: [
        "You have the right to dignity and fair treatment.",
        "Police must state your offence and allow access to family/lawyer.",
        "You may report misconduct to PCRRU, PSC or NHRC."
      ],
      steps: [
        "Record the officer's name or vehicle plate if possible.",
        "Report to PCRRU immediately (by email or WhatsApp).",
        "Escalate to PSC and NHRC if unresolved."
      ]
    };
  }

  if (category === "unpaid_salary") {
    return {
      rights: [
        "You have the right to be paid agreed wages for work done.",
        "You are protected from unfair labour practices under Nigerian labour laws."
      ],
      steps: [
        "Write a formal internal complaint to HR / your employer.",
        "Request a written explanation and a clear timeline for payment.",
        "If unresolved, complain to the Federal or State Ministry of Labour."
      ]
    };
  }

  // general
  return {
    rights: [
      "You have the right to seek redress when your rights or interests are violated.",
      "You may write a formal petition to oversight and complaint institutions."
    ],
    steps: [
      "Write down the facts: what happened, when, where, who is involved.",
      "Gather evidence: documents, screenshots, witnesses' contacts.",
      "Submit a petition to PCC, NHRC or any relevant regulator."
    ]
  };
}

// -----------------------------
// Helper: find institutions
// -----------------------------
function getInstitutionsForCategory(category) {
  return institutionsDb[category] || [];
}

// -----------------------------
// Helper: build petition draft
// -----------------------------
function buildPetitionDraft(message, category, institutions) {
  const today = new Date().toLocaleDateString("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });

  const main = institutions[0] || null;
  const ccList = institutions.slice(1);

  let subject;
  if (category === "police_abuse") subject = "POLICE ABUSE / MISCONDUCT";
  else if (category === "unpaid_salary") subject = "UNPAID SALARY / LABOUR RIGHTS VIOLATION";
  else subject = "FORMAL COMPLAINT / PETITION";

  const lines = [];

  lines.push(`PETITION REGARDING: ${subject}`);
  lines.push("");
  lines.push(today);
  lines.push("");

  if (main) {
    if (main.authorityTitle) lines.push(main.authorityTitle);
    lines.push(main.name);
    if (main.address) lines.push(main.address);
    lines.push("");
  }

  if (ccList.length > 0) {
    lines.push("CC:");
    ccList.forEach((inst) => {
      if (inst.authorityTitle) {
        lines.push(`- ${inst.authorityTitle}, ${inst.name}`);
      } else {
        lines.push(`- ${inst.name}`);
      }
    });
    lines.push("");
  }

  lines.push("Dear Sir/Madam,");
  lines.push("");
  lines.push("I, [Your Full Name], hereby report the following issue:");
  lines.push("");
  lines.push(`"${message.trim()}"`);
  lines.push("");
  lines.push(
    "I respectfully request that your office investigate this matter and take all necessary action in accordance with the law and established procedures."
  );
  lines.push("");
  lines.push("Respectfully submitted,");
  lines.push("[Your Full Name]");
  lines.push("[Your Phone Number]");
  lines.push("[Your Email]");
  lines.push("");
  return lines.join("\n");
}

// -----------------------------
// DeepSeek call (optional)
// -----------------------------
async function callDeepSeek(message, category) {
  if (!DEEPSEEK_API_KEY) {
    // no key: just return null; we already have rule-based logic
    return null;
  }

  try {
    const payload = {
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content:
            "You are a Nigerian legal assistant. Explain rights and steps very briefly in bullet points."
        },
        {
          role: "user",
          content: `User complaint (category: ${category}): ${message}`
        }
      ]
    };

    const res = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      console.error("❌ DeepSeek API error:", errBody);
      return null;
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content || "";
    return reply;
  } catch (err) {
    console.error("❌ Error calling DeepSeek:", err.message);
    return null;
  }
}

// -----------------------------
// POST /api/ask
// -----------------------------
app.post("/api/ask", async (req, res) => {
  const { message } = req.body || {};
  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "message is required" });
  }

  console.log("📩 Incoming message:", message);

  const category = classifyComplaint(message);
  const { rights, steps } = buildRightsAndSteps(category);
  const institutions = getInstitutionsForCategory(category);
  const petitionDraft = buildPetitionDraft(message, category, institutions);

  // Optional: try DeepSeek for extra advice (we don't break if it fails)
  const deepseekAdvice = await callDeepSeek(message, category);

  res.json({
    detectedCategory: category,
    rights,
    steps,
    institutions,
    petitionDraft,
    extraAdvice: deepseekAdvice
  });
});

// -----------------------------
// POST /api/pdf  -> generate PDF
// -----------------------------
app.post("/api/pdf", (req, res) => {
  const { petitionText, style } = req.body || {};
  if (!petitionText) {
    return res.status(400).json({ error: "petitionText is required" });
  }

  const doc = new PDFDocument({
    margin: 50
  });

  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  doc.on("end", () => {
    const pdfBuffer = Buffer.concat(chunks);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=petition.pdf");
    res.send(pdfBuffer);
  });

  if (style === "modern") {
    doc.fontSize(18).text("Petition / Complaint", { align: "center" });
    doc.moveDown();
    doc.fontSize(11).text(petitionText);
  } else {
    // formal legal
    doc.fontSize(12).text(petitionText, {
      align: "left"
    });
  }

  doc.end();
});

// -----------------------------
// Start server
// -----------------------------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🔥 JusticeBot backend running on port ${PORT}`);
});

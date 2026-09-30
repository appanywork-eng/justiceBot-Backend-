import express from "express";
import cors from "cors";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" })); // protects long petition payloads

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Keyword-based sector detection (fallback)
const keywords = {
  power: ["electricity", "nepa", "aedc", "transformer", "power"],
  aviation: ["flight", "airport", "airline", "ncaa", "aviation"],
  banking: ["bank", "fintech", "atm", "pos", "debit", "transfer", "unlawful debit"],
  telecoms: ["airtime", "data", "network", "sim", "telecom", "ncc"],
  education: ["school", "university", "neco", "waec", "jamb", "nuc", "education"],
  health: ["hospital", "clinic", "nhis", "doctor", "ncdc", "nma", "medical"],
  security: ["police", "army", "navy", "airforce", "nscdc", "nscdc", "nigeria security", "unlawful arrest"],
  judiciary: ["court", "judge", "lawyer", "justice", "supreme", "petition"],
  international_escalation: ["un", "ecowas", "au", "icc", "eu", "afdb", "international court"]
};

function detectSector(text) {
  const lower = text.toLowerCase();
  for (const [sector, words] of Object.entries(keywords)) {
    if (words.some(w => lower.includes(w))) {
      return sector;
    }
  }
  return "unknown";
}

// AI-powered sector classifier
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
    console.warn("Classifier error:", err.message);
    res.json({ sector: "unknown" });
  }
});

// Lawyer-grade petition generator
app.post("/generate-petition", async (req, res) => {
  const complaint = req.body.complaint || "";
  let sector = req.body.sector || detectSector(complaint);

  // If keyword failed, attempt AI classification
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

  if (sector === "unknown") {
    return res.status(400).json({ petition: "❌ Sector not recognized." });
  }

  try {
    const ai = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: `Draft a SAN lawyer-grade petition using To:, Through:, CC: format.
Do NOT include personal names. Be formal, factual, legally persuasive, and concise.`
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

// Start server
app.listen(process.env.PORT || 3000, "0.0.0.0", () => {
  console.log(`🚀 JusticeBot backend running on port ${process.env.PORT || 3000}`);
});

// Safe export (no regression, keeps express app intact)
export default app;

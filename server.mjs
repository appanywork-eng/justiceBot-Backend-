import express from "express";
import cors from "cors";
import OpenAI from "openai";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();

// Allow your Netlify frontend + localhost + wildcard for testing
app.use(
  cors({
    origin: [
      "https://your-netlify-site-name.netlify.app", // ← REPLACE WITH YOUR REAL NETLIFY URL
      "http://localhost:5173",
      "http://localhost:3000",
      "*" // temporary for debugging (remove in production)
    ],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.use(express.json({ limit: "5mb" }));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---------- CONFIG ----------
const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY || "";
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || "https://your-netlify-site-name.netlify.app";
const PETITION_PRICE_NGN = Number(process.env.PETITION_PRICE_NGN || 1050);

// In-memory (temporary)
const petitionStore = new Map();
const USED_TX_REFS = new Set();

// ---------- HELPERS ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function safeUniq(arr) {
  return [...new Set((arr || []).filter(Boolean))];
}

function isEmail(s) {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function loadSectorJson(sector) {
  const filePath = path.join(__dirname, "data", sector + ".json");
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function detectSector(text) {
  const lower = (text || "").toLowerCase();
  const map = {
    banking: ["bank", "gtbank", "gtb", "access", "zenith", "firstbank", "uba", "cbn"],
    // Add other sectors as needed
  };
  for (const [sec, words] of Object.entries(map)) {
    if (words.some((w) => lower.includes(w))) return sec;
  }
  return "banking"; // default for your current complaint
}

// ---------- ENDPOINTS ----------

app.get("/health", (req, res) => {
  res.json({ ok: true, message: "Backend is alive!" });
});

app.post("/generate-petition", async (req, res) => {
  const { complaint, petitioner } = req.body;

  if (!complaint) {
    return res.status(400).json({ error: "Complaint is required" });
  }

  const sector = detectSector(complaint);

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a professional Nigerian legal petition drafter.
Generate a formal petition letter based on the user's complaint.
Use clear sections, numbered points where appropriate.
Include petitioner details from the input.
Keep it realistic and professional.`,
        },
        { role: "user", content: `Complaint: ${complaint}\nPetitioner: ${JSON.stringify(petitioner)}` },
      ],
    });

    const petitionText = completion.choices?.[0]?.message?.content?.trim() || "Failed to generate.";

    const tx_ref = `pd_test_${Date.now()}`;

    // Store for possible future unlock (even in free mode)
    petitionStore.set(tx_ref, { petition: petitionText });

    res.json({
      preview: petitionText.substring(0, 500) + "... (full version available)",
      petition: petitionText, // full text for free/testing mode
      tx_ref,
      sector,
      needsPayment: false, // force free for now
    });
  } catch (err) {
    console.error("OpenAI error:", err);
    res.status(500).json({ error: "Failed to generate petition" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});

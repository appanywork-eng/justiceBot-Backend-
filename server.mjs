// server/index.js
import express from "express";
import cors from "cors";
import OpenAI from "openai";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import PDFDocument from "pdfkit";

dotenv.config();

/* ---------- ENV GUARDS ---------- */
if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");
if (!process.env.FLW_SECRET_KEY) throw new Error("FLW_SECRET_KEY missing");

/* ---------- APP ---------- */
const app = express();
app.use(cors({ origin: "*", methods: ["GET", "POST"] }));
app.use(express.json({ limit: "5mb" }));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* ---------- CONSTANTS ---------- */
const PORT = process.env.PORT || 3000;
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || "http://localhost:5173";
const PETITION_PRICE_NGN = Number(process.env.PETITION_PRICE_NGN || 1050);
const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY;

/* ---------- STORAGE (TTL) ---------- */
const petitionStore = new Map();
const USED_TX_REFS = new Set();
const TTL_MS = 30 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of petitionStore.entries()) {
    if (now - v.createdAt > TTL_MS) petitionStore.delete(k);
  }
}, 10 * 60 * 1000);

/* ---------- HELPERS ---------- */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || ""));
const uniq = (a = []) => [...new Set(a.filter(Boolean))];

async function flwFetch(url, options = {}) {
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

/* ---------- HEALTH ---------- */
app.get("/health", (_, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

/* ---------- GENERATE PETITION ---------- */
app.post("/generate-petition", async (req, res) => {
  const { complaint, petitioner = {} } = req.body;
  if (!complaint?.trim()) return res.status(400).json({ error: "Complaint required" });

  const tx_ref = `pd_${crypto.randomUUID()}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: "Draft a formal Nigerian legal petition." },
      { role: "user", content: complaint },
    ],
  });

  const petition = completion.choices[0]?.message?.content || "";
  if (!petition) return res.status(500).json({ error: "AI failed" });

  petitionStore.set(tx_ref, {
    petition,
    createdAt: Date.now(),
  });

  res.json({
    needsPayment: true,
    amount: PETITION_PRICE_NGN,
    currency: "NGN",
    tx_ref,
    preview: petition.slice(0, 700) + "...",
  });
});

/* ---------- PAY INIT ---------- */
app.post("/pay/initialize", async (req, res) => {
  const { tx_ref, email } = req.body;
  if (!petitionStore.has(tx_ref)) return res.status(404).json({ error: "Invalid tx_ref" });

  const payload = {
    tx_ref,
    amount: PETITION_PRICE_NGN,
    currency: "NGN",
    redirect_url: `${FRONTEND_BASE_URL}?tx_ref=${tx_ref}`,
    customer: { email: email || "user@petitiondesk.com" },
    customizations: { title: "PetitionDesk" },
  };

  const { ok, data } = await flwFetch("https://api.flutterwave.com/v3/payments", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!ok) return res.status(400).json({ error: "Payment init failed" });
  res.json({ ok: true, link: data.data.link });
});

/* ---------- UNLOCK ---------- */
app.post("/unlock-petition", async (req, res) => {
  const { tx_ref } = req.body;
  if (USED_TX_REFS.has(tx_ref)) return res.status(409).json({ error: "Already used" });

  const verify = await flwFetch(
    `https://api.flutterwave.com/v3/transactions/verify?tx_ref=${tx_ref}`
  );

  const d = verify.data?.data;
  if (!verify.ok || d?.status !== "successful" || d?.amount !== PETITION_PRICE_NGN) {
    return res.status(402).json({ error: "Payment not verified" });
  }

  const record = petitionStore.get(tx_ref);
  if (!record) return res.status(404).json({ error: "Expired or missing" });

  USED_TX_REFS.add(tx_ref);
  petitionStore.delete(tx_ref);

  res.json({ ok: true, unlocked: true, petition: record.petition });
});

/* ---------- PDF (SAFE POST) ---------- */
app.post("/download-pdf", (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).send("Missing text");

  res.setHeader("Content-Type", "application/pdf");
  const pdf = new PDFDocument({ margin: 50 });
  pdf.pipe(res);
  pdf.fontSize(12).text(text, { align: "justify" });
  pdf.end();
});

/* ---------- START ---------- */
app.listen(PORT, () =>
  console.log(`🚀 Backend running → http://localhost:${PORT}`)
);

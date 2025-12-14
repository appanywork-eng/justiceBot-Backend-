"use strict";

/**
 * PetitionDesk Backend (PDPS-2.5 PRO)
 * Stable • Secure • Paid-Lock Enabled
 */

const express = require("express");
const cors = require("cors");
require("dotenv").config();

/* =========================
   CONFIG
========================= */
const PORT = process.env.PORT || 5000;
const PRICE_NGN = Number(process.env.PRICE_NGN || 1150);
const CURRENCY = "NGN";
const REDIRECT_BASE = String(process.env.FLW_REDIRECT_URL || "").trim();

/* =========================
   EXPRESS SETUP
========================= */
const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

/* =========================
   PAYMENT MEMORY STORE
========================= */
const VERIFIED_TXREF = new Set();
const TXREF_TO_PETITION = new Map();

function markVerified(txRef) {
  if (txRef) VERIFIED_TXREF.add(String(txRef));
}

function isVerified(txRef) {
  return txRef && VERIFIED_TXREF.has(String(txRef));
}

/* =========================
   HARD REQUIRE PAYMENTS
   (NO FALLBACK — EVER)
========================= */
let startFlutterwavePayment;
let verifyFlutterwavePayment;

try {
  ({ startFlutterwavePayment, verifyFlutterwavePayment } =
    require("./core/payments.js"));
  console.log("✅ Payments module loaded");
} catch (err) {
  console.error("❌ Payments module FAILED to load");
  console.error(err);
  process.exit(1);
}

/* =========================
   SAFE IMPORT WRAPPER
========================= */
function safeRequire(p, fallback = {}) {
  try {
    return require(p);
  } catch (e) {
    console.warn(`⚠️ Failed to load ${p} — fallback used`);
    return fallback;
  }
}

/* =========================
   CORE IMPORTS
========================= */
const { detectHybrid } = safeRequire("./core/aiRouting", {
  detectHybrid: async () => ({}),
});

const { applyWatchdogs, applySectorSupervisors } =
  safeRequire("./core/watchdogs", {});

const { refinePoliceInstitutions } =
  safeRequire("./core/police", {});

const { buildPetition, fallbackPetition } =
  safeRequire("./core/builder", {
    buildPetition: async () => "Petition processing temporarily unavailable.",
    fallbackPetition: () => "Petition processing temporarily unavailable.",
  });

const { generatePetitionA8 } =
  safeRequire("./a8Engine", {});

/* =========================
   HELPERS
========================= */
function newPetitionId() {
  return "PD-" + Date.now() + "-" + Math.floor(Math.random() * 100000);
}

/* =========================
   BASIC ROUTES
========================= */
app.get("/", (_, res) => {
  res.send("PetitionDesk PDPS-2.5 PRO Backend is running.");
});

app.get("/health", (_, res) => {
  res.json({
    status: "ok",
    price: PRICE_NGN,
    currency: CURRENCY,
    time: new Date().toISOString(),
  });
});

/* =========================
   PAYMENT — START
========================= */
app.post("/pay", async (req, res) => {
  try {
    const petitionId = String(req.body?.petitionId || newPetitionId());
    const fullName = String(req.body?.fullName || "PetitionDesk User");
    const email = String(req.body?.email || "").trim();

    const redirectUrl = REDIRECT_BASE
      ? `${REDIRECT_BASE}?petitionId=${encodeURIComponent(petitionId)}`
      : "";

    const result = await startFlutterwavePayment({
      amount: PRICE_NGN,
      fullName,
      email,
      redirectUrl,
      currency: CURRENCY,
      description: "PetitionDesk – Petition Unlock Payment",
    });

    const txRef = String(result.txRef);
    TXREF_TO_PETITION.set(txRef, petitionId);

    res.json({
      ok: true,
      petitionId,
      price: PRICE_NGN,
      currency: CURRENCY,
      paymentLink: result.paymentLink,
      txRef,
    });
  } catch (err) {
    console.error("Payment error:", err);
    res.status(500).json({ ok: false, error: "Payment error." });
  }
});

/* =========================
   PAYMENT — VERIFY
========================= */
app.get("/verify-payment", async (req, res) => {
  const txRef = String(req.query?.txRef || "").trim();
  if (!txRef) {
    return res.status(400).json({
      verified: false,
      error: "Missing txRef.",
    });
  }

  if (isVerified(txRef)) {
    return res.json({
      verified: true,
      txRef,
      petitionId: TXREF_TO_PETITION.get(txRef) || null,
    });
  }

  try {
    const v = await verifyFlutterwavePayment(txRef);
    const verified = !!v?.verified;

    if (verified) markVerified(txRef);

    res.json({
      verified,
      txRef,
      petitionId: TXREF_TO_PETITION.get(txRef) || null,
      gateway: v?.gateway || "flutterwave",
    });
  } catch (err) {
    console.error("Verify payment error:", err);
    res.status(500).json({
      verified: false,
      error: "Verification error.",
    });
  }
});

/* =========================
   GENERATE PETITION
========================= */
app.post("/generate-petition", async (req, res) => {
  try {
    const description = String(req.body?.description || "").trim();
    if (!description) {
      return res.json({
        ok: false,
        error: "Please describe your complaint.",
        verified: false,
      });
    }

    const petitionId = String(req.body?.petitionId || newPetitionId());
    const txRef = String(req.body?.txRef || "").trim();
    const paid = isVerified(txRef);

    if (typeof generatePetitionA8 === "function") {
      const out = await generatePetitionA8({
        description,
        paid,
      });

      return res.json({
        ok: true,
        petitionId,
        verified: paid,
        ...out,
        access: {
          paid,
          price: PRICE_NGN,
          currency: CURRENCY,
          canViewFull: paid,
          canCopy: paid,
          canDownloadPdf: paid,
          canEmail: paid,
        },
      });
    }

    const text = await buildPetition({}, {}, description);

    res.json({
      ok: true,
      petitionId,
      petitionText: text,
      verified: false,
      access: {
        paid: false,
        price: PRICE_NGN,
        currency: CURRENCY,
      },
    });
  } catch (err) {
    console.error("Petition error:", err);
    res.status(500).json({
      ok: false,
      error: "Internal error.",
    });
  }
});

/* =========================
   START SERVER
========================= */
app.listen(PORT, "0.0.0.0", () => {
  console.log(`PDPS-2.5 PRO Backend running on port ${PORT}`);
});

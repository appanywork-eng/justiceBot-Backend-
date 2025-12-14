/**
 * PetitionDesk / JusticeBot Backend (PDPS-2.5 PRO)
 * Single petition generator flow:
 *   /generate-petition  --> a8Engine.generatePetitionA8()
 *
 * No core/builder.js fallback. No duplicate paths.
 */

const express = require("express");
const cors = require("cors");
require("dotenv").config();

const PORT = process.env.PORT || 5000;
const PRICE_NGN = Number(process.env.PRICE_NGN || 1150);
const CURRENCY = "NGN";
const REDIRECT_BASE = String(process.env.FLW_REDIRECT_URL || "").trim();

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

/* =========================
   Payment Memory Store
========================= */
const VERIFIED_TXREF = new Set();
const TXREF_TO_PETITION = new Map();

function markVerified(txRef) {
  if (txRef) VERIFIED_TXREF.add(String(txRef));
}
function isVerified(txRef) {
  return !!(txRef && VERIFIED_TXREF.has(String(txRef)));
}

/* =========================
   HARD REQUIRE PAYMENTS
========================= */
let startFlutterwavePayment;
let verifyFlutterwavePayment;

try {
  ({ startFlutterwavePayment, verifyFlutterwavePayment } = require("./core/payments.js"));
  console.log("✅ Payments module loaded");
} catch (err) {
  console.error("❌ Payments module FAILED to load");
  console.error(err);
  process.exit(1);
}

/* =========================
   Petition Engine (A8)
========================= */
const { generatePetitionA8 } = require("./a8Engine");

/* =========================
   Basic Routes
========================= */
app.get("/", (_, res) => res.send("PetitionDesk PDPS-2.5 PRO Backend is running."));
app.get("/health", (_, res) =>
  res.json({
    status: "ok",
    price: PRICE_NGN,
    currency: CURRENCY,
    time: new Date().toISOString(),
  })
);

/* =========================
   PAYMENT - START
========================= */
app.post("/pay", async (req, res) => {
  try {
    const petitionId = String(req.body?.petitionId || `PD-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    const fullName = String(req.body?.fullName || "Petitioner");
    const email = String(req.body?.email || "").trim();

    const redirectUrl = REDIRECT_BASE
      ? `${REDIRECT_BASE}?petitionId=${encodeURIComponent(petitionId)}`
      : "";

    const result = await startFlutterwavePayment({
      amount: PRICE_NGN,
      currency: CURRENCY,
      fullName,
      email,
      redirectUrl,
      description: "PetitionDesk - Petition Unlock Payment",
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
   PAYMENT - VERIFY
========================= */
app.get("/verify-payment", async (req, res) => {
  const txRef = String(req.query?.txRef || "").trim();
  if (!txRef) {
    return res.status(400).json({ verified: false, error: "Missing txRef." });
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
    res.status(500).json({ verified: false, error: "Verification error." });
  }
});

/* =========================
   GENERATE PETITION (ONLY PATH)
========================= */
app.post("/generate-petition", async (req, res) => {
  try {
    const description = String(req.body?.description || "").trim();
    if (!description) {
      return res.json({ ok: false, error: "Please describe your complaint.", verified: false });
    }

    const petitionId = String(req.body?.petitionId || `PD-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    const txRef = String(req.body?.txRef || "").trim();
    const paid = isVerified(txRef);

    const complainant = {
      fullName: String(req.body?.fullName || "").trim(),
      email: String(req.body?.email || "").trim(),
      phone: String(req.body?.phone || "").trim(),
      address: String(req.body?.address || "").trim(),
    };

    const intl = req.body?.intl || null; // optional international escalation

    const out = await generatePetitionA8({
      description,
      complainant,
      paid,
      intl,
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
  } catch (err) {
    console.error("Petition error:", err);
    res.status(500).json({ ok: false, error: err?.message || "Internal error." });
  }
});

/* =========================
   START SERVER
========================= */
app.listen(PORT, "0.0.0.0", () => {
  console.log(`PDPS-2.5 PRO Backend running on port ${PORT}`);
  console.log("==> Your service is live 🎉");
});

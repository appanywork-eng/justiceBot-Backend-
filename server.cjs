"use strict";

/**
 * PetitionDesk Backend (PDPS-2.5 PRO)
 * Stable • Secure • Production Ready
 *
 * ✅ A8 Paid-Lock Integration:
 * - ₦1,150 flat per view/request
 * - unpaid users get LOCKED preview + access flags
 * - paid users (verified txRef) get full petition + unlock permissions
 *
 * ✅ Flutterwave:
 * - POST /pay starts payment (returns paymentLink + txRef)
 * - GET  /verify-payment verifies txRef and marks it verified
 */

const express = require("express");
const cors = require("cors");
require("dotenv").config();

// ==============================
// SAFE IMPORT WRAPPER
// ==============================
function safeRequire(p, fallback = {}) {
  try {
    return require(p);
  } catch (e) {
    console.warn(`⚠️ Failed to load ${p} - using fallback`);
    return fallback;
  }
}

// ==============================
// IMPORTS (SAFE)
// ==============================
const { detectHybrid } = safeRequire("./core/aiRouting", {
  detectHybrid: async () => ({}),
});

const { applyWatchdogs, applySectorSupervisors } = safeRequire("./core/helpers", {});

const { refinePoliceInstitutions } = safeRequire("./core/police", {});

const { buildPetition, fallbackPetition } = safeRequire("./core/petitions", {
  buildPetition: async () => "Petition processing temporarily unavailable.",
  fallbackPetition: () => "Petition processing temporarily unavailable.",
});

const { startFlutterwavePayment, verifyFlutterwavePayment } = safeRequire("./core/payments", {});

const { isOpenAIReady } = safeRequire("./core/openaiClient", {
  isOpenAIReady: () => false,
});

// ✅ A8 Engine (your paid-lock engine)
const { generatePetitionA8 } = safeRequire("./a8Engine", {});

// ==============================
// EXPRESS SETUP
// ==============================
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// ==============================
// CONFIG
// ==============================
const PRICE_NGN = Number(process.env.PRICE_NGN || 1150);
const CURRENCY = "NGN";

// Flutterwave redirect base (you can set it to your frontend URL)
const REDIRECT_BASE = String(process.env.FLW_REDIRECT_URL || "").trim();

// ==============================
// SIMPLE IN-MEMORY PAYMENT STORE
// (good for now; later move to DB)
// ==============================
const VERIFIED_TXREF = new Set(); // txRef strings
const TXREF_TO_PETITION = new Map(); // txRef -> petitionId

function markVerified(txRef) {
  if (!txRef) return;
  VERIFIED_TXREF.add(String(txRef));
}
function isVerified(txRef) {
  if (!txRef) return false;
  return VERIFIED_TXREF.has(String(txRef));
}

// ==============================
// HELPERS
// ==============================
function newPetitionId() {
  // stable ID (enough for now)
  return "PD-" + Date.now() + "-" + Math.floor(Math.random() * 100000);
}

function pccFallbackInstitution() {
  return {
    org: "Public Complaints Commission",
    title: "The Honourable Chief Commissioner",
    address: "Nigeria",
    category: "government",
  };
}

function isValidInst(x) {
  return x && typeof x === "object" && String(x.org || "").trim().length > 0;
}

function normalizeInst(x, fallbackOrg = "Institution") {
  if (!x || typeof x !== "object") {
    return { org: fallbackOrg, title: fallbackOrg, email: "", address: "Nigeria" };
  }
  return {
    id: x.id,
    org: String(x.org || fallbackOrg).trim(),
    title: String(x.title || x.org || fallbackOrg).trim(),
    email: String(x.email || "").trim(),
    address: String(x.address || "Nigeria").trim(),
    category: String(x.category || "").trim(),
    state: x.state ? String(x.state) : undefined,
  };
}

function normalizeCCList(arr) {
  const out = Array.isArray(arr) ? arr : [];
  const cleaned = out
    .filter((c) => c && typeof c === "object")
    .map((c) => normalizeInst(c))
    .filter((c) => c && c.org && String(c.org).trim());
  // unique by org
  const seen = new Set();
  return cleaned.filter((c) => {
    const key = String(c.org).toLowerCase().trim();
    if (!key) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ==============================
// BASIC ROUTES
// ==============================
app.get("/", (req, res) => {
  res.send("PetitionDesk PDPS-2.5 PRO Backend is running.");
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    time: new Date().toISOString(),
    openAI: typeof isOpenAIReady === "function" ? !!isOpenAIReady() : false,
    price: PRICE_NGN,
    currency: CURRENCY,
  });
});

// ==============================
// GENERATE PETITION (MAIN)
// ==============================
app.post("/generate-petition", async (req, res) => {
  try {
    const description = String(req.body?.description || "").trim();
    if (!description) {
      return res.status(200).json({
        ok: false,
        error: "Please describe your complaint.",
        petitionId: null,
        verified: false,
      });
    }

    const petitionId = String(req.body?.petitionId || newPetitionId());

    const complainant = {
      fullName: String(req.body?.fullName || "").trim(),
      email: String(req.body?.email || "").trim(),
      phone: String(req.body?.phone || "").trim(),
      address: String(req.body?.address || "").trim(),
    };

    // Optional intl block (passed to A8)
    const intl = req.body?.intl && typeof req.body.intl === "object" ? req.body.intl : { enabled: false };

    // Payment proof from client
    const txRef = String(req.body?.txRef || "").trim();
    const paid = txRef ? isVerified(txRef) : false;

    // ✅ If A8 is available, use it as the main engine (paid-lock included)
    if (typeof generatePetitionA8 === "function") {
      const out = await generatePetitionA8({
        description,
        complainant,
        intl,
        paid, // this drives unlock
      });

      return res.status(200).json({
        ok: true,
        petitionId,
        petitionText: out?.petitionText || "",
        primaryInstitution: out?.primaryInstitution || null,
        throughInstitution: out?.throughInstitution || null,
        ccList: out?.ccList || [],
        routingSummary: out?.routingSummary || null,
        subject: out?.subject || "FORMAL COMPLAINT / PETITION",
        verified: paid,
        access: out?.access || {
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

    // ---------------------------
    // LEGACY FALLBACK (if A8 missing)
    // ---------------------------
    let route = {};
    try {
      route = await detectHybrid(description, complainant);
    } catch (e) {
      console.error("AI routing failed:", e?.message || e);
      route = {};
    }

    const sector = String(route?.sector || "general");

    // Build institutions from route (PCC only as last fallback)
    let inst = {
      primary: isValidInst(route?.primary) ? normalizeInst(route.primary) : null,
      through: isValidInst(route?.through) ? normalizeInst(route.through) : null,
      ccList: normalizeCCList(route?.ccList || route?.cc || []),
    };

    if (!isValidInst(inst.primary)) inst.primary = pccFallbackInstitution();

    try {
      if (typeof applyWatchdogs === "function") inst = applyWatchdogs(inst, route) || inst;
      if (typeof applySectorSupervisors === "function") inst = applySectorSupervisors(inst, route) || inst;
      if (sector === "police" && typeof refinePoliceInstitutions === "function") {
        inst = refinePoliceInstitutions(description, inst) || inst;
      }
    } catch (e) {
      console.error("Routing helpers error (ignored):", e?.message || e);
    }

    inst.ccList = normalizeCCList(inst.ccList);

    let petitionText = "";
    try {
      petitionText = await buildPetition(complainant, inst, description);
    } catch (e) {
      console.error("AI petition failed, using fallback:", e?.message || e);
      petitionText = fallbackPetition(complainant, inst, description);
    }

    return res.status(200).json({
      ok: true,
      petitionId,
      petitionText,
      primaryInstitution: inst.primary,
      throughInstitution: inst.through,
      ccList: inst.ccList,
      sector,
      verified: false,
      access: {
        paid: false,
        price: PRICE_NGN,
        currency: CURRENCY,
        canViewFull: false,
        canCopy: false,
        canDownloadPdf: false,
        canEmail: false,
      },
    });
  } catch (err) {
    console.error("Error generating petition:", err?.message || err);
    return res.status(500).json({
      ok: false,
      error: "Internal error.",
      petitionId: null,
      verified: false,
    });
  }
});

// ==============================
// PAYMENT (Flutterwave) - START
// ==============================
app.post("/pay", async (req, res) => {
  try {
    const petitionId = String(req.body?.petitionId || newPetitionId());
    const fullName = String(req.body?.fullName || "Petitioner").trim();
    const email = String(req.body?.email || "").trim();

    if (typeof startFlutterwavePayment !== "function") {
      throw new Error("Payment service unavailable");
    }

    // Flat rate enforcement
    const amount = PRICE_NGN;

    // Optional redirect URL
    // If you have a frontend, set FLW_REDIRECT_URL like:
    // https://your-frontend.com/payment-success
    const redirectUrl = REDIRECT_BASE
      ? `${REDIRECT_BASE}?petitionId=${encodeURIComponent(petitionId)}`
      : "";

    const result = await startFlutterwavePayment({
      amount,
      fullName,
      email,
      redirectUrl,
      currency: CURRENCY,
      description: "PetitionDesk - Petition Unlock Payment",
    });

    const txRef = result?.txRef ? String(result.txRef) : "";
    if (txRef) TXREF_TO_PETITION.set(txRef, petitionId);

    return res.json({
      ok: true,
      petitionId,
      price: PRICE_NGN,
      currency: CURRENCY,
      paymentLink: result?.paymentLink,
      txRef,
    });
  } catch (err) {
    console.error("Payment error:", err?.message || err);
    return res.status(500).json({
      ok: false,
      error: "Payment error.",
    });
  }
});

// ==============================
// PAYMENT (Flutterwave) - VERIFY
// ==============================
app.get("/verify-payment", async (req, res) => {
  const txRef = String(req.query?.txRef || "").trim();
  if (!txRef) {
    return res.status(400).json({
      verified: false,
      error: "Missing txRef.",
    });
  }

  try {
    // If already verified, return fast
    if (isVerified(txRef)) {
      return res.json({
        verified: true,
        txRef,
        petitionId: TXREF_TO_PETITION.get(txRef) || null,
      });
    }

    if (typeof verifyFlutterwavePayment !== "function") {
      throw new Error("Verification unavailable");
    }

    const v = await verifyFlutterwavePayment(txRef);
    const verified = !!v?.verified;

    if (verified) markVerified(txRef);

    return res.json({
      verified,
      txRef,
      petitionId: TXREF_TO_PETITION.get(txRef) || null,
      gateway: v?.gateway || "flutterwave",
    });
  } catch (err) {
    console.error("Verify payment error:", err?.message || err);
    return res.status(500).json({
      verified: false,
      error: "Verification error.",
    });
  }
});

// ==============================
// START SERVER
// ==============================
app.listen(PORT, "0.0.0.0", () => {
  console.log(`PDPS-2.5 PRO Backend running on port ${PORT}`);
});

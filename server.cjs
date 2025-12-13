"use strict";

/**
 * PetitionDesk Backend (PDPS-2.5 PRO)
 * Stable • Secure • Production Ready
 */

const express = require("express");
const cors = require("cors");
require("dotenv").config();

// ================================
// SAFE IMPORT WRAPPER
// ================================
function safeRequire(path, fallback = {}) {
  try {
    return require(path);
  } catch (e) {
    console.error(`⚠️ Failed to load ${path} – using fallback`, e.message);
    return fallback;
  }
}

// ================================
// IMPORTS (SAFE)
// ================================
const { detectHybrid } =
  safeRequire("./core/aiRouting", { detectHybrid: async () => ({}) });

const {
  applyWatchdogs,
  applySectorSupervisors,
} = safeRequire("./core/routingHelpers", {});

const {
  refinePoliceInstitutions,
} = safeRequire("./core/police", {});

const {
  buildPetition,
  fallbackPetition,
} = safeRequire("./core/petitionBuilder", {
  buildPetition: async () => "Petition processing temporarily unavailable.",
  fallbackPetition: () => "Petition processing temporarily unavailable.",
});

const {
  startFlutterwavePayment,
  verifyFlutterwavePayment,
  isVerified,
} = safeRequire("./core/payments", {});

const { isOpenAIReady } =
  safeRequire("./core/openaiClient", { isOpenAIReady: () => false });

// ================================
// EXPRESS SETUP
// ================================
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// ================================
// BASIC ROUTES
// ================================
app.get("/", (req, res) => {
  res.send("PetitionDesk PDPS-2.5 PRO Backend is running.");
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    time: new Date().toISOString(),
    openAI: typeof isOpenAIReady === "function" ? isOpenAIReady() : false,
  });
});

// ================================
// GENERATE PETITION (MAIN)
// ================================
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

    const complainant = {
      fullName: String(req.body?.fullName || ""),
      email: String(req.body?.email || ""),
      phone: String(req.body?.phone || ""),
      address: String(req.body?.address || ""),
      description,
    };

    // 🔐 AI routing (never crash)
    let route = {};
    try {
      route = await detectHybrid(
        complainant.description,
        complainant.address
      );
    } catch (e) {
      console.error("AI routing failed:", e);
    }

    const sector = route?.sector || "general";

    // Default institution fallback
    let inst = {
      primary: {
        org: "Public Complaints Commission",
        title: "The Honourable Chief Commissioner",
        address: "Nigeria",
        category: "government",
      },
      through: null,
      ccList: [],
    };

    // Apply routing helpers safely
    try {
      if (typeof applyWatchdogs === "function")
        inst = applyWatchdogs(inst, route);
      if (typeof applySectorSupervisors === "function")
        inst = applySectorSupervisors(inst, route);

      if (
        sector === "police" &&
        typeof refinePoliceInstitutions === "function"
      ) {
        inst = refinePoliceInstitutions(description, inst);
      }
    } catch (e) {
      console.error("Routing helpers error (ignored):", e);
    }

    // Clean CC list
    inst.ccList = (inst.ccList || []).filter(
      (c) => c && c.org && String(c.org).trim()
    );

    // Build petition text
    let petitionText;
    try {
      petitionText = await buildPetition(complainant, inst);
    } catch (e) {
      console.error("AI petition failed, using fallback:", e);
      petitionText = fallbackPetition(complainant, inst);
    }

    const petitionId =
      "PD-" + Date.now() + "-" + Math.floor(Math.random() * 1e6);

    return res.status(200).json({
      ok: true,
      petitionId,
      petitionText,
      primaryInstitution: inst.primary,
      throughInstitution: inst.through,
      ccList: inst.ccList,
      sector,
      verified: false,
    });
  } catch (err) {
    console.error("Error generating petition:", err);
    return res.status(500).json({
      ok: false,
      error: "Internal error.",
      petitionId: null,
      verified: false,
    });
  }
});

// ================================
// PAYMENT
// ================================
app.post("/pay", async (req, res) => {
  try {
    const amount = Number(req.body?.amount);
    const petitionId = String(req.body?.petitionId || "");

    if (!petitionId)
      return res.status(400).json({ ok: false, error: "Missing petitionId." });

    if (!amount || amount < 1000)
      return res
        .status(400)
        .json({ ok: false, error: "Minimum petition fee is ₦1000." });

    if (typeof startFlutterwavePayment !== "function")
      throw new Error("Payment service unavailable");

    const redirectUrl =
      (process.env.FLW_REDIRECT_URL || "") +
      "?petitionId=" +
      encodeURIComponent(petitionId);

    const result = await startFlutterwavePayment({
      amount,
      fullName: req.body?.fullName || "Petitioner",
      email: req.body?.email || "",
      redirectUrl,
      currency: "NGN",
      description: "PetitionDesk - Petition Payment",
    });

    return res.json({
      ok: true,
      paymentLink: result?.paymentLink,
      txRef: result?.txRef,
      petitionId,
    });
  } catch (err) {
    console.error("Payment error:", err);
    return res.status(500).json({
      ok: false,
      error: "Payment error.",
    });
  }
});

// ================================
// VERIFY PAYMENT
// ================================
app.get("/verify-payment", async (req, res) => {
  const txRef = String(req.query?.txRef || "");
  if (!txRef)
    return res.status(400).json({
      verified: false,
      error: "Missing txRef.",
    });

  try {
    if (typeof isVerified === "function" && isVerified(txRef))
      return res.json({ verified: true });

    if (typeof verifyFlutterwavePayment !== "function")
      throw new Error("Verification unavailable");

    const v = await verifyFlutterwavePayment(txRef);
    return res.json({ verified: !!v?.verified });
  } catch (err) {
    console.error("Verify payment error:", err);
    return res.status(500).json({
      verified: false,
      error: "Verification error.",
    });
  }
});

// ================================
// START SERVER
// ================================
app.listen(PORT, "0.0.0.0", () => {
  console.log(`PDPS-2.5 PRO Backend running on port ${PORT}`);
});

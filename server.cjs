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
    console.warn(`⚠️ Failed to load ${path} – using fallback: ${e.message}`);
    return fallback;
  }
}

// ================================
// IMPORTS (SAFE)
// ================================
const { detectHybrid } =
  safeRequire("./core/aiRouting", { detectHybrid: async () => ({}) });

// helpers.js EXISTS
const { applyWatchdogs, applySectorSupervisors } =
  safeRequire("./core/helpers", {});

// police.js EXISTS
const { refinePoliceInstitutions } =
  safeRequire("./core/police", {});

// petitions.js EXISTS
const { buildPetition, fallbackPetition } =
  safeRequire("./core/petitions", {
    buildPetition: async () => "Petition processing temporarily unavailable.",
    fallbackPetition: () => "Petition processing temporarily unavailable.",
  });

// payments.js EXISTS
const { startFlutterwavePayment, verifyFlutterwavePayment, isVerified } =
  safeRequire("./core/payments", {});

// openaiClient.js EXISTS
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
// HELPERS
// ================================
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
    return { org: fallbackOrg, title: fallbackOrg, address: "Nigeria" };
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
  return out
    .filter((c) => c && typeof c === "object")
    .map((c) => normalizeInst(c))
    .filter((c) => c && c.org && String(c.org).trim());
}

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

    // ✅ AI routing (never crash)
    let route = {};
    try {
      route = await detectHybrid(complainant.description, complainant.address);
    } catch (e) {
      console.error("AI routing failed:", e?.message || e);
      route = {};
    }

    const sector = String(route?.sector || "general");

    // ✅ CRITICAL FIX:
    // Build inst FROM route (if present), NOT PCC-first.
    // PCC should only be used as final fallback.
    let inst = {
      primary: isValidInst(route?.primary) ? normalizeInst(route.primary) : null,
      through: isValidInst(route?.through) ? normalizeInst(route.through) : null,
      ccList: normalizeCCList(route?.ccList || route?.cc || []),
    };

    // Final fallback: if routing didn't return a primary, use PCC
    if (!isValidInst(inst.primary)) {
      inst.primary = pccFallbackInstitution();
    }

    // Apply routing helpers safely (should NOT override the routed primary)
    try {
      if (typeof applyWatchdogs === "function") {
        inst = applyWatchdogs(inst, route) || inst;
      }
      if (typeof applySectorSupervisors === "function") {
        inst = applySectorSupervisors(inst, route) || inst;
      }

      // Police refinement (optional)
      if (sector === "police" && typeof refinePoliceInstitutions === "function") {
        inst = refinePoliceInstitutions(description, inst) || inst;
      }
    } catch (e) {
      console.error("Routing helpers error (ignored):", e?.message || e);
    }

    // Clean CC list
    inst.ccList = normalizeCCList(inst.ccList);

    // Optional debug
    if (String(process.env.DEBUG_ROUTING || "").toLowerCase() === "true") {
      console.log("[routing] sector:", sector);
      console.log("[routing] primary:", inst.primary?.org);
      console.log("[routing] through:", inst.through?.org || null);
      console.log("[routing] cc:", (inst.ccList || []).map((x) => x.org));
    }

    // Build petition text
    let petitionText;
    try {
      petitionText = await buildPetition(complainant, inst);
    } catch (e) {
      console.error("AI petition failed, using fallback:", e?.message || e);
      petitionText = fallbackPetition(complainant, inst);
    }

    const petitionId = "PD-" + Date.now() + "-" + Math.floor(Math.random() * 1e6);

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
    console.error("Error generating petition:", err?.message || err);
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

    if (!petitionId) {
      return res.status(400).json({ ok: false, error: "Missing petitionId." });
    }

    if (!amount || amount < 1000) {
      return res.status(400).json({ ok: false, error: "Minimum petition fee is ₦1000." });
    }

    if (typeof startFlutterwavePayment !== "function") {
      throw new Error("Payment service unavailable");
    }

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
    console.error("Payment error:", err?.message || err);
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
  if (!txRef) {
    return res.status(400).json({
      verified: false,
      error: "Missing txRef.",
    });
  }

  try {
    if (typeof isVerified === "function" && isVerified(txRef)) {
      return res.json({ verified: true });
    }

    if (typeof verifyFlutterwavePayment !== "function") {
      throw new Error("Verification unavailable");
    }

    const v = await verifyFlutterwavePayment(txRef);
    return res.json({ verified: !!v?.verified });
  } catch (err) {
    console.error("Verify payment error:", err?.message || err);
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

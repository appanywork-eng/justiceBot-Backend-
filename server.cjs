/**
 * PetitionDesk Backend (PDPS-2.6 PRO)
 * Strong routing + Professional-grade petition builder
 * + Verified paywall + Minimum ₦1000 enforcement
 * + Per-petition payment using petitionId
 */

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
require("dotenv").config();

const { detectHybrid } = require("./core/aiRouting");
const { applyWatchdogs, applySectorSupervisors } = require("./core/watchdogs");
const { detectSector, refinePoliceInstitutions } = require("./core/police");
const { buildPetition } = require("./core/petitions");
const {
  startFlutterwavePayment,
  verifyFlutterwavePayment,
  isVerified,
} = require("./core/payments");
const { isOpenAIReady } = require("./core/openaiClient");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Simple helper for unique petition IDs
function createPetitionId() {
  return crypto.randomBytes(8).toString("hex");
}

// =====================================================================
// BASIC ROUTES
// =====================================================================
app.get("/", (req, res) =>
  res.send("PetitionDesk PDPS-2.6 PRO Backend is running 💡")
);

app.get("/health", (req, res) =>
  res.json({ status: "ok", time: new Date().toISOString() })
);

app.get("/test", (req, res) =>
  res.json({
    status: "ok",
    message: "Backend online",
    openai_status: isOpenAIReady() ? "ready" : "not_initialized",
  })
);

// =====================================================================
// GENERATE PETITION (PREVIEW MODE – NO COPY/EMAIL/DOWNLOAD)
// =====================================================================
app.post("/generate-petition", async (req, res) => {
  console.log("Incoming:", req.body);

  const description = req.body.description || "";
  if (!description.trim()) {
    return res.status(200).json({
      petitionId: null,
      petitionText: "Please describe your complaint.",
      primaryInstitution: null,
      throughInstitution: null,
      ccList: [],
      verified: false,
    });
  }

  const complainant = {
    fullName: req.body.fullName || "Ngozi Yemisi Musa",
    email: req.body.email || "",
    phone: req.body.phone || "",
    address: req.body.address || "",
    description,
  };

  try {
    // Routing logic
    let inst = await detectHybrid(description);
    inst = applyWatchdogs(description, inst);
    inst = applySectorSupervisors(description, inst);

    const sector = detectSector(description, inst);
    if (sector === "police") {
      inst = refinePoliceInstitutions(description, inst);
    }

    inst.ccList = (inst.ccList || []).filter((c) => c?.org?.trim());

    // Build petition preview text
    const petitionText = await buildPetition(complainant, inst, sector);

    // Create a unique petitionId for this petition
    const petitionId = createPetitionId();

    return res.status(200).json({
      petitionId, // 👈 VERY IMPORTANT for per-petition billing
      petitionText,
      primaryInstitution: inst.primary,
      throughInstitution: inst.through,
      ccList: inst.ccList,
      verified: false,
    });
  } catch (err) {
    console.error("Error in /generate-petition:", err);
    return res.status(500).json({
      petitionId: null,
      petitionText: "An internal error occurred.",
      verified: false,
    });
  }
});

// =====================================================================
// START PAYMENT (ENFORCES MINIMUM ₦1000 + petitionId required)
// =====================================================================
app.post("/pay", async (req, res) => {
  try {
    const { amount, fullName, email, description, petitionId } = req.body;

    if (!petitionId) {
      return res.status(400).json({
        ok: false,
        error: "Missing petitionId.",
      });
    }

    // --- Hard validation: cannot bypass front-end ---
    if (!amount || amount < 1000) {
      return res.status(400).json({
        ok: false,
        error:
          "Minimum petition fee is ₦1000. Please enter ₦1000 or above to proceed.",
      });
    }

    const result = await startFlutterwavePayment({
      amount,
      currency: "NGN",
      fullName,
      email,
      description: description || "PetitionDesk – Petition drafting fee",
      petitionId, // 👈 pass petitionId into core/payments
    });

    if (!result.ok) {
      return res.status(500).json({
        ok: false,
        error: result.error || "Payment error.",
      });
    }

    return res.json({
      ok: true,
      paymentLink: result.paymentLink,
      txRef: result.txRef,
    });
  } catch (err) {
    console.error("Pay error:", err);
    return res.status(500).json({ ok: false, error: "Payment error." });
  }
});

// =====================================================================
// VERIFY PAYMENT
// =====================================================================
app.get("/verify-payment", async (req, res) => {
  const txRef = req.query.txRef;
  if (!txRef) return res.status(400).json({ verified: false });

  try {
    if (isVerified(txRef)) {
      return res.json({ verified: true });
    }

    const v = await verifyFlutterwavePayment(txRef);
    return res.json({ verified: v.verified || false });
  } catch (err) {
    console.error("verify-payment error:", err);
    return res.status(500).json({ verified: false });
  }
});

// =====================================================================
// START SERVER
// =====================================================================
app.listen(PORT, "0.0.0.0", () =>
  console.log(`PDPS-2.6 PRO Backend running on port ${PORT}`)
);

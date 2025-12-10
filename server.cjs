/**
 * PetitionDesk Backend (PDPS-2.5 PRO)
 * Pay-per-petition + Professional petition builder + Secure verified unlock
 */

const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { detectHybrid } = require("./core/aiRouting");
const { applyWatchdogs, applySectorSupervisors } = require("./core/watchdogs");
const { detectSector, refinePoliceInstitutions } = require("./core/police");
const { buildPetition } = require("./core/petitions");
const {
  startFlutterwavePayment,
  verifyFlutterwavePayment,
} = require("./core/payments");

const { isOpenAIReady } = require("./core/openaiClient");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

/** Store verified petitions by petitionId */
const VERIFIED_PETITIONS = {};

// =====================================================================
// BASIC ROUTES
// =====================================================================
app.get("/", (req, res) =>
  res.send("PetitionDesk PDPS-2.5 PRO Backend is running 💡")
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
// GENERATE PETITION (Preview Only – Locked Tools)
// =====================================================================
app.post("/generate-petition", async (req, res) => {
  console.log("Incoming:", req.body);

  const description = req.body.description || "";
  if (!description.trim()) {
    return res.status(200).json({
      petitionText: "Please describe your complaint.",
      primaryInstitution: null,
      throughInstitution: null,
      ccList: [],
      petitionId: null,
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
    if (sector === "police") inst = refinePoliceInstitutions(description, inst);

    inst.ccList = inst.ccList.filter((c) => c?.org?.trim());

    // Build petition preview
    const petitionText = await buildPetition(complainant, inst, sector);

    // Unique petition ID (used for unlocking)
    const petitionId =
      "PID_" + Date.now() + "_" + Math.floor(Math.random() * 999999);

    return res.status(200).json({
      petitionText,
      primaryInstitution: inst.primary,
      throughInstitution: inst.through,
      ccList: inst.ccList,
      petitionId,
      verified: false,
    });
  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({
      petitionText: "An internal error occurred.",
      petitionId: null,
      verified: false,
    });
  }
});

// =====================================================================
// START PAYMENT (User Pays Flutterwave Charges)
// =====================================================================
app.post("/pay", async (req, res) => {
  try {
    const { amount, petitionId, fullName, email } = req.body;

    if (!petitionId) {
      return res.status(400).json({
        ok: false,
        error: "Missing petitionId.",
      });
    }

    if (!amount || amount < 1000) {
      return res.status(400).json({
        ok: false,
        error: "Minimum petition fee is ₦1000.",
      });
    }

    /** Calculate Flutterwave fee (1.4% + ₦50) */
    const flutterwaveFee = Math.ceil(amount * 0.014 + 50);
    const finalAmount = amount + flutterwaveFee;

    const result = await startFlutterwavePayment({
      amount: finalAmount,
      currency: "NGN",
      fullName,
      email,
      petitionId,
      description: "PetitionDesk – Petition unlocking fee",
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
      petitionId,
      amountToPay: finalAmount,
    });
  } catch (err) {
    console.error("Pay error:", err);
    return res.status(500).json({ ok: false, error: "Payment error." });
  }
});

// =====================================================================
// VERIFY PAYMENT (Unlocks ONLY that petitionId)
// =====================================================================
app.get("/verify-payment", async (req, res) => {
  const txRef = req.query.txRef;
  const petitionId = req.query.petitionId;

  if (!txRef || !petitionId) {
    return res.status(400).json({ verified: false });
  }

  try {
    if (VERIFIED_PETITIONS[petitionId]) {
      return res.json({ verified: true, petitionId });
    }

    const v = await verifyFlutterwavePayment(txRef);

    if (v.verified) {
      VERIFIED_PETITIONS[petitionId] = true;
      return res.json({ verified: true, petitionId });
    }

    return res.json({ verified: false });
  } catch (err) {
    console.error("Verify error:", err);
    return res.status(500).json({ verified: false });
  }
});

// =====================================================================
// START SERVER
// =====================================================================
app.listen(PORT, "0.0.0.0", () =>
  console.log(`PDPS-2.5 PRO Backend running on port ${PORT}`)
);

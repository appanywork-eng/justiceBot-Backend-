/**
 * PetitionDesk Backend (PDPS-2.3 PRO)
 * Strong routing + SAN-grade petition building + verified-paywall
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
  isVerified,
} = require("./core/payments");
const { isOpenAIReady } = require("./core/openaiClient");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// =====================================================================
// BASIC ROUTES
// =====================================================================
app.get("/", (req, res) =>
  res.send("PetitionDesk PDPS-2.3 PRO Backend is running 💡")
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
      petitionText: "Please describe your complaint.",
      primaryInstitution: null,
      throughInstitution: null,
      ccList: [],
      txRef: null,
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
    // Routing
    let inst = await detectHybrid(description);
    inst = applyWatchdogs(description, inst);
    inst = applySectorSupervisors(description, inst);

    const sector = detectSector(description, inst);

    if (sector === "police") {
      inst = refinePoliceInstitutions(description, inst);
    }

    inst.ccList = inst.ccList.filter((c) => c?.org?.trim());

    // Generate preview petition
    const petitionText = await buildPetition(complainant, inst, sector);

    return res.status(200).json({
      petitionText,
      primaryInstitution: inst.primary,
      throughInstitution: inst.through,
      ccList: inst.ccList,
      verified: false,
    });
  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({
      petitionText: "An internal error occurred.",
      verified: false,
    });
  }
});

// =====================================================================
// START PAYMENT
// =====================================================================
app.post("/pay", async (req, res) => {
  try {
    const result = await startFlutterwavePayment(req.body);
    if (!result.ok) {
      return res.status(500).json({ error: result.error });
    }

    return res.json({
      paymentLink: result.paymentLink,
      txRef: result.txRef,
    });
  } catch (err) {
    console.error("Pay error:", err);
    return res.status(500).json({ error: "Payment error." });
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
    return res.status(500).json({ verified: false });
  }
});

// =====================================================================
// START SERVER
// =====================================================================
app.listen(PORT, "0.0.0.0", () =>
  console.log(`PDPS-2.3 PRO Backend running on ${PORT}`)
);

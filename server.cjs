/**
 * PetitionDesk / JusticeBot Backend (PDPS-2.2 PRO)
 * Entry file – wires routes together using modular core logic.
 */

const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { detectHybrid } = require("./core/aiRouting");
const { applyWatchdogs, applySectorSupervisors } = require("./core/watchdogs");
const { detectSector, refinePoliceInstitutions } = require("./core/police");
const { buildPetition } = require("./core/petitions");
const { startFlutterwavePayment } = require("./core/payments");
const { isOpenAIReady } = require("./core/openaiClient");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// --------------------------------------------------------------
// BASIC ROUTES
// --------------------------------------------------------------
app.get("/", (req, res) =>
  res.send(
    "JusticeBot PDPS-2.2 PRO Backend (Routing + SAN-grade petitions + Payments) is running 💡"
  )
);

app.get("/health", (req, res) =>
  res.json({ status: "ok", time: new Date().toISOString() })
);

app.get("/test", (req, res) =>
  res.json({
    status: "ok",
    message: "Test endpoint working",
    openai_status: isOpenAIReady() ? "ready" : "not_initialized",
  })
);

// --------------------------------------------------------------
// POST: GENERATE PETITION
// --------------------------------------------------------------
app.post("/generate-petition", async (req, res) => {
  console.log("Incoming request:", req.body);

  const description = req.body.description || "";
  if (!description.trim()) {
    return res.status(200).json({
      petitionText: "Please enter your complaint description.",
      primaryInstitution: null,
      throughInstitution: null,
      ccList: [],
    });
  }

  const complainant = {
    fullName: req.body.fullName || "",
    email: req.body.email || "",
    phone: req.body.phone || "",
    address: req.body.address || "",
    description,
  };

  try {
    // 1. Core routing (electricity / international / AI)
    let inst = await detectHybrid(description);

    // Ensure base shape
    if (!inst || typeof inst !== "object") {
      inst = { primary: null, through: null, ccList: [] };
    }
    if (!Array.isArray(inst.ccList)) inst.ccList = [];

    // 2. Apply watchdogs (PCC + NHRC)
    inst = applyWatchdogs(description, inst);

    // 3. Apply sector-wide supervisors (police, health, aviation, etc.)
    inst = applySectorSupervisors(description, inst);

    // 4. Detect sector & refine institutions for police cases (CP + IGP)
    const sector = detectSector(description, inst);
    if (sector === "police") {
      inst = refinePoliceInstitutions(description, inst);
    }

    // Clean CC list
    inst.ccList = inst.ccList.filter(
      (c) => c && typeof c.org === "string" && c.org.trim()
    );

    // 5. Build petition text (sector-aware, SAN-grade where possible)
    const petitionText = await buildPetition(complainant, inst, sector);

    // 6. Respond
    return res.status(200).json({
      petitionText,
      primaryInstitution: inst.primary,
      throughInstitution: inst.through,
      ccList: inst.ccList,
    });
  } catch (err) {
    console.error("Error in /generate-petition:", err);
    return res.status(500).json({
      petitionText:
        "An internal error occurred while generating your petition. Please try again.",
      primaryInstitution: null,
      throughInstitution: null,
      ccList: [],
      error: "INTERNAL_ERROR",
    });
  }
});

// --------------------------------------------------------------
// POST: PAY (Flutterwave V3)
// --------------------------------------------------------------
app.post("/pay", async (req, res) => {
  try {
    const result = await startFlutterwavePayment(req.body);
    if (!result.ok) {
      return res.status(500).json({ error: result.error || "Payment error." });
    }
    return res.json({
      paymentLink: result.paymentLink,
      txRef: result.txRef,
    });
  } catch (err) {
    console.error("Payment route error:", err);
    return res.status(500).json({ error: "Payment error." });
  }
});

// --------------------------------------------------------------
// START SERVER
// --------------------------------------------------------------
app.listen(PORT, "0.0.0.0", () =>
  console.log(`JusticeBot PDPS-2.2 PRO Backend running on ${PORT}`)
);

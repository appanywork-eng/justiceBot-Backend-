const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

/* ===========================================================
   LOAD INSTITUTIONS DATABASE
=========================================================== */
const institutions = JSON.parse(
  fs.readFileSync(path.join(__dirname, "data/institutions.json"), "utf8")
);

/* ===========================================================
   ROOT ROUTE
=========================================================== */
app.get("/", (req, res) => {
  res.json({
    status: "JusticeBot backend is running ✅"
  });
});

/* ===========================================================
   HEALTH CHECK
=========================================================== */
app.get("/health", (req, res) => {
  res.json({
    status: "Healthy ✅"
  });
});

/* ===========================================================
   MAIN ANALYZE ENDPOINT
=========================================================== */
app.post("/analyze", (req, res) => {
  const { complaint } = req.body;

  if (!complaint || complaint.trim() === "") {
    return res.status(400).json({
      error: "No complaint provided"
    });
  }

  let classification = "General complaint";
  let advice = "Please provide more details.";
  let recommendation = "None";

  // ✅ SIMPLE CLASSIFIER
  if (
    complaint.toLowerCase().includes("arrest") ||
    complaint.toLowerCase().includes("detain")
  ) {
    classification = "Possible human rights violation";
    advice = "You may submit this as a formal petition.";
    recommendation =
      "Provide date, location, officers involved if possible.";
  }

  if (complaint.toLowerCase().includes("police")) {
    classification = "Police misconduct";
  }

  if (complaint.toLowerCase().includes("court")) {
    classification = "Judicial issue";
  }

  if (
    complaint.toLowerCase().includes("prison") ||
    complaint.toLowerCase().includes("cell")
  ) {
    classification = "Detention issue";
  }

  /* ===========================================================
      FIND RELEVANT INSTITUTIONS
  =========================================================== */
  let relatedInstitutions = [];

  if (complaint.toLowerCase().includes("police")) {
    relatedInstitutions =
      relatedInstitutions.concat(institutions["Law Enforcement"]);
  }

  if (
    complaint.toLowerCase().includes("arrest") ||
    complaint.toLowerCase().includes("court") ||
    complaint.toLowerCase().includes("judge")
  ) {
    relatedInstitutions =
      relatedInstitutions.concat(institutions["Judiciary"]);
  }

  if (
    complaint.toLowerCase().includes("prison") ||
    complaint.toLowerCase().includes("cell") ||
    complaint.toLowerCase().includes("detain")
  ) {
    relatedInstitutions =
      relatedInstitutions.concat(institutions["Prison & Corrections"]);
  }

  if (
    complaint.toLowerCase().includes("rights") ||
    complaint.toLowerCase().includes("abuse") ||
    complaint.toLowerCase().includes("unfair")
  ) {
    relatedInstitutions =
      relatedInstitutions.concat(
        institutions["Human Rights & Ombudsman"]
      );
  }

  if (
    complaint.toLowerCase().includes("airport") ||
    complaint.toLowerCase().includes("flight")
  ) {
    relatedInstitutions =
      relatedInstitutions.concat(
        institutions["Aviation & Transport"]
      );
  }

  if (
    complaint.toLowerCase().includes("immigration") ||
    complaint.toLowerCase().includes("passport")
  ) {
    relatedInstitutions =
      relatedInstitutions.concat(
        institutions["Immigration & Borders"]
      );
  }

  if (
    complaint.toLowerCase().includes("army") ||
    complaint.toLowerCase().includes("soldier") ||
    complaint.toLowerCase().includes("military")
  ) {
    relatedInstitutions =
      relatedInstitutions.concat(
        institutions["Military & Defence"]
      );
  }

  if (
    complaint.toLowerCase().includes("abuja") ||
    complaint.toLowerCase().includes("fct")
  ) {
    relatedInstitutions =
      relatedInstitutions.concat(institutions["FCT & Abuja"]);
  }

  if (
    complaint.toLowerCase().includes("bank") ||
    complaint.toLowerCase().includes("loan") ||
    complaint.toLowerCase().includes("fraud")
  ) {
    relatedInstitutions =
      relatedInstitutions.concat(
        institutions["Financial / Regulatory"]
      );
  }

  if (
    relatedInstitutions.length === 0
  ) {
    relatedInstitutions =
      relatedInstitutions.concat(
        institutions["Human Rights & Ombudsman"]
      );
  }

  /* ===========================================================
      FINAL RESPONSE
  =========================================================== */
  res.json({
    received: complaint,
    classification: classification,
    advice: advice,
    recommendation: recommendation,
    institutions: relatedInstitutions
  });
});

/* ===========================================================
   START SERVER
=========================================================== */
app.listen(PORT, () => {
  console.log(`✅ JusticeBot backend is running on port ${PORT}`);
});

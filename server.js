/**
 * JusticeBot Backend (Complete + CORS + Health Check)
 */

const express = require("express");
const cors = require("cors");
const app = express();

// MIDDLEWARE
app.use(cors());
app.use(express.json());

// --- CATEGORY DETECTION LOGIC ---
function detectCategory(text) {
  text = text.toLowerCase();

  if (text.includes("police") || text.includes("officer") || text.includes("arrest"))
    return "Police Misconduct";

  if (text.includes("land") || text.includes("property") || text.includes("ownership"))
    return "Land Dispute";

  if (text.includes("employer") || text.includes("salary") || text.includes("workplace"))
    return "Employment Issue";

  if (text.includes("fraud") || text.includes("scam") || text.includes("419"))
    return "Fraud";

  return "General Complaint";
}

// --- INSTITUTION DATABASE ---
const INSTITUTIONS = {
  "Police Misconduct": {
    name: "Police Service Commission (PSC)",
    email: "info@psc.gov.ng",
    phone: "+234-803-000-0000"
  },
  "Land Dispute": {
    name: "Ministry of Lands & Survey",
    email: "lands@fct.gov.ng",
    phone: "+234-809-111-1111"
  },
  "Employment Issue": {
    name: "National Industrial Court",
    email: "nicn@nicn.gov.ng",
    phone: "+234-807-222-2222"
  },
  "Fraud": {
    name: "EFCC",
    email: "info@efcc.gov.ng",
    phone: "+234-809-333-3333"
  },
  "General Complaint": {
    name: "Public Complaints Commission (PCC)",
    email: "complaints@pcc.gov.ng",
    phone: "+234-708-000-0000"
  }
};

// --- MAIN ENDPOINT ---
app.post("/", (req, res) => {
  const text = req.body.text || "";
  const category = detectCategory(text);
  const institution = INSTITUTIONS[category];

  return res.json({
    success: true,
    category,
    institution
  });
});

// --- TEST ROUTE (IMPORTANT FOR CHECKING IF BACKEND WORKS) ---
app.get("/", (req, res) => {
  res.send("JusticeBot backend is running ✅");
});

// --- RENDER PORT ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("🔥 JusticeBot backend running on port", PORT);
});

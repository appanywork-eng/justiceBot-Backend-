import express from "express";
import cors from "cors";
import fs from "fs";

const app = express();
app.use(cors());
app.use(express.json());

// Load institutions list
const institutions = JSON.parse(
  fs.readFileSync("./data/institutions.json", "utf8")
);

// Helper function for matching
function findMatchedInstitutions(text) {
  const lower = text.toLowerCase();
  let result = [];
  let category = "General Complaint";

  // ---- KEYWORD RULES ----
  if (lower.includes("air") || lower.includes("flight") || lower.includes("airport")) {
    category = "Aviation";
    if (institutions["Aviation"]) result = institutions["Aviation"];
  }
  else if (lower.includes("police") || lower.includes("arrest") || lower.includes("station")) {
    category = "Law Enforcement";
    if (institutions["Law Enforcement"]) result = institutions["Law Enforcement"];
  }
  else if (lower.includes("court") || lower.includes("judge") || lower.includes("lawyer")) {
    category = "Judiciary";
    if (institutions["Judiciary"]) result = institutions["Judiciary"];
  }
  else if (lower.includes("prison") || lower.includes("inmate") || lower.includes("custody")) {
    category = "Prisons";
    if (institutions["Prisons"]) result = institutions["Prisons"];
  }
  else if (lower.includes("ministry") || lower.includes("minister") || lower.includes("government")) {
    category = "Government Ministries";
    if (institutions["Ministries"]) result = institutions["Ministries"];
  }
  else if (lower.includes("school") || lower.includes("university") || lower.includes("student")) {
    category = "Education";
    if (institutions["Education"]) result = institutions["Education"];
  }
  else if (lower.includes("hospital") || lower.includes("doctor") || lower.includes("nurse")) {
    category = "Health";
    if (institutions["Health"]) result = institutions["Health"];
  }

  return { category, institutions: result };
}

app.get("/health", (req, res) => {
  res.json({ status: "JusticeBot backend is running ✅" });
});

app.post("/analyze", (req, res) => {
  const { complaint } = req.body;

  if (!complaint) {
    return res.status(400).json({ error: "No complaint provided" });
  }

  const { category, institutions } = findMatchedInstitutions(complaint);

  res.json({
    received: complaint,
    classification: category,
    generated_petition: `This is a formal petition regarding the following issue: ${complaint}`,
    recommended_institutions: institutions.map(i => i.name)
  });
});

// Port
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ JusticeBot backend running on port ${PORT}`);
});

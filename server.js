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

// -------- SMART CATEGORY + MATCHING ENGINE ----------
function findMatchedInstitutions(text) {
  const lower = text.toLowerCase();

  const categoryKeywords = {

    "Law Enforcement": [
      "police", "arrest", "assault", "brutality",
      "extortion", "checkpoint", "harassment"
    ],

    "Land & Property": [
      "land", "property", "house", "demolish",
      "taken", "seized", "eviction", "landlord", "tenant"
    ],

    "Electricity / Power": [
      "aedc", "nepa", "phcn", "disco",
      "electric", "light", "over billed", "transformer", "blackout"
    ],

    "Government Abuse": [
      "local government", "governor", "chairman",
      "commissioner", "official", "ministry", "bribe"
    ],

    "Aviation": [
      "airport", "flight", "airline", "delay",
      "aviation", "plane", "air peace", "arik", "peace airline"
    ],

    "Judiciary": [
      "court", "judge", "lawyer", "magistrate", "tribunal"
    ],

    "Education": [
      "school", "teacher", "university", "student", "lecturer"
    ],

    "Health": [
      "hospital", "doctor", "nurse", "clinic", "medical"
    ],

    "Prisons": [
      "prison", "inmate", "jail", "custody", "cell"
    ],

    "Human Rights": [
      "rights", "violation", "illegal", "torture",
      "detention", "inhuman", "kidnap", "abuse"
    ]
  };

  let category = "General Complaint";
  let result = [];

  for (const cat in categoryKeywords) {
    for (const keyword of categoryKeywords[cat]) {
      if (lower.includes(keyword)) {
        category = cat;

        if (institutions[cat]) {
          result = institutions[cat];
        }

        return { category, institutions: result };
      }
    }
  }

  return { category, institutions: result };
}

// -------- HEALTH CHECK ----------
app.get("/health", (req, res) => {
  res.json({ status: "JusticeBot backend is running ✅" });
});

// -------- MAIN ANALYZE ROUTE ----------
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
    recommended_institutions: institutions.map(inst => inst.name)
  });
});

// -------- SERVER LISTEN ----------
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`✅ JusticeBot backend running on port ${PORT}`);
});

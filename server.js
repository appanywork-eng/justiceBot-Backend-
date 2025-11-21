import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// ✅ HEALTH CHECK
app.get("/health", (req, res) => {
  res.json({ status: "JusticeBot backend is running ✅" });
});

// ✅ LOAD INSTITUTIONS
const institutionsPath = path.join(__dirname, "data", "institutions.json");

let institutions = {};
try {
  const raw = fs.readFileSync(institutionsPath, "utf8");
  institutions = JSON.parse(raw);
} catch (err) {
  console.error("❌ Problem loading institutions.json", err);
  institutions = {};
}

// ✅ ANALYZE ROUTE
app.post("/analyze", (req, res) => {
  const { complaint } = req.body;

  if (!complaint || complaint.trim() === "") {
    return res.status(400).json({ error: "No complaint provided" });
  }

  let classification = "General complaint";
  let advice = "Further investigation required.";
  let recommendation = "Provide full details and evidence.";

  const text = complaint.toLowerCase();

  if (text.includes("police") || text.includes("arrest")) {
    classification = "Possible human rights violation";
    advice = "You may submit this as a formal petition to PCC or a court of law.";
    recommendation =
      "Provide date, location, and officer names if possible.";
  }

  if (text.includes("land") || text.includes("house")) {
    classification = "Property / Land dispute";
    advice = "Consider reporting to relevant Land Authority or court.";
    recommendation = "Provide land documents and location details.";
  }

  res.json({
    received: complaint,
    classification,
    advice,
    recommendation,
    institutions
  });
});

// ✅ PORT FIX FOR RENDER
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`✅ JusticeBot is running on port ${PORT}`);
});

import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

// ✅ TEST ROUTE (This fixes "Cannot GET /")
app.get("/", (req, res) => {
  res.send("JusticeBot backend running ✅");
});

// ✅ ANALYZE ROUTE
app.post("/analyze", async (req, res) => {
  try {
    const { complaint } = req.body;

    if (!complaint) {
      return res.status(400).json({ error: "No complaint provided" });
    }

    let result = {
      category: "Human Rights / Public Complaint",
      advice:
        "Your complaint falls under human rights or government misconduct. You may file a formal petition to the Public Complaints Commission or seek legal aid.",
      recommendation:
        "Write a detailed statement including date, location, officer names (if known), and evidence."
    };

    res.json(result);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ Render provides PORT - we must use this
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

// ✅ Health check (for browser test)
app.get("/health", (req, res) => {
    res.json({ status: "JusticeBot backend is running ✅" });
});

// ✅ Root check (for browser test)
app.get("/", (req, res) => {
    res.send("JusticeBot API is live ✅");
});

// ✅ Complaint analyzer
app.post("/analyze", (req, res) => {
    const { complaint } = req.body;

    if (!complaint) {
        return res.status(400).json({ error: "No complaint provided" });
    }

    const result = {
        received: complaint,
        classification: "Possible human rights violation",
        advice: "You may submit this as a formal petition at PCC or a court of law.",
        recommendation: "Provide date, location, and officer names if possible."
    };

    res.json(result);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`JusticeBot backend running on port ${PORT}`);
});

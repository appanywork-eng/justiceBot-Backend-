const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

// CORS FIX
app.use(cors({
  origin: "*",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json());

// ✅ TEST ROUTE
app.get("/", (req, res) => {
  res.send("JusticeBot backend running ✅");
});

// ✅ MAIN ANALYZE ROUTE
app.post("/analyze", (req, res) => {
  const { text } = req.body;

  if (!text || text.trim() === "") {
    return res.status(400).json({ error: "Complaint text required" });
  }

  const response = {
    category: "Human Rights / Police Misconduct",
    suggestion:
      "You may submit a formal petition to the Public Complaints Commission (PCC), NHRC, or Police Service Commission.",
    structuredPetition: `
PETITION AGAINST POLICE MISCONDUCT

I hereby submit a formal complaint that I was arrested by the Nigerian Police without any valid reason or explanation.

This action is a violation of my constitutional rights as provided under the 1999 Constitution of the Federal Republic of Nigeria.

I request an immediate investigation into this matter and appropriate disciplinary action.

Thank you.

Signed:
Concerned Citizen
`.trim(),
  };

  res.json(response);
});

// ✅ START SERVER
app.listen(PORT, () => {
  console.log("JusticeBot backend running on port " + PORT);
});

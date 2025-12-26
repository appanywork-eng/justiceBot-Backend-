const express = require("express");
const app = express();

app.use(express.json());

// Hybrid routing using OpenAI
app.post("/route", async (req, res) => {
  try {
    const { complaint, sector } = req.body;

    if (!complaint) {
      return res.status(400).json({ error: "Complaint text is required" });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "OpenAI API key not configured" });
    }

    const OpenAI = require("openai");
    const client = new OpenAI({ apiKey });

    // Dynamic institution routing decision
    const prompt = `
      You are a legal-grade ombudsman routing AI.
      Decide the most accurate Nigerian institution to route this complaint to.
      Complaint: "${complaint}"
      Sector: "${sector || "general"}"
      Return ONLY JSON in this format:
      { "institution": "", "reason": "" }
    `;

    const completion = await client.chat.completions.create({
      model: "gpt-5.1",
      messages: [{ role: "user", content: prompt }],
    });

    const aiResponse = completion.choices[0].message.content.trim();

    // Ensure valid JSON output
    let routeDecision;
    try {
      routeDecision = JSON.parse(aiResponse);
    } catch {
      return res.status(500).json({ error: "AI returned invalid routing JSON", raw: aiResponse });
    }

    return res.json({
      sector: sector || "general",
      routeDecision: routeDecision.institution,
      reason: routeDecision.reason,
    });

  } catch (err) {
    return res.status(500).json({ error: "Routing failed", details: err.message });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`JusticeBot Hybrid Routing Server running on port ${PORT}`);
});

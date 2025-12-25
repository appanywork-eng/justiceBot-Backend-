// server.cjs
const express = require('express');
const cors = require('cors');
const { OpenAI } = require('openai');

const app = express();
app.use(cors());
app.use(express.json());

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Hybrid dynamic routing endpoint
app.post('/route', async (req, res) => {
  try {
    const { complaint, sector } = req.body;
    if (!complaint) {
      return res.status(400).json({ error: "Complaint text is required" });
    }

    // Load sector JSON dynamically
    const sectorData = require(`./data/${sector}.json`);

    // AI decision layer
    const aiResponse = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a routing assistant for petitions." },
        { role: "user", content: `Route this complaint in ${sector} sector: ${complaint}` }
      ]
    });

    const routeDecision = aiResponse.choices[0].message.content;

    // Logic validation layer
    const regulators = sectorData.core_regulators || [];
    const ccList = regulators.map(r => r.emails).flat();

    res.json({
      sector,
      routeDecision,
      cc: ccList,
      regulators
    });

  } catch (err) {
    res.status(500).json({ error: "Routing failed", details: err.message });
  }
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});

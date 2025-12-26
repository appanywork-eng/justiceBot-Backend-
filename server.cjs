require("dotenv").config();
const express = require("express");
const OpenAI = require("openai");

const app = express();
app.use(express.json());

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post("/route", async (req, res) => {
  try {
    const { complaint, sector } = req.body;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a legal routing assistant." },
        { role: "user", content: `Route this complaint to the right Nigerian institution dynamically: ${complaint} (sector: ${sector})` }
      ]
    });

    res.json({
      sector,
      routeDecision: completion.choices[0].message.content
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Hybrid routing server running on port", process.env.PORT || 3000);
});

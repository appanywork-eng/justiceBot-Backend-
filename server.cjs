require('dotenv').config();
const express = require('express');
const app = express();
app.use(express.json());

const OpenAI = require('openai');
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post('/route', async (req, res) => {
  try {
    const { complaint } = req.body;
    if (!complaint) {
      return res.status(400).json({ error: "Complaint text required" });
    }

    const aiResponse = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a Nigerian institution routing assistant. Never return names of real people. Only return institution titles." },
        { role: "user", content: `Analyze and return the correct institution to handle this complaint in Nigeria: \"${complaint}\". Return only the institution title.` }
      ]
    });

    res.json({
      route: aiResponse.choices[0].message.content.trim()
    });

  } catch (err) {
    res.status(500).json({ error: "Routing failed", details: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

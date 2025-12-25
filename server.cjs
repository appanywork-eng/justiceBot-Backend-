#!/usr/bin/env node
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const sectors = ['banking','power','aviation','telecoms','judiciary','education','security','international_escalation'];

const dataDir = path.join(__dirname, 'data');

const sectorData = {};
for (const s of sectors) {
  const file = path.join(dataDir, `${s}.json`);
  try {
    sectorData[s] = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    sectorData[s] = null;
  }
}

app.post('/route', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({error:'No text provided'});

  try {
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {role:'system',content:'You are a professional Nigerian ombudsman-grade routing engine. Determine the correct sector and institution to escalate this complaint.'},
        {role:'user',content:`Complaint: ${text}. Sectors available: ${sectors.join(', ')}`}
      ]
    });

    const reply = completion.choices[0].message.content.toLowerCase();
    let sector = sectors.find(s => reply.includes(s.toLowerCase()));

    if (!sector) sector = 'international_escalation';

    let institution = null;
    const sec = sectorData[sector];
    if (sec && typeof sec === 'object') {
      for (const k in sec) {
        if (typeof sec[k] === 'object') {
          const name = sec[k].name?.toLowerCase() || sec[k].name;
          if (name && reply.includes(name)) {
            institution = sec[k].name;
            break;
          }
        }
      }
    }

    return res.json({ sector, institution, ai_reply: completion.choices[0].message.content });
  } catch (e) {
    res.status(500).json({error:'Routing failed',detail:e.message});
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

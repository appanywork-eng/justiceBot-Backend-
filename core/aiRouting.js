// core/aiRouting.js
// AI-based routing + hybrid detector.

const { getOpenAI } = require("./openaiClient");
const { detectElectricity, detectInternational } = require("./institutions");
const { textIncludesAny, normaliseOrgName } = require("./helpers");

// AI DETECTION (GENERIC – WORLDWIDE)
async function aiDetect(description) {
  const openai = getOpenAI();
  if (!openai) return { primary: null, through: null, ccList: [] };

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `
You are a global institutions routing engine. RETURN ONLY JSON:

{
  "primary": { "org": "", "title": "", "email": "", "address": "" },
  "supervising": [ { "org": "", "title": "", "email": "", "address": "" } ],
  "cc": [ { "org": "", "title": "", "email": "", "address": "" } ]
}

Rules:
- Use ONLY verified-style domains for emails (.gov, .gov.ng, .org, .int, or clearly official company domains).
- If unsure of an email, leave it as an empty string.
- DO NOT invent fake domains or placeholders.
- No markdown, no comments, no extra text – JSON only.
`,
        },
        {
          role: "user",
          content:
            "Complaint:\n" +
            description +
            "\nReturn ONLY the JSON object described. No backticks.",
        },
      ],
    });

    const txt = resp.choices?.[0]?.message?.content || "{}";
    const data = JSON.parse(txt);

    function clean(o) {
      if (!o || !o.org) return null;
      return {
        org: o.org.trim(),
        title: (o.title || "").trim(),
        email: (o.email || "").trim(),
        address: (o.address || "").trim(),
      };
    }

    const primary = clean(data.primary);
    const through =
      Array.isArray(data.supervising) && data.supervising.length
        ? clean(data.supervising[0])
        : null;

    const ccList = [];

    if (Array.isArray(data.supervising)) {
      data.supervising.slice(1).forEach((x) => {
        const c = clean(x);
        if (c) ccList.push(c);
      });
    }

    if (Array.isArray(data.cc)) {
      data.cc.forEach((x) => {
        const c = clean(x);
        if (
          c &&
          !ccList.some(
            (e) =>
              normaliseOrgName(e.org) === normaliseOrgName(c.org)
          )
        ) {
          ccList.push(c);
        }
      });
    }

    return { primary, through, ccList };
  } catch (err) {
    console.error("AI routing error:", err);
    return { primary: null, through: null, ccList: [] };
  }
}

// HYBRID DETECTION PIPELINE
async function detectHybrid(description) {
  // 1. Electricity rule – always first for billing/meter issues
  const elec = detectElectricity(description);
  if (elec) {
    console.log("Routing via ELECTRICITY rules");
    return elec;
  }

  // 2. International genocide / mass atrocity escalation
  const intl = detectInternational(description);
  if (intl) {
    console.log("Routing via INTERNATIONAL GENOCIDE rules");
    return intl;
  }

  // 3. Generic AI-based detection for all other cases
  const ai = await aiDetect(description);
  console.log("Routing via AI generic detection");
  return ai;
}

module.exports = {
  aiDetect,
  detectHybrid,
};

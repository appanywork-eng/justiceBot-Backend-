// a8Engine.js
"use strict";

/**
 * JUSTICEBOT A8 ENGINE (AI version)
 * ---------------------------------
 * This module is called by server.cjs like:
 *   generatePetitionA8({ complainant, description, institutionsJson })
 *
 * It must return:
 * {
 *   petitionText: string,
 *   primaryInstitution: { org, title, address, email } | null,
 *   throughInstitution: { org, title, address, email } | null,
 *   ccList: [ { org, title, address, email }, ... ],
 *   routingSummary: string | null
 * }
 */

const OpenAI = require("openai");

// ---------------------------------------------
// OPENAI CLIENT
// ---------------------------------------------
let openai = null;
try {
  if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.log("[A8] OpenAI client initialised");
  } else {
    console.warn("[A8] OPENAI_API_KEY not set – A8 will be disabled.");
  }
} catch (err) {
  console.error("[A8] Error initialising OpenAI client:", err);
  openai = null;
}

// ---------------------------------------------
// Helpers
// ---------------------------------------------

function normalizeInstitution(raw) {
  if (!raw || !raw.org || typeof raw.org !== "string") return null;
  return {
    org: raw.org.trim(),
    title: raw.title?.trim?.() || "",
    address: raw.address?.trim?.() || "",
    email: raw.email?.trim?.() || "",
  };
}

function extractJsonBlock(text) {
  if (!text) return text;
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```[a-zA-Z]*\s*/, "").replace(/```$/, "").trim();
  }
  return t;
}

function buildRoutingSummary(primary, through, ccList) {
  const parts = [];
  if (primary?.org) parts.push(`Primary: ${primary.org}`);
  if (through?.org) parts.push(`Through: ${through.org}`);
  if (Array.isArray(ccList) && ccList.length > 0) {
    parts.push(
      "CC: " + ccList.map((i) => i.org).filter(Boolean).join("; ")
    );
  }
  return parts.length ? parts.join(" | ") : null;
}

// ---------------------------------------------
// MAIN A8 ENGINE
// ---------------------------------------------
async function generatePetitionA8(args) {
  if (!openai) throw new Error("OpenAI not initialised for A8");

  const { description, complainant, institutionsJson } = args || {};
  const { fullName, email, phone, address } = complainant || {};

  if (!description || description.trim().length < 10) {
    throw new Error("Description too short");
  }

  const today = new Date().toLocaleDateString("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  let instContext = "";
  try {
    if (institutionsJson) {
      instContext = JSON.stringify(institutionsJson).slice(0, 3500);
    }
  } catch (_) {
    instContext = "";
  }

  const systemPrompt = `
You are A8, the master global petition engine for PetitionDesk.

Your job is ALWAYS:
1. Understand the case (domestic, international, human rights, corruption, consumer abuse, etc.)
2. Select correct institutions worldwide:
   - "primary"
   - "through"
   - "cc" list
3. Draft ONE official petition.
4. Return ONLY valid JSON:
{
  "primary": {...},
  "through": {...} or null,
  "cc": [ ... ],
  "petitionText": "..."
}

Rules:
- Use ONLY REAL complainant details (don't invent).
- If email/address/title is unknown, leave it empty.
- For global issues, include AU, ECOWAS, UN, EU, US if relevant.
- Petition must be official Nigerian-style: clear, firm, respectful.
- Subject must start with "RE:"
`;

  const userPrompt =
    `Complainant:\n` +
    `Name: ${fullName || ""}\n` +
    `Email: ${email || ""}\n` +
    `Phone: ${phone || ""}\n` +
    `Address: ${address || ""}\n` +
    `Date: ${today}\n\n` +
    `Optional institutions config:\n${instContext}\n\n` +
    `Complaint description:\n${description}\n\n` +
    `Return ONLY the JSON object.`;

  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  let raw = resp.choices?.[0]?.message?.content || "";
  raw = extractJsonBlock(raw);

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error("JSON parse error:", raw);
    throw new Error("Invalid JSON from A8");
  }

  const primary = normalizeInstitution(data.primary);
  const through = normalizeInstitution(data.through);
  const ccList = (data.cc || []).map(normalizeInstitution).filter(Boolean);
  const petitionText = data.petitionText?.trim?.() || "";

  if (!petitionText) throw new Error("A8 returned empty petition");

  return {
    petitionText,
    primaryInstitution: primary,
    throughInstitution: through,
    ccList,
    routingSummary: buildRoutingSummary(primary, through, ccList),
  };
}

module.exports = { generatePetitionA8 };

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

// Normalize an institution object from AI into our shape
function normalizeInstitution(raw) {
  if (!raw || typeof raw.org !== "string" || !raw.org.trim()) return null;
  return {
    org: raw.org.trim(),
    title:
      typeof raw.title === "string" && raw.title.trim()
        ? raw.title.trim()
        : "",
    address:
      typeof raw.address === "string" && raw.address.trim()
        ? raw.address.trim()
        : "",
    email:
      typeof raw.email === "string" && raw.email.trim()
        ? raw.email.trim()
        : "",
  };
}

// Sometimes the model might wrap JSON in ```json ... ```
function extractJsonBlock(text) {
  if (!text) return text;
  const trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    // remove ```...``` fences
    const withoutTicks = trimmed.replace(/^```[a-zA-Z]*\s*/, "").replace(/```$/, "");
    return withoutTicks.trim();
  }
  return trimmed;
}

// Build a short routing summary string
function buildRoutingSummary(primary, through, ccList) {
  const parts = [];
  if (primary && primary.org) {
    parts.push(`Primary: ${primary.org}`);
  }
  if (through && through.org) {
    parts.push(`Through: ${through.org}`);
  }
  if (Array.isArray(ccList) && ccList.length > 0) {
    const ccNames = ccList
      .filter((c) => c && c.org)
      .map((c) => c.org)
      .join("; ");
    parts.push(`CC: ${ccNames}`);
  }
  return parts.length ? parts.join(" | ") : null;
}

// ---------------------------------------------
// Main A8 function
// ---------------------------------------------
/**
 * generatePetitionA8
 * @param {object} args
 *  - description: string
 *  - complainant: { fullName, email, phone, address }
 *  - institutionsJson: any (optional extra config from institutions.json)
 *
 * @returns {Promise<{
 *   petitionText: string,
 *   primaryInstitution: object | null,
 *   throughInstitution: object | null,
 *   ccList: object[],
 *   routingSummary: string | null
 * }>}
 */
async function generatePetitionA8(args) {
  if (!openai) {
    throw new Error("OpenAI not initialised for A8");
  }

  const { description, complainant, institutionsJson } = args || {};
  const { fullName, email, phone, address } = complainant || {};

  if (!description || typeof description !== "string" || description.trim().length < 10) {
    throw new Error("Description is missing or too short for A8");
  }

  const today = new Date().toLocaleDateString("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Optional: compress institutions.json into context if provided
  let instContext = "";
  try {
    if (institutionsJson && typeof institutionsJson === "object") {
      const rawStr = JSON.stringify(institutionsJson);
      // Avoid overloading context: truncate if too long
      instContext = rawStr.slice(0, 3500);
    }
  } catch (err) {
    console.warn("[A8] Could not stringify institutionsJson:", err.message);
    instContext = "";
  }

  const systemPrompt = `
You are A8, the master global petition engine for "PetitionDesk".

Your job for EACH complaint is to:

1) Carefully understand the complaint and detect:
   - Is it domestic (Nigeria)?
   - Is it involving other countries or international bodies?
   - Is it about human rights, corruption, consumer abuse, labour, housing, banking, telecoms, electricity, immigration, police, etc.?

2) Choose the correct institutions WORLD-WIDE to handle it:
   - "primary": the main body that should receive the petition.
   - "through": an optional supervising / oversight body used as a channel (for example, Police Service Commission for police matters, NERC for electricity discos, CBN for banks, NCC for telecoms, etc.).
   - "cc": other institutions that should be copied (e.g. PCC, NHRC, AU, ECOWAS, UN bodies, Human Rights NGOs, Parliament committees, etc.).

   For Nigerian complaints, strongly consider:
   - Public Complaints Commission (PCC)
   - National Human Rights Commission (NHRC)
   - Police Service Commission (PSC)
   - Central Bank of Nigeria (CBN)
   - Federal Competition and Consumer Protection Commission (FCCPC)
   - Nigerian Communications Commission (NCC)
   - NERC, ICPC, EFCC, etc. where relevant.

   For human rights / political detention / international advocacy, consider:
   - UN Human Rights Council
   - African Union (AU)
   - ECOWAS
   - EU Parliament
   - US Congress, relevant foreign ministries, etc.

3) Draft ONE strong, formal petition letter that can be printed or sent as-is.
   - Use ONLY the REAL complainant details given to you (name, address, email, phone).
   - Do NOT fabricate new personal details or new facts.
   - Do NOT use placeholders like [Your Name] or [Address]. If you don't know a detail, simply omit that line.
   - Use a clear Nigerian/official style: firm, respectful, and professional.

4) Return ONLY VALID JSON (no markdown, no backticks) with the EXACT structure:

{
  "primary":  { "org": string, "title": string, "address": string, "email": string },
  "through":  { "org": string, "title": string, "address": string, "email": string } | null,
  "cc":       [ { "org": string, "title": string, "address": string, "email": string } ],
  "petitionText": string
}

RULES:
- "org" is mandatory for any institution object.
- If you don't know "title" or "address" or "email", leave that field as an empty string.
- Never invent obviously fake emails. If unsure, leave email empty.
- "petitionText" must be a complete, formal letter, including:
  - Complainant's details at the top (if provided),
  - Date,
  - A clear subject line starting with "RE:",
  - A factual narrative of the complaint (with dates, amounts, etc. based on the description),
  - A section listing the reliefs / requests,
  - A proper closing: "Yours faithfully," and the complainant's name.
`;

  const userPrompt =
    `Complainant details:\n` +
    `Name: ${fullName || ""}\n` +
    `Email: ${email || ""}\n` +
    `Phone: ${phone || ""}\n` +
    `Address: ${address || ""}\n` +
    `Date: ${today}\n\n` +
    (instContext
      ? `Optional institutions configuration (JSON, may help you choose electricity/sectorial bodies):\n${instContext}\n\n`
      : "") +
    `Complaint description (write petition based on this, without inventing new facts):\n` +
    description +
    `\n\nReturn ONLY the JSON object in the required format.`;

  // Call OpenAI
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
    console.error("[A8] JSON parse failed. Raw content was:", raw);
    throw new Error("A8 JSON parse failed");
  }

  const primary = normalizeInstitution(data.primary);
  const through = normalizeInstitution(data.through);
  const ccList = Array.isArray(data.cc)
    ? data.cc.map(normalizeInstitution).filter(Boolean)
    : [];

  const petitionText =
    typeof data.petitionText === "string" && data.petitionText.trim()
      ? data.petitionText.trim()
      : "";

  if (!petitionText) {
    throw new Error("A8 returned empty petition text");
  }

  const routingSummary = buildRoutingSummary(primary, through, ccList);

  return {
    petitionText,
    primaryInstitution: primary,
    throughInstitution: through,
    ccList,
    routingSummary,
  };
}

module.exports = {
  generatePetitionA8,
};

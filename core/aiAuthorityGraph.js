"use strict";

/**
 * core/aiAuthorityGraph.js
 * ----------------------------------------
 * AI Institutional Intelligence Engine
 *
 * Goal:
 *  - Turn ANY complaint (any country) into an "authority graph":
 *      - jurisdiction (country/state/city)
 *      - entities mentioned (bank/agency/company/etc.)
 *      - primary / secondary / oversight(cc) authorities
 *
 * Important:
 *  - This file does NOT rely on institutions.json.
 *  - Logic here is for validation + safe JSON parsing only.
 */

const { getOpenAI, isOpenAIReady } = require("./openaiClient");

// --------- PROMPTS (DO NOT DILUTE) ----------
const SYSTEM_PROMPT = `
You are an institutional intelligence engine.

Your task is to analyze a citizen complaint and identify the REAL-WORLD
authorities that have jurisdiction, regulatory power, enforcement power,
or oversight responsibility over the matter.

Rules:
1. Do NOT guess randomly.
2. Prefer specific institutions over generic ones.
3. Resolve locations, organizations, and countries from context.
4. If an entity is a branch, identify its parent organization.
5. Only include police or security agencies if there is:
   - criminal activity
   - public safety risk
   - violence or rights violations
6. THROUGH is ONLY valid when a formal administrative chain exists.
7. If unsure about an institution, mark it as "confidence": "medium" or "low".
8. You MUST work for ANY country in the world.

Return ONLY valid JSON in the exact schema provided.
No explanations.
No prose.
`;

// -------------- Helpers -----------------

function clamp01(x) {
  const n = Number(x);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function safeString(x) {
  return String(x || "").trim();
}

function isValidConfidence(c) {
  return c === "high" || c === "medium" || c === "low";
}

function cleanAuthorityItem(item) {
  const institution = safeString(item?.institution);
  const role = safeString(item?.role);
  const confidenceRaw = safeString(item?.confidence).toLowerCase();
  const confidence = isValidConfidence(confidenceRaw) ? confidenceRaw : "medium";
  const reason = safeString(item?.reason);

  if (!institution) return null;

  return { institution, role, confidence, reason };
}

function cleanEntityItem(item) {
  const name = safeString(item?.name);
  const type = safeString(item?.type);
  const location = safeString(item?.location);
  const parent_entity = safeString(item?.parent_entity);

  if (!name) return null;
  return { name, type, location, parent_entity };
}

function normalizeGraph(raw) {
  const jurisdiction = raw?.jurisdiction || {};
  const entities = Array.isArray(raw?.entities_identified) ? raw.entities_identified : [];

  const ag = raw?.authority_graph || {};
  const primary = Array.isArray(ag?.primary) ? ag.primary : [];
  const secondary = Array.isArray(ag?.secondary) ? ag.secondary : [];
  const oversight = Array.isArray(ag?.oversight_or_cc) ? ag.oversight_or_cc : [];

  const out = {
    jurisdiction: {
      country: safeString(jurisdiction?.country),
      state_or_region: safeString(jurisdiction?.state_or_region),
      city_or_locality: safeString(jurisdiction?.city_or_locality),
    },
    entities_identified: entities.map(cleanEntityItem).filter(Boolean),
    authority_graph: {
      primary: primary.map(cleanAuthorityItem).filter(Boolean),
      secondary: secondary.map(cleanAuthorityItem).filter(Boolean),
      oversight_or_cc: oversight.map(cleanAuthorityItem).filter(Boolean),
    },
    routing_notes: safeString(raw?.routing_notes),
    overall_confidence: clamp01(raw?.overall_confidence),
  };

  // Minimum stability:
  // If AI returned nothing meaningful, keep structure intact.
  return out;
}

/**
 * Tries to parse JSON from a model response that might include extra text.
 */
function tryExtractJSON(text) {
  const t = safeString(text);
  if (!t) return null;

  // Quick path: pure JSON
  try {
    return JSON.parse(t);
  } catch (_) {}

  // Try to extract first {...} block
  const firstBrace = t.indexOf("{");
  const lastBrace = t.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const slice = t.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(slice);
    } catch (_) {}
  }
  return null;
}

function buildUserPrompt(complaintText) {
  return `
Complaint:
"""
${complaintText}
"""

Return the authority graph using this schema:

{
  "jurisdiction": {
    "country": "",
    "state_or_region": "",
    "city_or_locality": ""
  },
  "entities_identified": [
    {
      "name": "",
      "type": "bank | police | ministry | agency | private_company | individual | unknown",
      "location": "",
      "parent_entity": ""
    }
  ],
  "authority_graph": {
    "primary": [
      {
        "institution": "",
        "role": "regulatory | enforcement | adjudicatory",
        "confidence": "high | medium | low",
        "reason": ""
      }
    ],
    "secondary": [
      {
        "institution": "",
        "role": "",
        "confidence": "",
        "reason": ""
      }
    ],
    "oversight_or_cc": [
      {
        "institution": "",
        "role": "",
        "confidence": "",
        "reason": ""
      }
    ]
  },
  "routing_notes": "",
  "overall_confidence": 0.0
}
`;
}

// -------------- Main -----------------

async function getAuthorityGraph(complaintText) {
  const complaint = safeString(complaintText);

  // Always return a stable object (never crash server)
  const empty = normalizeGraph({
    jurisdiction: { country: "", state_or_region: "", city_or_locality: "" },
    entities_identified: [],
    authority_graph: { primary: [], secondary: [], oversight_or_cc: [] },
    routing_notes: "",
    overall_confidence: 0,
  });

  if (!complaint) return empty;

  if (!isOpenAIReady()) {
    // OpenAI not available; return stable empty.
    return empty;
  }

  const openai = getOpenAI();
  if (!openai) return empty;

  const userPrompt = buildUserPrompt(complaint);

  try {
    // NOTE: This assumes modern OpenAI SDK usage.
    // If your SDK version differs, we’ll adjust after your test output.
    const resp = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT.trim() },
        { role: "user", content: userPrompt.trim() },
      ],
    });

    const text =
      resp?.choices?.[0]?.message?.content ||
      resp?.choices?.[0]?.text ||
      "";

    const json = tryExtractJSON(text);
    if (!json) {
      return empty;
    }

    return normalizeGraph(json);
  } catch (err) {
    console.error("[aiAuthorityGraph] OpenAI call failed:", err?.message || err);
    return empty;
  }
}

module.exports = {
  getAuthorityGraph,
};

"use strict";

/**
 * Entity-first AI Routing Engine (PDPS 2.7 STABLE)
 * - NEVER crashes
 * - AI-first when available
 * - Deterministic fallback
 */

const { getAuthorityGraph } = require("./aiAuthorityGraph");

/* -----------------------------
   GUARANTEED SEVERITY CLASSIFIER
-------------------------------- */
function classifySeverity(text = "") {
  const t = text.toLowerCase();

  if (
    t.includes("refusing to treat") ||
    t.includes("assault") ||
    t.includes("detained") ||
    t.includes("abuse") ||
    t.includes("death") ||
    t.includes("life threatening")
  ) {
    return { level: "high", score: 0.85 };
  }

  if (
    t.includes("delay") ||
    t.includes("complaint") ||
    t.includes("unprofessional") ||
    t.includes("negligence")
  ) {
    return { level: "medium", score: 0.55 };
  }

  return { level: "low", score: 0.25 };
}

/* -----------------------------
   MAIN ROUTING FUNCTION
-------------------------------- */
async function routeComplaintEntityFirst(text = "", address = "") {
  text = String(text || "").trim();

  if (!text) {
    return {
      ok: false,
      error: "Empty complaint text",
    };
  }

  // 1️⃣ Severity (cannot fail)
  const severity = classifySeverity(text);

  // 2️⃣ Authority graph (AI or fallback)
  let graph;
  try {
    graph = await getAuthorityGraph(text);
  } catch (e) {
    graph = null;
  }

  // 3️⃣ Safe fallback if AI fails
  if (!graph || !graph.primary || graph.primary.length === 0) {
    return {
      ok: true,
      severity,
      primary: {
        org: "Public Complaints Commission",
        title: "The Honourable Chief Commissioner",
        country: "Nigeria",
      },
      through: null,
      cc: [],
      confidence: 0.35,
      mode: "fallback",
    };
  }

  // 4️⃣ Normalize AI result
  const primary = graph.primary[0] || null;
  const through = graph.secondary?.[0] || null;
  const cc = graph.oversight_or_cc || [];

  return {
    ok: true,
    severity,
    primary,
    through,
    cc,
    confidence: graph.overall_confidence || 0.7,
    mode: "ai",
  };
}

/* -----------------------------
   EXPORTS
-------------------------------- */
module.exports = {
  routeComplaintEntityFirst,
};

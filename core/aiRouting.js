/**
 * core/aiRouting.js
 *
 * Entity-first routing orchestrator.
 * - Uses aiAuthorityGraph (AI + severity guardrails) to decide Primary / Through / CC
 * - Produces stable output shape for UI and petition writer
 * - Never returns empty CC when severity is HIGH/CRITICAL
 *
 * This file does NOT "guess" institutions itself. It consumes the authority graph.
 */

const { getAuthorityGraph } = require("./aiAuthorityGraph");

// -----------------------------
// Helpers
// -----------------------------
function normalize(str = "") {
  return String(str || "").trim();
}

function normLower(str = "") {
  return normalize(str).toLowerCase();
}

function asArray(x) {
  if (!x) return [];
  return Array.isArray(x) ? x : [x];
}

function uniqByName(arr) {
  const seen = new Set();
  const out = [];
  for (const r of arr || []) {
    const name = normalize(r?.name);
    if (!name) continue;
    const key = normLower(name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function pickFirst(list) {
  const arr = asArray(list).filter(Boolean);
  return arr.length ? arr[0] : null;
}

function cleanRecipient(r) {
  if (!r) return null;
  return {
    name: normalize(r.name),
    country: normalize(r.country),
    address: normalize(r.address),
    email: normalize(r.email),
    phone: normalize(r.phone),
    website: normalize(r.website),
    source: normalize(r.source),
  };
}

function isHighSeverity(sevObj) {
  const lvl = normalize(sevObj?.severity_level);
  return lvl === "HIGH" || lvl === "CRITICAL";
}

function safeFallbackCC(jurisdiction) {
  // Absolute last resort CC (should rarely be used because aiAuthorityGraph already enforces)
  const country = normalize(jurisdiction?.country) || "Nigeria";
  if (country.toLowerCase() === "nigeria") {
    return [
      { name: "National Human Rights Commission (NHRC)", country: "Nigeria" },
      { name: "Public Complaints Commission (PCC)", country: "Nigeria" },
    ];
  }
  return [{ name: `Nigerian High Commission / Embassy in ${country}`, country }];
}

/**
 * Convert authority_graph into UI-friendly:
 * - primary: 1 record
 * - through: 0..1 record
 * - cc: 0..N records
 *
 * Policy decisions:
 * - Primary: always first of authority_graph.primary
 * - Through: first of authority_graph.secondary (if exists)
 * - CC: all of authority_graph.oversight_or_cc
 * - If HIGH/CRITICAL and CC empty => force fallback CC
 */
function toRoutingDecision(authorityResult) {
  const jurisdiction = authorityResult?.jurisdiction || {};
  const severity = authorityResult?.severity || {};
  const ag = authorityResult?.authority_graph || {};

  const primary = cleanRecipient(pickFirst(ag.primary));
  const through = cleanRecipient(pickFirst(ag.secondary));

  let cc = uniqByName(asArray(ag.oversight_or_cc).map(cleanRecipient).filter(Boolean));

  // Hard rule: HIGH/CRITICAL must have CC (oversight bodies)
  if (isHighSeverity(severity) && cc.length === 0) {
    cc = uniqByName(safeFallbackCC(jurisdiction).map(cleanRecipient).filter(Boolean));
  }

  // If primary missing (rare), force something sensible
  if (!primary) {
    const country = normalize(jurisdiction?.country) || "Nigeria";
    return {
      primary: cleanRecipient({ name: `Relevant Authority (${country})`, country }),
      through: through || null,
      cc,
      safety_flags: ["PRIMARY_FALLBACK_USED"],
    };
  }

  return {
    primary,
    through: through || null,
    cc,
    safety_flags: [],
  };
}

/**
 * Public function used by server:
 * Takes complaint text and returns:
 * - authority extraction (jurisdiction, entities, severity, confidence)
 * - routing decision (primary, through, cc)
 * - routing summary text (for UI)
 */
async function routeComplaint(complaintText, options = {}) {
  const text = normalize(complaintText);
  if (!text) {
    return {
      ok: false,
      error: "Complaint text is empty.",
    };
  }

  // 1) Build authority graph (AI + guardrails)
  const authorityResult = await getAuthorityGraph(text);

  // 2) Convert to routing decision
  const decision = toRoutingDecision(authorityResult);

  // 3) Build stable UI summary
  const jurisdiction = authorityResult?.jurisdiction || {};
  const severity = authorityResult?.severity || {};
  const entities = authorityResult?.entities_identified || [];
  const confidence = Number(authorityResult?.overall_confidence ?? 0);

  const routingSummary = {
    jurisdiction: {
      country: normalize(jurisdiction.country),
      state_or_region: normalize(jurisdiction.state_or_region),
      city_or_locality: normalize(jurisdiction.city_or_locality),
    },
    severity: {
      severity_level: normalize(severity.severity_level),
      severity_score: severity.severity_score ?? null,
      signals: asArray(severity.signals),
    },
    entities_identified: asArray(entities).map((e) => ({
      type: normalize(e.type),
      name: normalize(e.name),
      locality: normalize(e.locality),
    })),
    decision: {
      primary: decision.primary,
      through: decision.through,
      cc: decision.cc,
    },
    notes: normalize(authorityResult?.routing_notes),
    confidence: Math.max(0, Math.min(1, confidence)),
    safety_flags: decision.safety_flags,
  };

  // 4) Optional: petition writer hook (if you already have it)
  // We do this safely so we don't break your working build.
  let petitionDraft = null;
  if (options?.generate_petition === true) {
    try {
      // If you have a writer module, it will be used.
      // If not, routing still works.
      // Example expected export: generatePetition({ text, routingSummary })
      // Adjust only if your file name differs.
      // eslint-disable-next-line global-require
      const writer = require("./aiPetitionWriter");
      if (writer && typeof writer.generatePetition === "function") {
        petitionDraft = await writer.generatePetition({
          complaint: text,
          routing: routingSummary,
          // Pass user profile if your app uses it (optional)
          user_profile: options?.user_profile || null,
        });
      }
    } catch (e) {
      petitionDraft = null;
      routingSummary.safety_flags = uniqByName(
        (routingSummary.safety_flags || []).concat(["PETITION_WRITER_NOT_AVAILABLE"])
      );
    }
  }

  return {
    ok: true,
    routing: routingSummary,
    petition: petitionDraft,
  };
}

module.exports = {
  routeComplaint,
};

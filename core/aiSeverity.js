/**
 * core/aiSeverity.js
 *
 * Purpose:
 *  - Determine how serious a complaint is
 *  - Guide escalation depth (CCs, oversight, international bodies)
 *  - This file DOES NOT route. It only scores seriousness.
 */

function normalize(text = "") {
  return text.toLowerCase();
}

/**
 * Severity Levels:
 * 0 = LOW        (simple complaints, service delays)
 * 1 = MEDIUM     (financial loss, negligence)
 * 2 = HIGH       (rights violations, police misconduct)
 * 3 = CRITICAL   (detention, violence, torture, foreign national abuse)
 */
function analyzeSeverity(description = "", context = {}) {
  const text = normalize(description);

  let score = 0;
  let triggers = [];

  // ---------------------------------------------------
  // CRITICAL SEVERITY TRIGGERS
  // ---------------------------------------------------
  const criticalKeywords = [
    "detained",
    "detention",
    "assault",
    "beaten",
    "torture",
    "killed",
    "shot",
    "harassment by police",
    "police brutality",
    "armed officers",
    "threatened with gun",
    "foreign national",
    "human rights abuse",
    "unlawful arrest",
    "illegal arrest",
  ];

  if (criticalKeywords.some(k => text.includes(k))) {
    score = 3;
    triggers.push("critical_keywords");
  }

  // ---------------------------------------------------
  // HIGH SEVERITY TRIGGERS
  // ---------------------------------------------------
  const highKeywords = [
    "rights violated",
    "police officer",
    "law enforcement",
    "harassed",
    "extorted",
    "medical negligence",
    "denied treatment",
    "abuse of power",
    "inhumane",
    "illegal action",
  ];

  if (score < 3 && highKeywords.some(k => text.includes(k))) {
    score = 2;
    triggers.push("high_keywords");
  }

  // ---------------------------------------------------
  // MEDIUM SEVERITY TRIGGERS
  // ---------------------------------------------------
  const mediumKeywords = [
    "bank",
    "transfer reversed",
    "financial loss",
    "hospital",
    "doctor absent",
    "poor service",
    "negligence",
    "unfair treatment",
    "fraud",
  ];

  if (score < 2 && mediumKeywords.some(k => text.includes(k))) {
    score = 1;
    triggers.push("medium_keywords");
  }

  // ---------------------------------------------------
  // CONTEXTUAL BOOSTS (VERY IMPORTANT)
  // ---------------------------------------------------

  // Foreign country context
  if (context?.jurisdiction?.country && context.jurisdiction.country !== "Nigeria") {
    if (score >= 2) {
      score = Math.min(3, score + 1);
      triggers.push("foreign_jurisdiction_boost");
    }
  }

  // Police + foreigner = CRITICAL
  if (
    text.includes("police") &&
    (text.includes("foreigner") || text.includes("foreign national"))
  ) {
    score = 3;
    triggers.push("police_foreigner_combo");
  }

  // ---------------------------------------------------
  // FINAL SEVERITY LABEL
  // ---------------------------------------------------
  let level = "LOW";
  if (score === 1) level = "MEDIUM";
  if (score === 2) level = "HIGH";
  if (score === 3) level = "CRITICAL";

  return {
    severity_score: score,
    severity_level: level,
    triggers,
  };
}

module.exports = {
  analyzeSeverity,
};

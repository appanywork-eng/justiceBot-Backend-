function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAny(text, terms) {
  const padded = ` ${normalize(text)} `;
  return terms.some((term) =>
    padded.includes(` ${normalize(term)} `)
  );
}

/**
 * Safety-priority classifier for election-related threats.
 * A match requires election context AND violence/intimidation context;
 * ordinary electoral or administrative complaints therefore do not match.
 */
export function assessElectionViolenceRisk(value = "") {
  const text = normalize(value);

  const electionContext = hasAny(text, [
    "election",
    "elections",
    "vote",
    "voter",
    "voters",
    "voting",
    "ballot",
    "polling unit",
    "political party",
    "candidate",
  ]);

  const violenceOrIntimidation = hasAny(text, [
    "kill",
    "killed",
    "killing",
    "murder",
    "death threat",
    "threat to life",
    "threatened voters",
    "attack voters",
    "election violence",
    "electoral violence",
    "armed supporters",
    "voter intimidation",
    "voter suppression",
    "disenfranchise",
    "disenfranchised",
    "prevent voters",
    "fear of voting",
    "fear of coming out to vote",
  ]);

  const institutionalFailure = hasAny(text, [
    "security institutions failed",
    "security agencies failed",
    "security agencies refused",
    "police failed to act",
    "authorities failed to act",
    "government backing",
    "government support",
    "state acquiescence",
    "officials ignored",
    "no protection",
    "no action was taken",
  ]);

  const widespreadOrOngoing = hasAny(text, [
    "multiple victims",
    "many people killed",
    "persons have been killed",
    "people have been killed",
    "widespread",
    "systematic",
    "ongoing violence",
    "pre election violence",
    "pre-election violence",
    "risk of recurrence",
  ]);

  const internationalAppeal = hasAny(text, [
    "international intervention",
    "international community",
    "united nations",
    "ohchr",
    "special rapporteur",
    "president of the united states",
    "united states president",
    "us president",
    "white house",
  ]);

  const matched = electionContext && violenceOrIntimidation;
  const internationalEscalation = matched && (
    institutionalFailure || widespreadOrOngoing || internationalAppeal
  );

  return {
    matched,
    electionContext,
    violenceOrIntimidation,
    institutionalFailure,
    widespreadOrOngoing,
    internationalAppeal,
    sector: internationalEscalation
      ? "international_escalation"
      : matched
        ? "security_law_enforcement"
        : "",
    reason: internationalEscalation
      ? "election_violence_with_systemic_or_international_escalation_indicators"
      : matched
        ? "election_violence_or_voter_intimidation"
        : "election_violence_compound_test_not_met",
    version: "1.0.0",
  };
}

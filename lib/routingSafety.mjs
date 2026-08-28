const GENERIC_TOKENS = new Set([
  "federal", "state", "local", "government", "nigeria", "nigerian",
  "ministry", "department", "agency", "authority", "board", "bureau",
  "commission", "committee", "council", "office", "service", "services",
  "institution", "organisation", "organization", "corporation", "company",
  "limited", "ltd", "plc", "the", "and", "of", "for", "in", "at",
]);

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value) {
  return normalize(value)
    .split(" ")
    .filter(token => token.length > 1);
}

function distinctiveTokens(value) {
  return tokens(value).filter(token => !GENERIC_TOKENS.has(token));
}

function intersectionSize(left, right) {
  const rightSet = new Set(right);
  return new Set(left.filter(token => rightSet.has(token))).size;
}

function scoreCandidate(query, item) {
  const q = normalize(query);
  if (!q || !item?.norm) return { score: 0, reason: "empty" };

  if (q === item.norm || (item.shortNorm && q === item.shortNorm)) {
    return { score: 100, reason: "exact_name" };
  }

  if (
    item.aliasNorms?.includes(q) ||
    item.shortAliasNorms?.includes(q)
  ) {
    return { score: 98, reason: "exact_alias" };
  }

  const qDistinctive = distinctiveTokens(q);
  const itemDistinctive = distinctiveTokens(item.shortNorm || item.norm);

  // Never infer an institution from a lone geographic or generic fragment.
  if (qDistinctive.length < 2 || itemDistinctive.length < 2) {
    return { score: 0, reason: "insufficient_distinctive_tokens" };
  }

  const overlap = intersectionSize(qDistinctive, itemDistinctive);
  const precision = overlap / qDistinctive.length;
  const recall = overlap / itemDistinctive.length;

  if (overlap < 2 || precision < 0.8 || recall < 0.65) {
    return { score: 0, reason: "weak_token_alignment" };
  }

  return {
    score: Math.round(70 + precision * 15 + recall * 15),
    reason: "strong_distinctive_token_alignment",
  };
}

export function matchInstitutionSafely(name, catalog, {
  minimumScore = 88,
  minimumMargin = 8,
} = {}) {
  const ranked = (Array.isArray(catalog) ? catalog : [])
    .map(item => ({ item, ...scoreCandidate(name, item) }))
    .filter(candidate => candidate.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = ranked[0] || null;
  const runnerUp = ranked[1] || null;
  const margin = best ? best.score - (runnerUp?.score || 0) : 0;
  const accepted = Boolean(
    best &&
    best.score >= minimumScore &&
    margin >= minimumMargin
  );

  return {
    item: accepted ? best.item : null,
    score: accepted ? best.score : 0,
    confidence: accepted ? "high" : best ? "ambiguous" : "none",
    reason: accepted ? best.reason : best?.reason || "no_match",
    margin,
    candidate: best?.item?.name || "",
    runnerUp: runnerUp?.item?.name || "",
  };
}

export function recipientNamesAreDisjoint(toNames = [], ccNames = []) {
  const to = new Set(toNames.map(normalize).filter(Boolean));
  return ccNames.every(name => !to.has(normalize(name)));
}

export function removeRecipientDuplicates(toItems = [], ccItems = []) {
  const toNames = new Set(
    toItems.map(item => normalize(item?.name || item)).filter(Boolean)
  );
  const seen = new Set();

  return (Array.isArray(ccItems) ? ccItems : []).filter(item => {
    const name = normalize(item?.name || item);
    if (!name || toNames.has(name) || seen.has(name)) return false;
    seen.add(name);
    return true;
  });
}

export function institutionNameIsExplicitlySupplied(
  candidate,
  institutionName = "",
  complaint = ""
) {
  const target = normalize(candidate);
  if (!target) return false;

  const supplied = normalize(institutionName);
  const narrative = normalize(complaint);

  if (supplied && (supplied === target || supplied.includes(target) || target.includes(supplied))) {
    return true;
  }

  return target.length >= 5 && ` ${narrative} `.includes(` ${target} `);
}

export function assessRoutingDecisionSafety({
  routingDecision = null,
  complaint = "",
  institutionName = "",
  complexityProfile = {},
  confirmSuggestedRoute = false,
} = {}) {
  if (routingDecision?.matched !== true) {
    return {
      safeToDraft: false,
      confidence: "none",
      code: "routing_clarification_required",
      requiresRecipientConfirmation: false,
      reason: routingDecision?.reason || "no_deterministic_route",
    };
  }

  if (routingDecision.blockGeneration === true) {
    return {
      safeToDraft: false,
      confidence: "blocked",
      code: "routing_process_blocked",
      requiresRecipientConfirmation: false,
      reason: routingDecision.reason || routingDecision.routeKey || "blocked_route",
    };
  }

  const primary = String(routingDecision.primaryInstitution || "").trim();
  if (!primary) {
    return {
      safeToDraft: false,
      confidence: "none",
      code: "routing_primary_recipient_missing",
      requiresRecipientConfirmation: false,
      reason: "primary_recipient_missing",
    };
  }

  const primaryWasSupplied = institutionNameIsExplicitlySupplied(
    primary,
    institutionName,
    complaint
  );

  const providerFirst = String(routingDecision.jurisdiction || "")
    .toLowerCase()
    .includes("provider_first");

  const inferredEscalationRecipient = Boolean(
    institutionName &&
    !primaryWasSupplied &&
    !providerFirst
  );

  if (inferredEscalationRecipient && !confirmSuggestedRoute) {
    return {
      safeToDraft: false,
      confidence: complexityProfile?.critical ? "low" : "medium",
      code: "recipient_confirmation_required",
      requiresRecipientConfirmation: true,
      reason: "primary_recipient_was_inferred",
      suggestedPrimaryInstitution: primary,
    };
  }

  return {
    safeToDraft: true,
    confidence: primaryWasSupplied || providerFirst ? "high" : "confirmed",
    code: "routing_safe",
    requiresRecipientConfirmation: false,
    reason: primaryWasSupplied ? "primary_recipient_supplied" : "route_confirmed",
  };
}

function uniqueNames(values) {
  const seen = new Set();
  return values.filter(value => {
    const key = normalize(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function applyOversightRecipientPolicy({
  routingDecision = null,
  sector = "",
  country = "Nigeria",
  complexityProfile = {},
} = {}) {
  if (routingDecision?.matched !== true) {
    return routingDecision;
  }

  const primary = String(routingDecision.primaryInstitution || "").trim();
  const sectorKey = normalize(sector).replace(/ /g, "_");
  const countryKey = normalize(country || "Nigeria");
  const domestic = !countryKey || countryKey === "nigeria";
  const issueIds = new Set(
    Array.isArray(complexityProfile?.issueIds)
      ? complexityProfile.issueIds
      : []
  );

  const PCC = "Public Complaints Commission (PCC)";
  const NHRC = "National Human Rights Commission (NHRC)";
  const SERVICOM = "SERVICOM";
  const FCCPC = "Federal Competition and Consumer Protection Commission (FCCPC)";
  const AGF = "Attorney-General of the Federation and Minister of Justice";

  let cc = Array.isArray(routingDecision.ccInstitutions)
    ? [...routingDecision.ccInstitutions]
    : [];

  if (domestic && sectorKey === "security") {
    cc = [PCC, NHRC];
  } else if (domestic && sectorKey !== "international_escalation") {
    cc.push(PCC);

    if (issueIds.has("human_rights")) {
      cc.push(NHRC);
    }

    if (issueIds.has("public_service_delivery")) {
      cc.push(SERVICOM);
    }

    if (issueIds.has("consumer_service")) {
      cc.push(FCCPC);
    }
  }

  if (sectorKey === "international_escalation") {
    cc.push(AGF);
  }

  const primaryKey = normalize(primary);
  cc = uniqueNames(cc).filter(name => normalize(name) !== primaryKey);

  return {
    ...routingDecision,
    ccInstitutions: cc,
    oversightPolicyVersion: "1.0.0",
  };
}

export function applyStrictPrimaryRecipientPolicy({
  routingDecision = null,
  institutionName = "",
  complaint = "",
  complexityProfile = {},
} = {}) {
  if (
    routingDecision?.matched !== true ||
    complexityProfile?.critical !== true
  ) {
    return routingDecision;
  }

  const suppliedInstitution = String(
    institutionName || ""
  ).trim();
  const inferredPrimary = String(
    routingDecision.primaryInstitution || ""
  ).trim();

  if (
    !suppliedInstitution ||
    !inferredPrimary ||
    institutionNameIsExplicitlySupplied(
      inferredPrimary,
      institutionName,
      complaint
    )
  ) {
    return routingDecision;
  }

  const originalCc = Array.isArray(
    routingDecision.ccInstitutions
  )
    ? routingDecision.ccInstitutions
    : [];

  const suggestedInstitutions = uniqueNames([
    ...(Array.isArray(routingDecision.suggestedInstitutions)
      ? routingDecision.suggestedInstitutions
      : []),
  ]).filter(
    name => normalize(name) !== normalize(suppliedInstitution)
  );

  const issueIds = new Set(
    Array.isArray(complexityProfile.issueIds)
      ? complexityProfile.issueIds
      : []
  );

  const suggestedMandates = uniqueNames([
    issueIds.has("professional_misconduct")
      ? "The institution's disciplinary authority or a professional regulator, after confirming the accused person's regulated profession"
      : "",
    issueIds.has("healthcare") && issueIds.has("education_administration")
      ? "Nursing, midwifery or health-training oversight, after confirming the programme and regulator's mandate"
      : "",
    issueIds.has("criminal_justice_process") || issueIds.has("fatality_or_serious_harm")
      ? "Relevant investigating, prosecuting or justice-oversight authority, after confirming the current case file and procedural stage"
      : "",
    issueIds.has("human_rights")
      ? "Human-rights oversight, if the supplied facts support a rights violation"
      : "",
    `Relevant ${String(routingDecision.sector || "sector").replace(/_/g, " ")} regulator, only after its mandate over the named institution is confirmed`,
  ]);

  const ccInstitutions = uniqueNames(originalCc).filter(
    name => normalize(name) !== normalize(suppliedInstitution)
  );

  return {
    ...routingDecision,
    jurisdiction: "complex_case_institution_primary",
    routeKey: "complex_case_institution_primary",
    primaryInstitution: suppliedInstitution,
    caseType: "complex_multidimensional_complaint",
    ccInstitutions,
    suggestedInstitutions,
    suggestedMandates,
    rejectedInferredPrimary:
      inferredPrimary,
    deliveryMethod: "official_institution_channel_resolution_required",
    emailRoutingExpected: false,
    contactEmails: [],
    contactPhoneNumbers: [],
    contactAddress: "",
    submissionUrl: "",
    sourceUrls: [],
    documentPurpose:
      "Formal complex-case complaint to the named institution, preserving separate criminal, court, professional or human-rights processes",
    routingNote:
      "The named institution remains the TO recipient. Any regulator inferred from the complaint is presented only as a possible escalation option and is not silently inserted into TO or CC.",
    strictPrimaryPolicyVersion: "1.0.1",
  };
}

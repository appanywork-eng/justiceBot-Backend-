function clean(value, maxLength = 50000) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalize(value) {
  return clean(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function moneyValues(text) {
  const source = clean(text, 20000);
  const values = [];

  const currencyPattern = /(?:₦\s*|\bNGN\s*|\bN(?=\s*\d)\s*)(\d[\d,]*(?:\.\d{1,2})?)/gi;
  for (const match of source.matchAll(currencyPattern)) {
    values.push(match[1].replace(/[^0-9]/g, ""));
  }

  const contextualPattern = /\b(?:amount|loan|deduct(?:ed|ion)?|debit(?:ed)?|charge(?:d)?|refund(?:ed)?|repay(?:ment|aid)?|disburs(?:ed|ement)?)\b[^.\n]{0,50}?\b(\d{4,}(?:\.\d{1,2})?)\b/gi;
  for (const match of source.matchAll(contextualPattern)) {
    values.push(match[1].replace(/[^0-9]/g, ""));
  }

  return unique(values);
}

function petitionContainsMoney(text, digits) {
  const numericValues = (
    clean(text, 50000).match(/\d[\d,]*(?:\.\d{1,2})?/g) || []
  ).map(value => value.replace(/[^0-9]/g, ""));

  return numericValues.includes(digits);
}

function routeHeaderValue(text, label) {
  const lines = String(text || "").split(/\r?\n/);
  const prefix = new RegExp(`^\\s*${label}\\s*:\\s*(.+)$`, "i");
  return normalize(
    lines
      .map(line => line.match(prefix)?.[1] || "")
      .find(Boolean) || ""
  );
}

export function inspectPetitionSemanticQuality({
  petitionText = "",
  complaint = "",
  institutionName = "",
  priorComplaintReference = "",
  primaryInstitution = "",
  ccInstitutions = [],
} = {}) {
  const petition = clean(petitionText, 50000);
  const petitionNormalized = normalize(petition);
  const missingMaterialFacts = [];

  for (const amount of moneyValues(complaint)) {
    if (!petitionContainsMoney(petition, amount)) {
      missingMaterialFacts.push(`amount:${amount}`);
    }
  }

  const suppliedInstitution = normalize(institutionName);
  if (
    suppliedInstitution &&
    !petitionNormalized.includes(suppliedInstitution)
  ) {
    missingMaterialFacts.push("institutionName");
  }

  const reference = clean(priorComplaintReference, 150);
  if (
    reference &&
    !petition.toLowerCase().includes(reference.toLowerCase())
  ) {
    missingMaterialFacts.push("priorComplaintReference");
  }

  const toHeader = routeHeaderValue(petitionText, "TO");
  const ccHeader = routeHeaderValue(petitionText, "CC");
  const primary = normalize(primaryInstitution);

  const routingErrors = [];
  if (primary && toHeader !== primary) {
    routingErrors.push("primary_recipient_header_mismatch");
  }

  if (primary && ccHeader.includes(primary)) {
    routingErrors.push("to_cc_duplicate");
  }

  const expectedCc = (Array.isArray(ccInstitutions) ? ccInstitutions : [])
    .map(normalize)
    .filter(Boolean);

  for (const expected of expectedCc) {
    if (!ccHeader.includes(expected)) {
      routingErrors.push(`missing_cc:${expected}`);
    }
  }

  const allegationSensitive = /\b(?:alleged|allegation|suspected|accused|fraud|misconduct|murder|corruption)\b/i.test(
    complaint
  );
  const allegationFramed = /\b(?:alleged|alleges|allegation|suspected|reported|according to the petitioner|subject to investigation|subject to verification)\b/i.test(
    petition
  );

  if (allegationSensitive && !allegationFramed) {
    routingErrors.push("allegation_not_safely_framed");
  }

  return {
    complete:
      missingMaterialFacts.length === 0 &&
      routingErrors.length === 0,
    missingMaterialFacts,
    routingErrors: unique(routingErrors),
  };
}

export function assertPetitionSemanticQuality(input = {}) {
  const assessment = inspectPetitionSemanticQuality(input);
  if (assessment.complete) return assessment;

  const error = new Error(
    "The generated petition failed the material-fact or recipient safety check."
  );
  error.code = "PETITION_SEMANTIC_QUALITY_FAILED";
  error.status = 502;
  error.retryable = true;
  error.assessment = assessment;
  throw error;
}

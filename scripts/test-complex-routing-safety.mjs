import assert from "node:assert/strict";

import {
  analyzeComplexComplaint,
  formatComplexityForPrompt,
} from "../lib/complexComplaintAnalysis.mjs";
import {
  applyOversightRecipientPolicy,
  applyStrictPrimaryRecipientPolicy,
  assessRoutingDecisionSafety,
  matchInstitutionSafely,
  recipientNamesAreDisjoint,
  removeRecipientDuplicates,
} from "../lib/routingSafety.mjs";

function item(name, aliases = []) {
  const normalize = value => String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    name,
    norm: normalize(name),
    shortNorm: normalize(name),
    aliasNorms: aliases.map(normalize),
    shortAliasNorms: aliases.map(normalize),
  };
}

const catalog = [
  item("Kogi State Electricity Regulatory Commission", ["KERC"]),
  item("National Universities Commission", ["NUC"]),
  item("Public Complaints Commission", ["PCC"]),
];

assert.equal(
  matchInstitutionSafely("Kogi State", catalog).item,
  null,
  "A geographic fragment must never resolve to an institution."
);

assert.equal(
  matchInstitutionSafely("Kogi State Education Commission", catalog).item,
  null,
  "An education phrase must never cross-match to an electricity regulator."
);

assert.equal(
  matchInstitutionSafely("KERC", catalog).item?.name,
  "Kogi State Electricity Regulatory Commission",
  "An approved exact alias must remain routable."
);

const kogiProfile = analyzeComplexComplaint({
  complaint:
    "A nursing student died after alleged lecturer misconduct. The earlier complaint remains unresolved and there are concerns about the prosecution before the High Court.",
  institutionName:
    "Kogi State College of Nursing and Midwifery",
  issueLocation:
    "Anyigba, Kogi State",
  escalationStage:
    "unresolved",
});

assert.equal(kogiProfile.complexity, "critical");
assert.ok(kogiProfile.issueIds.includes("fatality_or_serious_harm"));
assert.ok(kogiProfile.issueIds.includes("criminal_justice_process"));
assert.ok(kogiProfile.issueIds.includes("professional_misconduct"));
assert.ok(kogiProfile.issueIds.includes("education_administration"));
assert.ok(kogiProfile.issueIds.includes("healthcare"));
assert.equal(kogiProfile.activeCourtProcess, true);
assert.match(formatComplexityForPrompt(kogiProfile), /Death or serious harm/);

const inferredRegulator = {
  matched: true,
  sector: "education",
  jurisdiction: "technical_education_regulation",
  primaryInstitution: "National Board for Technical Education",
  routeKey: "nbte_complaint_escalation",
};

const strictKogiPrimary = applyStrictPrimaryRecipientPolicy({
  routingDecision: inferredRegulator,
  institutionName: "Kogi State College of Nursing and Midwifery",
  complaint:
    "A nursing student died after alleged lecturer misconduct and the prosecution remains unresolved.",
  complexityProfile: kogiProfile,
});

assert.equal(
  strictKogiPrimary.primaryInstitution,
  "Kogi State College of Nursing and Midwifery"
);
assert.deepEqual(
  strictKogiPrimary.suggestedInstitutions,
  []
);
assert.ok(
  strictKogiPrimary.suggestedMandates.some(
    value => value.includes("prosecuting or justice-oversight")
  )
);
assert.equal(
  strictKogiPrimary.rejectedInferredPrimary,
  "National Board for Technical Education"
);
assert.equal(
  strictKogiPrimary.emailRoutingExpected,
  false
);
assert.deepEqual(
  strictKogiPrimary.sourceUrls,
  []
);

const unconfirmed = assessRoutingDecisionSafety({
  routingDecision: inferredRegulator,
  complaint: "The complaint against the college remains unresolved.",
  institutionName: "Kogi State College of Nursing and Midwifery",
  complexityProfile: kogiProfile,
});

assert.equal(unconfirmed.safeToDraft, false);
assert.equal(unconfirmed.code, "recipient_confirmation_required");
assert.equal(unconfirmed.requiresRecipientConfirmation, true);

const confirmed = assessRoutingDecisionSafety({
  routingDecision: inferredRegulator,
  complaint: "The complaint against the college remains unresolved.",
  institutionName: "Kogi State College of Nursing and Midwifery",
  complexityProfile: kogiProfile,
  confirmSuggestedRoute: true,
});

assert.equal(confirmed.safeToDraft, true);
assert.equal(confirmed.confidence, "confirmed");

const unmatched = assessRoutingDecisionSafety({
  routingDecision: {
    matched: false,
    reason: "education_institution_required",
  },
  complexityProfile: kogiProfile,
});

assert.equal(unmatched.safeToDraft, false);
assert.equal(unmatched.code, "routing_clarification_required");

const providerRoute = assessRoutingDecisionSafety({
  routingDecision: {
    matched: true,
    jurisdiction: "provider_first",
    primaryInstitution: "VeendHQ",
  },
  complaint:
    "VeendHQ provided a Remita payroll loan and an unexplained deduction occurred.",
  institutionName: "VeendHQ",
});

assert.equal(providerRoute.safeToDraft, true);
assert.equal(providerRoute.confidence, "high");

assert.equal(
  recipientNamesAreDisjoint(["VeendHQ"], ["Remita", "VeendHQ"]),
  false
);

assert.deepEqual(
  removeRecipientDuplicates(
    [{ name: "VeendHQ" }],
    [{ name: "Remita" }, { name: "VeendHQ" }, { name: "Remita" }]
  ).map(value => value.name),
  ["Remita"]
);

const domesticPolicy = applyOversightRecipientPolicy({
  routingDecision: {
    matched: true,
    primaryInstitution: "VeendHQ",
    ccInstitutions: ["Remita"],
  },
  sector: "banking",
  complexityProfile: {
    issueIds: ["financial_transaction"],
  },
});

assert.deepEqual(
  domesticPolicy.ccInstitutions,
  ["Remita", "Public Complaints Commission (PCC)"]
);

const securityPolicy = applyOversightRecipientPolicy({
  routingDecision: {
    matched: true,
    primaryInstitution: "Police Service Commission (PSC)",
    ccInstitutions: ["Nigeria Police Force"],
  },
  sector: "security",
  complexityProfile: {
    issueIds: ["human_rights"],
  },
});

assert.deepEqual(
  securityPolicy.ccInstitutions,
  [
    "Public Complaints Commission (PCC)",
    "National Human Rights Commission (NHRC)",
  ]
);

console.log("✅ GEOGRAPHIC FRAGMENTS CANNOT MATCH INSTITUTIONS");
console.log("✅ CROSS-SECTOR KERC COLLISION IS BLOCKED");
console.log("✅ COMPLEX DEATH, PROSECUTION AND MISCONDUCT DIMENSIONS ARE PRESERVED");
console.log("✅ INFERRED REGULATORS REQUIRE EXPLICIT USER CONFIRMATION");
console.log("✅ UNMATCHED ROUTES CANNOT REACH AI GENERATION");
console.log("✅ TO AND CC RECIPIENTS ARE DISJOINT");
console.log("✅ USER-APPROVED PCC, NHRC AND DOMESTIC OVERSIGHT POLICY IS ENFORCED");
console.log("✅ COMPLEX ROUTING SAFETY CONTRACT PASSED");

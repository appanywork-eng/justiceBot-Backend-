import assert from "node:assert/strict";
import { assessElectionViolenceRisk } from "../lib/electionViolenceEligibility.mjs";
import { resolveJurisdictionRouting } from "../lib/jurisdictionEngine.mjs";

const reportedThreat = [
  "A senator allegedly instructed supporters to kill anybody who votes for the Accord Party",
  "in the coming Osun State election. The threat will cause voter suppression and",
  "disenfranchise voters. Security institutions failed to act, and persons have been",
  "killed in reported pre-election violence.",
].join(" ");

const risk = assessElectionViolenceRisk(reportedThreat);
assert.equal(risk.matched, true);
assert.equal(risk.sector, "international_escalation");

const route = resolveJurisdictionRouting({
  sector: risk.sector,
  complaint: reportedThreat,
  issueLocation: "Osun State, Nigeria",
  institutionName: "A Nigerian Senator",
  country: "Nigeria",
});
assert.equal(route.matched, true);
assert.equal(route.sector, "international_escalation");
assert.equal(route.routeKey, "election_violence_urgent_international_escalation");
assert.equal(route.emailRoutingExpected, true);
assert.deepEqual(route.contactEmails, ["info@nhrc.gov.ng", "iccc@inec.gov.ng"]);
assert.equal(route.submissionUrl, "https://spsubmission.ohchr.org/");
assert.equal(
  route.parallelDomesticSubmissionUrl,
  "https://www.nhrc.gov.ng/index.php/complaint-form"
);
assert.match(route.contactAddress, /Avenue de la Paix/i);
assert.doesNotMatch(route.contactAddress, /O'Neill House|Washington, DC/i);
assert.match(route.routingNote, /recipient-specific/i);
assert.match(route.routingNote, /allegations/i);

const coordinatedPlan = route.coordinatedEscalationPlan;
assert.equal(coordinatedPlan.strategy, "recipient_specific_parallel_submissions");
assert.match(coordinatedPlan.instructions, /submit separately/i);

const coordinatedInstitutions = coordinatedPlan.routes.map(
  item => item.institution
);
for (const expected of [
  "United Nations Special Procedures of the Human Rights Council",
  "National Human Rights Commission (NHRC)",
  "Independent National Electoral Commission (INEC)",
  "African Commission on Human and Peoples' Rights (ACHPR)",
  "Community Court of Justice, ECOWAS",
  "Tom Lantos Human Rights Commission, United States Congress",
  "United Kingdom House of Commons Foreign Affairs Committee",
  "United Kingdom Foreign, Commonwealth and Development Office (FCDO)",
  "European Parliament Subcommittee on Human Rights (DROI)",
  "Delegation of the European Union to Nigeria and ECOWAS",
  "Global Affairs Canada",
  "Embassy of France in Nigeria",
]) {
  assert.ok(coordinatedInstitutions.includes(expected), expected);
}

assert.equal(
  coordinatedPlan.exclusions[0].institution,
  "Nigeria Police Force"
);
assert.match(
  coordinatedPlan.exclusions[0].note,
  /routing decision, not a factual finding/i
);
assert.doesNotMatch(route.routingNote, /report.*police/i);
assert.ok(
  coordinatedPlan.routes.every(
    item => item.submissionUrl?.startsWith("https://")
  )
);

assert.equal(assessElectionViolenceRisk(
  "My voter card collection centre was changed before the election."
).matched, false);
assert.equal(assessElectionViolenceRisk(
  "My phone was stolen and the police station has not replied."
).matched, false);

const localThreat = assessElectionViolenceRisk(
  "Party supporters threatened voters at a polling unit during the election."
);
assert.equal(localThreat.matched, true);
assert.equal(localThreat.sector, "security_law_enforcement");

console.log("✓ ELECTION VIOLENCE SAFETY PRIORITY");
console.log("✓ SYSTEMIC/FAILED-PROTECTION CASE ESCALATES INTERNATIONALLY");
console.log("✓ ORDINARY COMPLAINTS DO NOT FALSE-MATCH");

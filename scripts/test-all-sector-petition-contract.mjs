import assert from "node:assert/strict";

import { analyzeComplexComplaint } from "../lib/complexComplaintAnalysis.mjs";
import { resolveJurisdictionRouting } from "../lib/jurisdictionEngine.mjs";
import {
  inspectPetitionSemanticQuality,
  repairPetitionSemanticFacts,
} from "../lib/petitionSemanticQuality.mjs";
import {
  applyOversightRecipientPolicy,
  assessRoutingDecisionSafety,
} from "../lib/routingSafety.mjs";
import {
  ACTIVE_SECTORS,
  ALL_SECTOR_ROUTING_CASES,
} from "./fixtures/all-sector-routing-cases.mjs";

function routeFor(fixture) {
  const raw = resolveJurisdictionRouting({
    sector: fixture.sector,
    ...fixture.context,
  });
  const complexityProfile = analyzeComplexComplaint(fixture.context);
  return {
    complexityProfile,
    route: applyOversightRecipientPolicy({
      routingDecision: raw,
      sector: fixture.sector,
      country: fixture.context.country,
      complexityProfile,
    }),
  };
}

function renderPetition(fixture, route) {
  assert.notEqual(route.blockGeneration, true, `${fixture.name}: blocked route rendered`);
  const cc = route.ccInstitutions.length
    ? route.ccInstitutions.map((name) => `CC: ${name}`).join("\n")
    : "CC: None";
  const reference = fixture.context.priorComplaintReference
    ? `Prior complaint reference: ${fixture.context.priorComplaintReference}.`
    : "";

  return [
    `TO: ${route.primaryInstitution}`,
    cc,
    `SUBJECT: ${route.documentPurpose}`,
    "INTRODUCTION:",
    `The petitioner requests action from ${route.primaryInstitution}.`,
    "FACTS / BACKGROUND:",
    `The petitioner identifies ${fixture.context.institutionName || route.primaryInstitution} and alleges: ${fixture.context.complaint}`,
    reference,
    "ISSUES FOR DETERMINATION:",
    `Whether the complaint falls within the stated ${fixture.sector} route and should be resolved on verified evidence.`,
    "LEGAL FRAMEWORK & GROUNDS:",
    "All disputed allegations remain subject to investigation and verification by the competent authority.",
    "DEMANDS / RELIEFS SOUGHT:",
    "Investigate the complaint, preserve the records, correct any verified error and provide a reasoned written response.",
    "NOTICE & ESCALATION:",
    "The petitioner reserves the right to use the next lawful review channel if the complaint remains unresolved.",
    "LIST OF ATTACHMENTS (if any):",
    "Supporting records expressly identified by the petitioner.",
    "Yours faithfully,",
    "Test Petitioner",
  ].filter(Boolean).join("\n");
}

const representativeCases = ACTIVE_SECTORS.map((sector) => {
  const fixture = ALL_SECTOR_ROUTING_CASES.find(
    (candidate) => candidate.sector === sector && candidate.expectedMatched && !candidate.blocked
  );
  assert.ok(fixture, `${sector}: missing petitionable representative fixture`);
  return fixture;
});

for (const fixture of representativeCases) {
  const { route } = routeFor(fixture);
  assert.equal(route.matched, true, fixture.name);

  if (
    fixture.context.country === "Nigeria" &&
    fixture.sector !== "international_escalation" &&
    route.primaryInstitution !== "Public Complaints Commission (PCC)"
  ) {
    assert.ok(
      route.ccInstitutions.includes("Public Complaints Commission (PCC)"),
      `${fixture.name}: PCC administrative oversight missing`
    );
  }

  const petitionText = renderPetition(fixture, route);
  const quality = inspectPetitionSemanticQuality({
    petitionText,
    complaint: fixture.context.complaint,
    institutionName: fixture.context.institutionName,
    priorComplaintReference: fixture.context.priorComplaintReference,
    primaryInstitution: route.primaryInstitution,
    ccInstitutions: route.ccInstitutions,
    documentPurpose: route.documentPurpose,
    sector: fixture.sector,
  });

  assert.deepEqual(quality, {
    complete: true,
    missingMaterialFacts: [],
    routingErrors: [],
  }, fixture.name);

  /*
   * Simulate realistic Gemini prose across every production
   * sector instead of requiring the model to repeat the
   * deterministic internal purpose verbatim.
   */
  const naturalSubject =
    "Concerns arising from " +
    (
      fixture.context.institutionName ||
      fixture.sector.replace(
        /_/g,
        " "
      )
    );

  const naturalPetitionText =
    petitionText
      .replace(
        /^SUBJECT:.*$/m,
        "SUBJECT: " +
          naturalSubject
      )
      .replace(
        "Investigate the complaint, preserve the records, correct any verified error and provide a reasoned written response.",
        "Rectify any verified error, explain the outcome in writing, and compensate or restore the petitioner where the verified evidence supports it."
      );

  const naturalRepair =
    repairPetitionSemanticFacts({
      petitionText:
        naturalPetitionText,

      complaint:
        fixture.context.complaint,

      institutionName:
        fixture.context.institutionName,

      priorComplaintReference:
        fixture.context.priorComplaintReference,

      primaryInstitution:
        route.primaryInstitution,

      ccInstitutions:
        route.ccInstitutions,

      documentPurpose:
        route.documentPurpose,

      sector:
        fixture.sector,
    });

  assert.equal(
    naturalRepair
      .assessment
      .complete,
    true,
    fixture.name +
      ": natural Gemini-style wording must survive the final quality gate"
  );
}

const securityRights = ALL_SECTOR_ROUTING_CASES.find(
  (fixture) => fixture.name === "security authority / NHRC"
);
const securityRoute = routeFor(securityRights).route;
assert.deepEqual(
  securityRoute.ccInstitutions,
  ["Public Complaints Commission (PCC)"],
  "NHRC must not be duplicated in CC when it is the primary security recipient"
);

const policeCommandFixture = ALL_SECTOR_ROUTING_CASES.find(
  (fixture) => fixture.name === "security authority / police command"
);
assert.deepEqual(
  routeFor(policeCommandFixture).route.ccInstitutions,
  ["Public Complaints Commission (PCC)", "National Human Rights Commission (NHRC)"],
  "ordinary security petitions must use the approved PCC + NHRC oversight pair only"
);

for (const name of [
  "general / ordinary administrative failure",
  "general / consumer oversight",
  "general / rights oversight",
]) {
  const fixture = ALL_SECTOR_ROUTING_CASES.find((candidate) => candidate.name === name);
  const route = routeFor(fixture).route;
  const expected = name.includes("consumer")
    ? "Federal Competition and Consumer Protection Commission (FCCPC)"
    : name.includes("rights")
      ? "National Human Rights Commission (NHRC)"
      : "SERVICOM";
  assert.ok(route.ccInstitutions.includes(expected), `${name}: ${expected} missing`);
}

const bankingFixture = representativeCases.find((fixture) => fixture.sector === "banking");
const bankingRoute = routeFor(bankingFixture).route;
const bankingDraft = renderPetition(bankingFixture, bankingRoute);

const unauthorizedCc = bankingDraft.replace(
  "SUBJECT:",
  "CC: Nigerian Air Force (NAF)\nSUBJECT:"
);
assert.ok(
  inspectPetitionSemanticQuality({
    petitionText: unauthorizedCc,
    complaint: bankingFixture.context.complaint,
    institutionName: bankingFixture.context.institutionName,
    primaryInstitution: bankingRoute.primaryInstitution,
    ccInstitutions: bankingRoute.ccInstitutions,
    documentPurpose: bankingRoute.documentPurpose,
    sector: bankingFixture.sector,
  }).routingErrors.includes("unexpected_cc:nigerian air force naf"),
  "an unrelated or unauthorized recipient must be rejected"
);

const unrelatedSubject = bankingDraft.replace(
  /^SUBJECT:.*$/m,
  "SUBJECT: Aviation baggage handling complaint"
);
assert.ok(
  inspectPetitionSemanticQuality({
    petitionText: unrelatedSubject,
    complaint: bankingFixture.context.complaint,
    institutionName: bankingFixture.context.institutionName,
    primaryInstitution: bankingRoute.primaryInstitution,
    ccInstitutions: bankingRoute.ccInstitutions,
    documentPurpose: bankingRoute.documentPurpose,
    sector: bankingFixture.sector,
  }).routingErrors.includes("subject_purpose_mismatch"),
  "unrelated sector content must fail the route-purpose contract"
);

for (const fixture of ALL_SECTOR_ROUTING_CASES.filter((candidate) => candidate.blocked)) {
  const { route, complexityProfile } = routeFor(fixture);
  const safety = assessRoutingDecisionSafety({
    routingDecision: route,
    complaint: fixture.context.complaint,
    institutionName: fixture.context.institutionName,
    complexityProfile,
  });
  assert.equal(safety.safeToDraft, false, fixture.name);
  assert.equal(safety.code, "routing_process_blocked", fixture.name);
}

console.log("✅ ALL 16 SECTORS ENFORCE ONE TO AND APPROVED OVERSIGHT RECIPIENTS");
console.log("✅ ROUTE PURPOSE, ACTIONABLE REMEDY AND ALLEGATION-SAFE WORDING ARE ENFORCED");
console.log("✅ UNAUTHORIZED RECIPIENTS AND UNRELATED SECTOR CONTENT ARE REJECTED");
console.log("✅ EMERGENCY AND NON-PETITION ROUTES CANNOT GENERATE A PETITION");
console.log("✅ NATURAL GEMINI-STYLE WORDING SURVIVES THE QUALITY GATE ACROSS ALL 16 SECTORS");
console.log("✅ ALL-SECTOR PETITION CONTRACT PASSED");

import assert from "node:assert/strict";

import { assessElectionViolenceRisk } from "../lib/electionViolenceEligibility.mjs";
import { resolveJurisdictionRouting } from "../lib/jurisdictionEngine.mjs";
import {
  ACTIVE_SECTORS,
  ALL_SECTOR_ROUTING_CASES,
} from "./fixtures/all-sector-routing-cases.mjs";

const failures = [];
const coverage = new Map(ACTIVE_SECTORS.map((sector) => [sector, 0]));

function compare(name, field, actual, expected) {
  try {
    assert.deepEqual(actual, expected);
  } catch {
    failures.push(`${name}: ${field} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

for (const fixture of ALL_SECTOR_ROUTING_CASES) {
  coverage.set(fixture.sector, (coverage.get(fixture.sector) || 0) + 1);

  if (fixture.electionPriority) {
    const priority = assessElectionViolenceRisk(fixture.context.complaint);
    compare(fixture.name, "election priority matched", priority.matched, true);
    compare(fixture.name, "election priority sector", priority.sector, fixture.sector);
  }

  const actual = resolveJurisdictionRouting({
    sector: fixture.sector,
    ...fixture.context,
  });

  compare(fixture.name, "matched", actual.matched, fixture.expectedMatched);
  compare(fixture.name, "sector", actual.sector, fixture.sector);
  compare(fixture.name, "route", actual.routeKey || "", fixture.expectedRouteKey);
  compare(fixture.name, "primary", actual.primaryInstitution || "", fixture.expectedPrimary);
  compare(fixture.name, "cc", actual.ccInstitutions || [], fixture.expectedCc);
  compare(fixture.name, "delivery", actual.deliveryMethod || "", fixture.expectedDelivery);
  compare(fixture.name, "blocked", actual.blockGeneration === true, fixture.blocked);

  if (fixture.expectedReason) {
    compare(fixture.name, "reason", actual.reason || "", fixture.expectedReason);
  }

  if (fixture.expectedSuggestedSector) {
    compare(
      fixture.name,
      "suggested sector",
      actual.suggestedSector || "",
      fixture.expectedSuggestedSector
    );
  }
}

for (const [sector, count] of coverage) {
  compare(`${sector} coverage`, "case count", count >= 3, true);
}

const securityAuthorities = new Set(
  ALL_SECTOR_ROUTING_CASES
    .map((fixture) => fixture.securityAuthority)
    .filter(Boolean)
);
compare("security authority coverage", "authority count", securityAuthorities.size, 9);

if (failures.length > 0) {
  throw new assert.AssertionError({
    message: `All-sector routing contract found ${failures.length} mismatch(es):\n${failures.join("\n")}`,
    actual: failures.length,
    expected: 0,
    operator: "strictEqual",
  });
}

console.log(`✅ ${ALL_SECTOR_ROUTING_CASES.length} ROUTING CASES COVER ALL 16 SECTORS`);
console.log("✅ INITIAL, ESCALATION, AMBIGUOUS AND CROSS-SECTOR TRAPS ARE ENFORCED");
console.log("✅ ALL NINE SECURITY AUTHORITIES HAVE EXPLICIT ROUTING FIXTURES");
console.log("✅ ALL-SECTOR ROUTING CONTRACT PASSED");

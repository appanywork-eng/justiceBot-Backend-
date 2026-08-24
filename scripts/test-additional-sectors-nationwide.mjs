import assert from "node:assert/strict";
import { resolveJurisdictionRouting } from "../lib/jurisdictionEngine.mjs";
import { detectInstitutionSector } from "../lib/institutionSectorPriority.mjs";

const pencom = resolveJurisdictionRouting({
  sector: "pensions",
  institutionName: "Example Pension Fund Administrator",
  complaint: "My employer deducted pension contributions but they were not remitted to my retirement savings account.",
});
assert.equal(pencom.matched, true);
assert.equal(pencom.routeKey, "pencom_pension_complaints");
assert.deepEqual(pencom.contactEmails, ["complaints@pencom.gov.ng"]);

const ptad = resolveJurisdictionRouting({
  sector: "pensions",
  institutionName: "PTAD",
  complaint: "My federal defined benefit pension has not been paid after verification.",
});
assert.equal(ptad.routeKey, "ptad_defined_benefit_complaints");
assert.deepEqual(ptad.contactEmails, ["complaints@ptad.gov.ng"]);

const naicom = resolveJurisdictionRouting({
  sector: "insurance",
  institutionName: "Example Insurance Company",
  complaint: "The insurer has refused to settle my valid motor insurance claim.",
});
assert.equal(naicom.matched, true);
assert.equal(naicom.routeKey, "naicom_insurance_complaints");
assert.deepEqual(naicom.contactEmails, ["info@naicom.gov.ng"]);

const healthInsurance = resolveJurisdictionRouting({
  sector: "insurance",
  institutionName: "Example HMO",
  complaint: "My HMO refused health insurance authorisation for hospital treatment.",
});
assert.equal(healthInsurance.matched, false);
assert.equal(healthInsurance.reason, "health_insurance_belongs_to_health_sector");

const fctPlanning = resolveJurisdictionRouting({
  sector: "urban_planning",
  institutionName: "Abuja Development Control",
  issueLocation: "Kubwa, Abuja",
  complaint: "An illegal structure blocks the approved access road.",
});
assert.equal(fctPlanning.routeKey, "fct_development_control");
assert.equal(fctPlanning.emailRoutingExpected, false);
assert.ok(fctPlanning.submissionUrl.startsWith("https://"));

const lagosPlanning = resolveJurisdictionRouting({
  sector: "urban_planning",
  institutionName: "LASBCA",
  issueLocation: "Ikeja, Lagos",
  complaint: "A distressed building presents a collapse risk.",
});
assert.equal(lagosPlanning.routeKey, "lagos_building_control");
assert.deepEqual(lagosPlanning.contactEmails, ["lasbca@lagosstate.gov.ng"]);

assert.equal(detectInstitutionSector("National Pension Commission").sector, "pensions");
assert.equal(detectInstitutionSector("National Insurance Commission").sector, "insurance");
assert.equal(detectInstitutionSector("Abuja Development Control").sector, "urban_planning");

console.log("✅ PENSION COMPLAINTS ROUTE TO PENCOM OR PTAD");
console.log("✅ GENERAL INSURANCE COMPLAINTS ROUTE TO NAICOM");
console.log("✅ NHIA/HMO MATTERS REMAIN IN THE HEALTH SECTOR");
console.log("✅ FCT AND LAGOS DEVELOPMENT-CONTROL ROUTES ARE VERIFIED");
console.log("✅ NEW-SECTOR INSTITUTION PRIORITY IS ACTIVE");

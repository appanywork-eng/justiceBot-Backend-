const VERIFIED_ON = "2026-08-06";

function authority({ key, name, aliases = [], emails = [], address = "", website = "", submissionUrl = "", phones = [], sourceUrls = [] }) {
  return Object.freeze({
    key,
    name,
    aliases: Object.freeze([...new Set([name, ...aliases])]),
    contact: {
      emails: Object.freeze(emails),
      address,
      website,
      submission_url: submissionUrl,
      phone_numbers: Object.freeze(phones),
    },
    verification: {
      status: "VERIFIED_OFFICIAL_SOURCE",
      verified_on: VERIFIED_ON,
      scope: "identity_and_official_complaint_channel",
      direct_email_verified: emails.length > 0,
      source_urls: Object.freeze(sourceUrls),
    },
  });
}

export const PENCOM_COMPLAINTS = authority({
  key: "pencom_pension_complaints",
  name: "National Pension Commission (PenCom)",
  aliases: ["PenCom", "National Pension Commission"],
  emails: ["complaints@pencom.gov.ng"],
  address: "174 Adetokunbo Ademola Crescent, Wuse 2, Abuja, Nigeria",
  website: "https://www.pencom.gov.ng/",
  submissionUrl: "https://www.pencom.gov.ng/home-page-test/home-page/contact-us/",
  phones: ["02094603955"],
  sourceUrls: ["https://www.pencom.gov.ng/home-page-test/home-page/contact-us/"],
});

export const PTAD_COMPLAINTS = authority({
  key: "ptad_defined_benefit_complaints",
  name: "Pension Transitional Arrangement Directorate (PTAD)",
  aliases: ["PTAD", "Pension Transitional Arrangement Directorate"],
  emails: ["complaints@ptad.gov.ng"],
  address: "22 Katsina Ala Crescent, Off Yedseram Street, Maitama, Abuja, Nigeria",
  website: "https://www.ptad.gov.ng/",
  phones: ["080022557823", "+23494621700"],
  sourceUrls: ["https://www.pencom.gov.ng/pension-transitional-arrangement-directorate/"],
});

export const NAICOM_COMPLAINTS = authority({
  key: "naicom_insurance_complaints",
  name: "National Insurance Commission (NAICOM)",
  aliases: ["NAICOM", "National Insurance Commission"],
  emails: ["info@naicom.gov.ng"],
  address: "Plot 1239, Ladoke Akintola Boulevard, Garki II, Abuja, Nigeria",
  website: "https://www.naicom.gov.ng/",
  submissionUrl: "https://complaints.naicom.gov.ng/",
  phones: ["092915101"],
  sourceUrls: [
    "https://complaints.naicom.gov.ng/",
    "https://portal.naicom.gov.ng/Public/Public_Consumers.aspx",
  ],
});

export const FCT_DEVELOPMENT_CONTROL = authority({
  key: "fct_development_control",
  name: "Department of Development Control, Abuja Metropolitan Management Council (AMMC)",
  aliases: [
    "Abuja Development Control",
    "FCT Development Control",
    "Department of Development Control",
    "AMMC Development Control",
  ],
  address: "Federal Capital Territory, Abuja, Nigeria",
  website: "https://dodc.fcta.gov.ng/",
  submissionUrl: "https://dodc.fcta.gov.ng/",
  sourceUrls: ["https://dodc.fcta.gov.ng/", "https://fcta.gov.ng/"],
});

export const LASBCA_COMPLAINTS = authority({
  key: "lagos_building_control",
  name: "Lagos State Building Control Agency (LASBCA)",
  aliases: ["LASBCA", "Lagos State Building Control Agency", "Lagos Building Control"],
  emails: ["lasbca@lagosstate.gov.ng"],
  address: "Oba Akinjobi Way, Old Secretariat, GRA, Ikeja, Lagos, Nigeria",
  website: "https://lasbca.lagosstate.gov.ng/",
  submissionUrl: "https://lasbca.lagosstate.gov.ng/contact/",
  phones: ["07005050404", "07000527222"],
  sourceUrls: ["https://lasbca.lagosstate.gov.ng/contact/", "https://lasbca.lagosstate.gov.ng/faq/"],
});

export const NIGERIAN_PENSION_AUTHORITIES = Object.freeze([PENCOM_COMPLAINTS, PTAD_COMPLAINTS]);
export const NIGERIAN_INSURANCE_AUTHORITIES = Object.freeze([NAICOM_COMPLAINTS]);
export const NIGERIAN_URBAN_PLANNING_AUTHORITIES = Object.freeze([FCT_DEVELOPMENT_CONTROL, LASBCA_COMPLAINTS]);

export const NIGERIAN_PENSION_DETECTION_KEYWORDS = Object.freeze([
  "pension", "pensions", "pension fund administrator", "pfa", "pencom", "ptad",
  "retirement savings account", "rsa", "retirement benefit", "pension deduction",
  "pension contribution", "unremitted pension", "non remittance of pension",
  "annuity", "programmed withdrawal", "accrued rights", "pension verification",
]);

export const NIGERIAN_INSURANCE_DETECTION_KEYWORDS = Object.freeze([
  "national insurance commission", "insurance claim", "insurer", "insurance company", "insurance policy", "policyholder",
  "premium", "underwriter", "naicom", "motor insurance", "life insurance",
  "property insurance", "travel insurance", "marine insurance", "claim repudiation",
  "claim settlement", "unpaid insurance claim", "insurance broker", "loss adjuster",
]);

export const NIGERIAN_URBAN_PLANNING_DETECTION_KEYWORDS = Object.freeze([
  "development control", "building control", "building approval", "building permit",
  "development permit", "planning permission", "illegal structure", "illegal building",
  "unauthorised structure", "unauthorized structure", "demolition notice", "building demolition",
  "distressed building", "building collapse risk", "land use violation", "change of use",
  "urban planning", "physical planning", "lasbca", "laspppa", "ammc",
]);

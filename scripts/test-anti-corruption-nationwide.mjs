import assert from "node:assert/strict";

import {
  EFCC_FINANCIAL_CRIME_REPORTING,
  ICPC_CORRUPTION_PETITIONS,
  CCB_CODE_OF_CONDUCT_PETITIONS,
  BPP_PROCUREMENT_PETITIONS,
  NIGERIAN_ANTI_CORRUPTION_AUTHORITIES,
  NIGERIAN_ANTI_CORRUPTION_DETECTION_KEYWORDS,
} from "../lib/nigeriaAntiCorruptionRegistry.mjs";

import {
  assessInstitutionContactVerification,
} from "../lib/nationalSectorPolicy.mjs";

import {
  resolveAntiCorruptionRouting,
} from "../lib/finalSectorJurisdiction.mjs";

assert.equal(
  NIGERIAN_ANTI_CORRUPTION_AUTHORITIES.length,
  4
);

assert.equal(
  new Set(
    NIGERIAN_ANTI_CORRUPTION_AUTHORITIES.map(
      authority => authority.key
    )
  ).size,
  4
);

for (
  const authority
  of NIGERIAN_ANTI_CORRUPTION_AUTHORITIES
) {
  const decision =
    assessInstitutionContactVerification({
      institution: authority,

      sectorData: {
        verification_policy: {
          official_sources_only: true,
        },
      },
    });

  assert.equal(
    decision.directContactAllowed,
    true,
    authority.key
  );

  assert.ok(
    authority.contact.emails.length > 0,
    authority.key
  );

  assert.ok(
    authority.verification.source_urls.length > 0,
    authority.key
  );
}

console.log(
  "✅ FOUR VERIFIED NATIONAL ANTI-CORRUPTION AUTHORITIES ARE REGISTERED"
);

const cases = [
  {
    name: "EFCC FINANCIAL CRIME",

    context: {
      institutionName:
        "Example Federal Agency",

      complaint:
        "Public funds were diverted through suspicious transfers and money laundering.",
    },

    route:
      "efcc_economic_financial_crime",

    primary:
      EFCC_FINANCIAL_CRIME_REPORTING.name,
  },

  {
    name: "ICPC PUBLIC CORRUPTION",

    context: {
      institutionName:
        "Example Government Ministry",

      complaint:
        "A public officer demanded a bribe and abused the office.",
    },

    route:
      "icpc_corrupt_practices_petition",

    primary:
      ICPC_CORRUPTION_PETITIONS.name,
  },

  {
    name: "CCB CONDUCT BREACH",

    context: {
      institutionName:
        "Example Public Office",

      complaint:
        "A public officer allegedly made a false asset declaration and has an undeclared conflict of interest.",
    },

    route:
      "ccb_code_of_conduct_petition",

    primary:
      CCB_CODE_OF_CONDUCT_PETITIONS.name,
  },

  {
    name: "BPP PROCUREMENT",

    context: {
      institutionName:
        "Example Procuring Entity",

      complaint:
        "The tender involved contract splitting, bid rigging and procurement irregularity.",
    },

    route:
      "bpp_procurement_petition",

    primary:
      BPP_PROCUREMENT_PETITIONS.name,
  },
];

for (const test of cases) {
  const result =
    resolveAntiCorruptionRouting(
      test.context
    );

  assert.equal(
    result.matched,
    true,
    test.name
  );

  assert.equal(
    result.routeKey,
    test.route,
    test.name
  );

  assert.equal(
    result.primaryInstitution,
    test.primary,
    test.name
  );

  assert.ok(
    Array.isArray(
      result.sourceUrls
    ),
    test.name
  );

  assert.ok(
    result.sourceUrls.length > 0,
    test.name
  );

  console.log(
    `✅ ${test.name} ROUTES CORRECTLY`
  );
}

const combinedFinancialProcurement =
  resolveAntiCorruptionRouting({
    institutionName:
      "Example Federal Agency",

    complaint:
      "Public funds were diverted through an inflated procurement contract and double payment.",
  });

assert.equal(
  combinedFinancialProcurement.routeKey,
  "efcc_economic_financial_crime"
);

assert.ok(
  combinedFinancialProcurement
    .ccInstitutions
    .includes(
      BPP_PROCUREMENT_PETITIONS.name
    )
);

console.log(
  "✅ FINANCIAL CRIME REMAINS PRIMARY WHILE BPP IS INCLUDED ONLY WHEN RELEVANT"
);

const developmentControlBribery =
  resolveAntiCorruptionRouting({
    institutionName:
      "Abuja Development Control Department",

    complaint:
      "Officers allegedly collected bribes to allow illegal structures to remain.",
  });

assert.equal(
  developmentControlBribery.routeKey,
  "icpc_corrupt_practices_petition"
);

assert.equal(
  developmentControlBribery.primaryInstitution,
  ICPC_CORRUPTION_PETITIONS.name
);

console.log(
  "✅ COLLECTED-BRIBES WORDING ROUTES TO ICPC"
);

const emergency =
  resolveAntiCorruptionRouting({
    complaint:
      "I am currently under attack after reporting corruption and my life is in immediate danger.",
  });

assert.equal(
  emergency.routeKey,
  "whistleblower_immediate_danger"
);

assert.equal(
  emergency.blockGeneration,
  true
);

assert.equal(
  emergency.emailRoutingExpected,
  false
);

console.log(
  "✅ IMMEDIATE WHISTLEBLOWER DANGER BLOCKS ORDINARY PETITION GENERATION"
);

for (const keyword of [
  "corruption",
  "bribery",
  "money laundering",
  "diversion of public funds",
  "procurement fraud",
  "asset declaration",
  "EFCC",
  "ICPC",
  "CCB",
  "BPP",
]) {
  assert.ok(
    NIGERIAN_ANTI_CORRUPTION_DETECTION_KEYWORDS.includes(
      keyword
    ),
    keyword
  );
}

for (const wrongKeyword of [
  "hospital",
  "airline ticket",
  "electricity token",
  "school transcript",
]) {
  assert.equal(
    NIGERIAN_ANTI_CORRUPTION_DETECTION_KEYWORDS.includes(
      wrongKeyword
    ),
    false,
    wrongKeyword
  );
}

console.log(
  "✅ NATIONAL ANTI-CORRUPTION DETECTION KEYWORDS ARE CLEAN"
);

console.log(
  "✅ ANTI-CORRUPTION IS NOW PROTECTED BY NATIONAL REGRESSION TESTS"
);

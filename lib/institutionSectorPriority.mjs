import {
  NIGERIAN_BANKING_DETECTION_KEYWORDS,
} from "./nigeriaBankingRegistry.mjs";

import {
  NIGERIAN_POWER_DETECTION_KEYWORDS,
} from "./nigeriaPowerRegistry.mjs";

import {
  NIGERIAN_TELECOM_DETECTION_KEYWORDS,
} from "./nigeriaTelecomRegistry.mjs";

import {
  NIGERIAN_AVIATION_DETECTION_KEYWORDS,
} from "./nigeriaAviationRegistry.mjs";

import {
  NIGERIAN_HEALTH_DETECTION_KEYWORDS,
} from "./nigeriaHealthRegistry.mjs";

import {
  NIGERIAN_EDUCATION_DETECTION_KEYWORDS,
} from "./nigeriaEducationRegistry.mjs";

import {
  NIGERIAN_SECURITY_DETECTION_KEYWORDS,
} from "./nigeriaSecurityRegistry.mjs";

import {
  NIGERIAN_JUDICIARY_DETECTION_KEYWORDS,
} from "./nigeriaJudiciaryRegistry.mjs";

import {
  NIGERIAN_ANTI_CORRUPTION_DETECTION_KEYWORDS,
} from "./nigeriaAntiCorruptionRegistry.mjs";

import {
  NIGERIAN_DIASPORA_DETECTION_KEYWORDS,
} from "./nigeriaDiasporaRegistry.mjs";

import {
  NIGERIAN_INTERNATIONAL_ESCALATION_DETECTION_KEYWORDS,
} from "./nigeriaInternationalEscalationRegistry.mjs";

export const
  INSTITUTION_SECTOR_PRIORITY_VERSION =
    "1.0.0";

const SECTOR_KEYWORDS =
  Object.freeze([
    [
      "banking",
      NIGERIAN_BANKING_DETECTION_KEYWORDS,
    ],
    [
      "power",
      NIGERIAN_POWER_DETECTION_KEYWORDS,
    ],
    [
      "telecoms",
      NIGERIAN_TELECOM_DETECTION_KEYWORDS,
    ],
    [
      "aviation",
      NIGERIAN_AVIATION_DETECTION_KEYWORDS,
    ],
    [
      "health",
      NIGERIAN_HEALTH_DETECTION_KEYWORDS,
    ],
    [
      "education",
      NIGERIAN_EDUCATION_DETECTION_KEYWORDS,
    ],
    [
      "security",
      NIGERIAN_SECURITY_DETECTION_KEYWORDS,
    ],
    [
      "judiciary",
      NIGERIAN_JUDICIARY_DETECTION_KEYWORDS,
    ],
    [
      "anti_corruption",
      NIGERIAN_ANTI_CORRUPTION_DETECTION_KEYWORDS,
    ],
    [
      "diaspora_report",
      NIGERIAN_DIASPORA_DETECTION_KEYWORDS,
    ],
    [
      "international_escalation",
      NIGERIAN_INTERNATIONAL_ESCALATION_DETECTION_KEYWORDS,
    ],
  ]);

function normalize(
  value
) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function keywordMatches(
  source,
  target
) {
  if (!source || !target) {
    return false;
  }

  if (source === target) {
    return true;
  }

  if (
    target.length <= 4 &&
    !target.includes(" ")
  ) {
    return source
      .split(" ")
      .includes(target);
  }

  return (
    ` ${source} `
      .includes(
        ` ${target} `
      )
  );
}

export function detectInstitutionSector(
  institutionName = ""
) {
  const source =
    normalize(
      institutionName
    );

  if (!source) {
    return {
      matched: false,
      sector: "",
      score: 0,
      evidence: [],
      version:
        INSTITUTION_SECTOR_PRIORITY_VERSION,
    };
  }

  const candidates = [];

  for (
    const [
      sector,
      keywords,
    ]
    of SECTOR_KEYWORDS
  ) {
    let score = 0;
    const evidence = [];

    for (
      const rawKeyword
      of keywords || []
    ) {
      const keyword =
        normalize(
          rawKeyword
        );

      if (
        !keyword ||
        !keywordMatches(
          source,
          keyword
        )
      ) {
        continue;
      }

      const weight =
        source === keyword
          ? 1000
          : keyword.includes(" ")
            ? 100 +
              keyword.length
            : keyword.length <= 4
              ? 50
              : 75;

      score += weight;

      if (
        evidence.length < 5
      ) {
        evidence.push(
          keyword
        );
      }
    }

    if (score > 0) {
      candidates.push({
        sector,
        score,
        evidence,
      });
    }
  }

  candidates.sort(
    (
      first,
      second
    ) =>
      second.score -
      first.score
  );

  const best =
    candidates[0];

  if (!best) {
    return {
      matched: false,
      sector: "",
      score: 0,
      evidence: [],
      version:
        INSTITUTION_SECTOR_PRIORITY_VERSION,
    };
  }

  return {
    matched: true,
    sector:
      best.sector,
    score:
      best.score,
    evidence:
      best.evidence,
    version:
      INSTITUTION_SECTOR_PRIORITY_VERSION,
  };
}

/*
 * PetitionDesk legal-draft safety layer.
 *
 * This module does not determine whether a complaint is true.
 * It removes or softens legal claims that should not be stated
 * as established law without verified supporting material.
 */

function replaceUnsafePenaltyLanguage(text) {
  return String(text || "")
    .replace(
      /\bmandatory sanction or penalty\b/gi,
      "appropriate regulatory action, including any sanction the regulator considers lawful and justified"
    )
    .replace(
      /\bmandatory sanctions or penalties\b/gi,
      "appropriate regulatory action, including any sanctions the regulator considers lawful and justified"
    )
    .replace(
      /\bmandatory sanction\b/gi,
      "appropriate regulatory action"
    )
    .replace(
      /\bmandatory penalty\b/gi,
      "appropriate regulatory action"
    )
    .replace(
      /\bfiduciary duty\b/gi,
      "applicable regulatory or contractual obligations"
    );
}

function containsUnsupportedBankingRate(text) {
  const value =
    String(text || "");

  const monetaryRate =
    /(?:₦|NGN)\s*[\d,]+(?:\.\d+)?/i;

  const perTransactionRate =
    /\bper\s+(?:sms|alert|transaction|transfer|withdrawal|message)\b/i;

  const assertedFixedRule =
    /\b(?:typically|fixed|maximum|minimum|mandatory|statutory|prescribed)\b[\s\S]{0,100}\b(?:rate|fee|charge|cap|amount|tariff)\b/i;

  return (
    monetaryRate.test(value) ||
    perTransactionRate.test(value) ||
    assertedFixedRule.test(value)
  );
}

function sanitizeBankingLegalSection(section) {
  const safeStatement = [
    "- Applicable CBN consumer-protection and banking-charge rules require charges to be authorised, transparent, properly disclosed and capable of explanation.",
    "  The Central Bank of Nigeria should determine whether the disputed debits complied with the rules in force at the relevant time.",
  ].join("\n");

  /*
   * Generated legal-framework bullets often wrap across several lines.
   * Splitting at the beginning of each bullet allows the whole unsafe
   * claim to be removed rather than leaving broken continuation lines.
   */
  const parts =
    String(section || "")
      .split(
        /(?=^\s*-\s+)/m
      );

  let safeStatementAdded =
    false;

  const cleaned =
    parts.map((part) => {
      if (
        !containsUnsupportedBankingRate(
          part
        )
      ) {
        return part;
      }

      if (
        safeStatementAdded
      ) {
        return "";
      }

      safeStatementAdded =
        true;

      const leadingWhitespace =
        part.match(/^\s*/)?.[0] ||
        "";

      return (
        leadingWhitespace +
        safeStatement +
        "\n"
      );
    });

  return cleaned.join("");
}

function legalSectionBounds(text) {
  const startMarker =
    "LEGAL FRAMEWORK & GROUNDS:";

  const endMarker =
    "DEMANDS / RELIEFS SOUGHT:";

  const start = text.indexOf(
    startMarker
  );

  const end = text.indexOf(
    endMarker
  );

  if (
    start < 0 ||
    end < 0 ||
    end <= start
  ) {
    return null;
  }

  return {
    startMarker,
    sectionStart:
      start +
      startMarker.length,
    end,
  };
}

function normalizeLegalContext(
  verifiedLegalContext
) {
  return (
    Array.isArray(
      verifiedLegalContext
    )
      ? verifiedLegalContext
      : []
  )
    .map(value =>
      String(value || "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase()
    )
    .filter(Boolean);
}

function containsUngroundedCitation(
  bullet,
  verifiedLegalContext
) {
  const value =
    String(bullet || "");

  const citationPattern =
    /\b(?:section|sections|s\.)\s*\d+[a-z]?(?:\s*\([^)]+\))?|\b(?:act|law|code)\s*(?:no\.?\s*)?\d{1,4}\b|\bcap\.?\s*[a-z0-9]+\b|\b[A-Z][A-Za-z.'-]+\s+v(?:s\.?|\.)\s+[A-Z][A-Za-z.'-]+/i;

  const ambiguousCriminalCode =
    /criminal\s+code(?:\s+law)?\s*\/\s*penal\s+code(?:\s+law)?/i;

  if (
    !citationPattern.test(value) &&
    !ambiguousCriminalCode.test(value)
  ) {
    return false;
  }

  const lower = value
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  return !verifiedLegalContext.some(
    authority =>
      authority.length >= 8 &&
      lower.includes(authority)
  );
}

function safeLegalFoundation(
  sector
) {
  const sectorName =
    String(sector || "")
      .replace(/_/g, " ")
      .trim() ||
    "the relevant";

  return `- The competent authority should assess the verified facts under the applicable Nigerian ${sectorName} law, administrative rules, regulatory obligations and fair complaint-resolution standards in force at the relevant time. No unverified statutory citation or legal conclusion is relied upon.`;
}

function sanitizeUngroundedLegalSection(
  text,
  sector,
  verifiedLegalContext
) {
  const bounds =
    legalSectionBounds(text);

  if (!bounds) {
    return text;
  }

  const before =
    text.slice(
      0,
      bounds.sectionStart
    );

  const section =
    text.slice(
      bounds.sectionStart,
      bounds.end
    );

  const after =
    text.slice(bounds.end);

  let insertedSafeFoundation =
    false;

  const cleaned = section
    .split(/(?=^\s*-\s+)/m)
    .map(part => {
      if (
        !containsUngroundedCitation(
          part,
          verifiedLegalContext
        )
      ) {
        return part;
      }

      if (insertedSafeFoundation) {
        return "";
      }

      insertedSafeFoundation =
        true;

      return (
        "\n" +
        safeLegalFoundation(
          sector
        ) +
        "\n"
      );
    })
    .join("");

  return before + cleaned + after;
}

export function sanitizeLegalDraft(
  petitionText,
  sector,
  {
    verifiedLegalContext = [],
  } = {}
) {
  let text =
    replaceUnsafePenaltyLanguage(
      petitionText
    );

  text =
    sanitizeUngroundedLegalSection(
      text,
      sector,
      normalizeLegalContext(
        verifiedLegalContext
      )
    );

  if (
    String(sector || "")
      .trim()
      .toLowerCase() !==
    "banking"
  ) {
    return text;
  }

  const bounds =
    legalSectionBounds(text);

  if (!bounds) {
    return text;
  }

  const before =
    text.slice(
      0,
      bounds.sectionStart
    );

  const legalSection =
    text.slice(
      bounds.sectionStart,
      bounds.end
    );

  const after =
    text.slice(
      bounds.end
    );

  return (
    before +
    sanitizeBankingLegalSection(
      legalSection
    ) +
    after
  );
}

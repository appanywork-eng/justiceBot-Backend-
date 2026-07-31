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

export function sanitizeLegalDraft(
  petitionText,
  sector
) {
  let text =
    replaceUnsafePenaltyLanguage(
      petitionText
    );

  if (
    String(sector || "")
      .trim()
      .toLowerCase() !==
    "banking"
  ) {
    return text;
  }

  const startMarker =
    "LEGAL FRAMEWORK & GROUNDS:";

  const endMarker =
    "DEMANDS / RELIEFS SOUGHT:";

  const start =
    text.indexOf(
      startMarker
    );

  const end =
    text.indexOf(
      endMarker
    );

  if (
    start < 0 ||
    end < 0 ||
    end <= start
  ) {
    return text;
  }

  const sectionStart =
    start +
    startMarker.length;

  const before =
    text.slice(
      0,
      sectionStart
    );

  const legalSection =
    text.slice(
      sectionStart,
      end
    );

  const after =
    text.slice(
      end
    );

  return (
    before +
    sanitizeBankingLegalSection(
      legalSection
    ) +
    after
  );
}

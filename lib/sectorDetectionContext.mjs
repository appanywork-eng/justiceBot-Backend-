/*
 * Builds the text used for sector detection.
 *
 * The organisation and issue location are included so
 * users do not have to repeat an institution's name
 * perfectly inside the complaint.
 */

export function normalizeSectorDetectionText(
  value
) {
  return String(value || "")
    /*
     * Common user spelling and typing variations.
     * AFEDC is a frequent typing error for AEDC.
     */
    .replace(
      /\bafedc\b/gi,
      "aedc"
    )
    .replace(
      /\bmetres\b/gi,
      "meters"
    )
    .replace(
      /\bmetre\b/gi,
      "meter"
    )
    .replace(
      /\bpre[\s-]?paid\b/gi,
      "prepaid"
    )
    .replace(
      /\btoken units?\b/gi,
      "electricity token"
    )
    .replace(
      /\belectricity units?\b/gi,
      "electricity token"
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

export function buildSectorDetectionText({
  complaint = "",
  institutionName = "",
  issueLocation = "",
} = {}) {
  return normalizeSectorDetectionText(
    [
      institutionName,
      complaint,
      issueLocation,
    ]
      .filter(Boolean)
      .join("\n")
  );
}

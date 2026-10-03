function clean(value, maxLength = 50000) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalize(value) {
  return clean(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function moneyValues(text) {
  const source = clean(text, 20000);
  const values = [];

  const currencyPattern = /(?:₦\s*|\bNGN\s*|\bN(?=\s*\d)\s*)(\d[\d,]*(?:\.\d{1,2})?)/gi;
  for (const match of source.matchAll(currencyPattern)) {
    values.push(match[1].replace(/[^0-9]/g, ""));
  }

  const contextualPattern = /\b(?:amount|loan|deduct(?:ed|ion)?|debit(?:ed)?|charge(?:d)?|refund(?:ed)?|repay(?:ment|aid)?|disburs(?:ed|ement)?)\b[^.\n]{0,50}?\b(\d{4,}(?:\.\d{1,2})?)\b/gi;
  for (const match of source.matchAll(contextualPattern)) {
    values.push(match[1].replace(/[^0-9]/g, ""));
  }

  return unique(values);
}

function petitionContainsMoney(text, digits) {
  const numericValues = (
    clean(text, 50000).match(/\d[\d,]*(?:\.\d{1,2})?/g) || []
  ).map(value => value.replace(/[^0-9]/g, ""));

  return numericValues.includes(digits);
}

function routeHeaderValues(text, label) {
  const lines = String(text || "").split(/\r?\n/);
  const prefix = new RegExp(`^\\s*${label}\\s*:\\s*(.+)$`, "i");

  return unique(
    lines
      .map(line => normalize(line.match(prefix)?.[1] || ""))
      .filter(Boolean)
  );
}

function stripExpectedRecipientNames(header, expectedNames) {
  let remaining = ` ${normalize(header)} `;

  for (const expected of [...expectedNames].sort((left, right) => right.length - left.length)) {
    remaining = remaining.split(` ${expected} `).join(" ");
  }

  return remaining
    .replace(/\b(?:and|none)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PURPOSE_STOP_WORDS = new Set([
  "a", "an", "and", "or", "the", "to", "of", "for", "from", "in", "on",
  "complaint", "petition", "request", "formal", "concerning", "matter",
  "action", "appropriate", "responsible", "official",
]);

function distinctiveWords(value) {
  return normalize(value)
    .split(" ")
    .filter((word) => word.length > 2 && !PURPOSE_STOP_WORDS.has(word));
}

const ACTIONABLE_REMEDY_PATTERN =
  /\b(?:acknowledge|accept|address|amend|cancel|cease|clarify|compensate|correct|disclose|direct|enforce|explain|investigate|pay|preserve|produce|provide|reconcile|reconsider|reconnect|rectify|redress|refund|reinstate|release|remedy|remove|repair|replace|respond|restore|return|reverse|review|sanction|settle|stop|suspend|verify|withdraw)\b/i;

const REPAIRABLE_QUALITY_ERRORS = new Set([
  "subject_purpose_mismatch",
  "actionable_remedy_missing",
]);

function routePurposeErrors(petitionText, documentPurpose) {
  if (!clean(documentPurpose, 1000)) return [];

  const errors = [];
  const subjects = routeHeaderValues(petitionText, "SUBJECT");
  const purposeWords = new Set(distinctiveWords(documentPurpose));
  const subjectWords = new Set(distinctiveWords(subjects[0] || ""));
  const purposeOverlap = [...purposeWords].some((word) => subjectWords.has(word));

  if (subjects.length !== 1 || !purposeOverlap) {
    errors.push("subject_purpose_mismatch");
  }

  const demands = String(petitionText || "").match(
    /^\s*DEMANDS \/ RELIEFS SOUGHT:\s*$([\s\S]*?)(?=^\s*(?:NOTICE & ESCALATION:|LIST OF ATTACHMENTS|Yours faithfully,))/im
  )?.[1] || "";

  if (!ACTIONABLE_REMEDY_PATTERN.test(demands)) {
    errors.push("actionable_remedy_missing");
  }

  return errors;
}

export function inspectPetitionSemanticQuality({
  petitionText = "",
  complaint = "",
  institutionName = "",
  priorComplaintReference = "",
  primaryInstitution = "",
  ccInstitutions = [],
  documentPurpose = "",
} = {}) {
  const petition = clean(petitionText, 50000);
  const petitionNormalized = normalize(petition);
  const missingMaterialFacts = [];

  for (const amount of moneyValues(complaint)) {
    if (!petitionContainsMoney(petition, amount)) {
      missingMaterialFacts.push(`amount:${amount}`);
    }
  }

  const suppliedInstitution = normalize(institutionName);
  if (
    suppliedInstitution &&
    !petitionNormalized.includes(suppliedInstitution)
  ) {
    missingMaterialFacts.push("institutionName");
  }

  const reference = clean(priorComplaintReference, 150);
  if (
    reference &&
    !petition.toLowerCase().includes(reference.toLowerCase())
  ) {
    missingMaterialFacts.push("priorComplaintReference");
  }

  const toHeaders = routeHeaderValues(petitionText, "TO");
  const ccHeaders = routeHeaderValues(petitionText, "CC");
  const primary = normalize(primaryInstitution);

  const routingErrors = [];
  if (
    primary &&
    (toHeaders.length !== 1 || toHeaders[0] !== primary)
  ) {
    routingErrors.push("primary_recipient_header_mismatch");
  }

  if (
    primary &&
    ccHeaders.some(header => header.includes(primary))
  ) {
    routingErrors.push("to_cc_duplicate");
  }

  const expectedCc = (Array.isArray(ccInstitutions) ? ccInstitutions : [])
    .map(normalize)
    .filter(Boolean);

  for (const expected of expectedCc) {
    if (
      !ccHeaders.some(header => header.includes(expected))
    ) {
      routingErrors.push(`missing_cc:${expected}`);
    }
  }

  for (const header of ccHeaders) {
    if (header === "none" && expectedCc.length === 0) continue;

    const unexpected = stripExpectedRecipientNames(header, expectedCc);
    if (unexpected) {
      routingErrors.push(`unexpected_cc:${unexpected}`);
    }
  }

  routingErrors.push(
    ...routePurposeErrors(
      petitionText,
      documentPurpose
    )
  );

  const allegationSensitive = /\b(?:alleged|allegation|suspected|accused|fraud|misconduct|murder|corruption)\b/i.test(
    complaint
  );
  const allegationFramed = /\b(?:alleged|alleges|allegation|suspected|reported|according to the petitioner|subject to investigation|subject to verification)\b/i.test(
    petition
  );

  if (allegationSensitive && !allegationFramed) {
    routingErrors.push("allegation_not_safely_framed");
  }

  return {
    complete:
      missingMaterialFacts.length === 0 &&
      routingErrors.length === 0,
    missingMaterialFacts,
    routingErrors: unique(routingErrors),
  };
}

function sourceSentenceForAmount(text, digits) {
  const source = String(text || "").replace(/\r/g, "\n");
  const pieces = source
    .split(/(?<=[.!?])\s+|\n+/)
    .map(piece => clean(piece, 1500))
    .filter(Boolean);

  for (const piece of pieces) {
    if (petitionContainsMoney(piece, digits)) {
      return piece;
    }
  }

  const matches = [...source.matchAll(/\d[\d,]*(?:\.\d{1,2})?/g)];
  const match = matches.find(
    candidate =>
      candidate[0].replace(/[^0-9]/g, "") === digits
  );

  if (!match) return "";

  const start = Math.max((match.index || 0) - 120, 0);
  const end = Math.min(
    (match.index || 0) + match[0].length + 120,
    source.length
  );

  return clean(source.slice(start, end), 500);
}

function insertRecoveredFacts(petitionText, facts) {
  const petition = String(petitionText || "").trim();
  const additions = facts.filter(Boolean);

  if (!additions.length) return petition;

  const block = additions
    .map(value => `- ${value}`)
    .join("\n");

  const anchors = [
    /^\s*ISSUES FOR DETERMINATION:\s*$/im,
    /^\s*LEGAL FRAMEWORK & GROUNDS:\s*$/im,
    /^\s*DEMANDS \/ RELIEFS SOUGHT:\s*$/im,
    /^\s*Yours faithfully,\s*$/im,
  ];

  let index = -1;

  for (const anchor of anchors) {
    const match = anchor.exec(petition);
    if (match && (index < 0 || match.index < index)) {
      index = match.index;
    }
  }

  if (index < 0) {
    return `${petition}\n\n${block}`.trim();
  }

  const before = petition.slice(0, index).trimEnd();
  const after = petition.slice(index).trimStart();

  return `${before}\n${block}\n\n${after}`.trim();
}

function deterministicSubject(
  documentPurpose
) {
  return (
    clean(
      documentPurpose,
      1000
    ) ||
    "Formal complaint requesting investigation and appropriate redress"
  );
}

function repairSubjectLine(
  petitionText,
  documentPurpose
) {
  const subjectLine =
    "SUBJECT: " +
    deterministicSubject(
      documentPurpose
    );

  const lines =
    String(
      petitionText || ""
    ).split(/\r?\n/);

  /*
   * SUBJECT is safe to repair because PetitionDesk already
   * holds the authoritative deterministic document purpose.
   *
   * TO and CC are deliberately NOT repaired here.
   */
  const output =
    lines.filter(
      line =>
        !/^\s*SUBJECT\s*:/i
          .test(line)
    );

  let insertAt =
    output.findIndex(
      line =>
        /^\s*Dear Sir\/Madam,?\s*$/i
          .test(line)
    );

  if (insertAt < 0) {
    insertAt =
      output.findIndex(
        line =>
          /^\s*INTRODUCTION:\s*$/i
            .test(line)
      );
  }

  if (insertAt < 0) {
    insertAt =
      output.length;
  }

  output.splice(
    insertAt,
    0,
    subjectLine,
    ""
  );

  return output
    .join("\n")
    .replace(
      /\n{3,}/g,
      "\n\n"
    )
    .trim();
}

function repairActionableRemedy(
  petitionText
) {
  const lines =
    String(
      petitionText || ""
    ).split(/\r?\n/);

  const headingIndex =
    lines.findIndex(
      line =>
        /^\s*DEMANDS \/ RELIEFS SOUGHT:\s*$/i
          .test(line)
    );

  if (headingIndex < 0) {
    return String(
      petitionText || ""
    ).trim();
  }

  /*
   * Add a conservative deterministic relief instead of
   * rejecting an otherwise valid petition because Gemini
   * chose non-whitelisted wording.
   */
  lines.splice(
    headingIndex + 1,
    0,
    "- Investigate the complaint, preserve the relevant records, correct any verified error, and provide a reasoned written response."
  );

  return lines
    .join("\n")
    .replace(
      /\n{3,}/g,
      "\n\n"
    )
    .trim();
}

export function repairPetitionSemanticFacts(
  input = {}
) {
  const {
    petitionText = "",
    complaint = "",
    institutionName = "",
    priorComplaintReference = "",
    documentPurpose = "",
  } = input;

  const before =
    inspectPetitionSemanticQuality(
      input
    );

  if (before.complete) {
    return {
      text:
        String(petitionText || "").trim(),

      repaired:
        false,

      recoveredFacts:
        [],

      repairs:
        [],

      assessment:
        before,
    };
  }

  /*
   * Critical distinction:
   *
   * SUBJECT/relief wording may be deterministically repaired.
   *
   * Incorrect TO, incorrect CC, recipient duplication,
   * unauthorized recipients and allegation-safety defects
   * remain HARD failures.
   */
  const hardRoutingErrors =
    before.routingErrors.filter(
      error =>
        !REPAIRABLE_QUALITY_ERRORS
          .has(error)
    );

  if (
    hardRoutingErrors.length >
    0
  ) {
    return {
      text:
        String(petitionText || "").trim(),

      repaired:
        false,

      recoveredFacts:
        [],

      repairs:
        [],

      assessment:
        before,
    };
  }

  let text =
    String(petitionText || "").trim();

  const repairs = [];

  if (
    before.routingErrors.includes(
      "subject_purpose_mismatch"
    )
  ) {
    text =
      repairSubjectLine(
        text,
        documentPurpose
      );

    repairs.push(
      "subject_purpose_repaired"
    );
  }

  if (
    before.routingErrors.includes(
      "actionable_remedy_missing"
    )
  ) {
    text =
      repairActionableRemedy(
        text
      );

    repairs.push(
      "actionable_remedy_repaired"
    );
  }

  const recoveredFacts = [];

  for (
    const missing
    of before.missingMaterialFacts
  ) {
    if (
      missing.startsWith(
        "amount:"
      )
    ) {
      const digits =
        missing.slice(
          "amount:".length
        );

      const sentence =
        sourceSentenceForAmount(
          complaint,
          digits
        );

      if (sentence) {
        recoveredFacts.push(
          "The petitioner states: " +
          sentence
        );
      }

      continue;
    }

    if (
      missing ===
      "priorComplaintReference"
    ) {
      const reference =
        clean(
          priorComplaintReference,
          150
        );

      if (reference) {
        recoveredFacts.push(
          "Prior complaint reference supplied by the petitioner: " +
          reference +
          "."
        );
      }

      continue;
    }

    if (
      missing ===
      "institutionName"
    ) {
      const institution =
        clean(
          institutionName,
          300
        );

      if (institution) {
        recoveredFacts.push(
          "The petitioner identifies " +
          institution +
          " as the organisation or service complained against."
        );
      }
    }
  }

  if (
    recoveredFacts.length >
    0
  ) {
    text =
      insertRecoveredFacts(
        text,
        unique(
          recoveredFacts
        )
      );

    repairs.push(
      "material_facts_recovered"
    );
  }

  const assessment =
    inspectPetitionSemanticQuality({
      ...input,

      petitionText:
        text,
    });

  return {
    text,

    repaired:
      repairs.length > 0,

    recoveredFacts:
      unique(
        recoveredFacts
      ),

    repairs:
      unique(
        repairs
      ),

    assessment,
  };
}

export function assertPetitionSemanticQuality(input = {}) {
  const assessment = inspectPetitionSemanticQuality(input);
  if (assessment.complete) return assessment;

  const error = new Error(
    "The generated petition failed the material-fact or recipient safety check."
  );
  error.code = "PETITION_SEMANTIC_QUALITY_FAILED";
  error.status = 502;
  error.retryable = true;
  error.assessment = assessment;
  throw error;
}

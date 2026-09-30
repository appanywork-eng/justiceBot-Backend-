const REQUIRED_HEADINGS = Object.freeze([
  "INTRODUCTION:",
  "FACTS / BACKGROUND:",
  "ISSUES FOR DETERMINATION:",
  "LEGAL FRAMEWORK & GROUNDS:",
  "DEMANDS / RELIEFS SOUGHT:",
  "NOTICE & ESCALATION:",
  "LIST OF ATTACHMENTS (if any):",
]);

function clean(value, maxLength = 10000) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, maxLength);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function headingPresent(text, heading) {
  return new RegExp(
    `^\\s*${escapeRegExp(heading)}\\s*$`,
    "im"
  ).test(text);
}

export function inspectPetitionDraft(text, petitionerName = "") {
  const value = clean(text, 50000);

  const missingHeadings = REQUIRED_HEADINGS.filter(
    heading => !headingPresent(value, heading)
  );

  const closingMatch = value.match(/^\s*Yours faithfully,\s*$/im);
  const signature = closingMatch
    ? value.slice(closingMatch.index + closingMatch[0].length).trim()
    : "";

  const hasSignature = Boolean(signature) && (
    !clean(petitionerName, 300) ||
    signature.toLowerCase().includes(
      clean(petitionerName, 300).toLowerCase()
    )
  );

  return {
    complete:
      missingHeadings.length === 0 &&
      Boolean(closingMatch) &&
      hasSignature,

    missingHeadings,
    hasClosing: Boolean(closingMatch),
    hasSignature,
  };
}

function removeUnfinishedEnding(text) {
  const value = clean(text, 50000);
  const closingPosition = value.search(/^\s*Yours faithfully,\s*$/im);
  const withoutClosing = closingPosition < 0
    ? value
    : value.slice(0, closingPosition).trimEnd();

  if (/[.!?:]["')\]]?\s*$/.test(withoutClosing)) {
    return withoutClosing;
  }

  const sentenceEndings = [
    ...withoutClosing.matchAll(/[.!?]["')\]]?(?=\s|$)/g),
  ];

  const finalCompleteSentence = sentenceEndings.at(-1);

  return finalCompleteSentence
    ? withoutClosing.slice(
        0,
        finalCompleteSentence.index + finalCompleteSentence[0].length
      ).trimEnd()
    : withoutClosing;
}

function disputedAmount(complaint) {
  const source = clean(complaint, 10000);
  const amount = "(?:₦|NGN\\s*|N\\s*)(?:[0-9]{1,3}(?:,[0-9]{3})*|[0-9]+)(?:\\.[0-9]{1,2})?";
  const dispute = "(?:unauthori[sz]ed|disputed|additional|duplicate|wrongful|unapproved|unexplained)";

  const leading = source.match(
    new RegExp(`${dispute}[^.\\n]{0,100}(${amount})`, "i")
  );

  if (leading?.[1]) return leading[1].replace(/^NGN\s*/i, "₦");

  const trailing = source.match(
    new RegExp(`(${amount})[^.\\n]{0,100}${dispute}`, "i")
  );

  return trailing?.[1]?.replace(/^NGN\s*/i, "₦") || "";
}

function buildMissingSections({
  assessment,
  complaint,
  sector,
  primaryInstitution,
  ccInstitutions,
}) {
  const missing = new Set(assessment.missingHeadings);
  const respondent = clean(primaryInstitution, 300) || "the responsible organisation";
  const participants = (Array.isArray(ccInstitutions) ? ccInstitutions : [])
    .map(value => clean(value, 300))
    .filter(Boolean);
  const participantText = participants.length
    ? ` and ${participants.join(" and ")}`
    : "";
  const banking = String(sector || "").toLowerCase() === "banking";
  const amount = disputedAmount(complaint);
  const amountText = amount
    ? `, including the disputed ${amount}`
    : "";
  const sections = [];

  if (missing.has("INTRODUCTION:")) {
    sections.push([
      "INTRODUCTION:",
      `- I respectfully request a documented investigation and an effective resolution of the matters complained of against ${respondent}${participantText}.`,
    ].join("\n"));
  }

  if (missing.has("FACTS / BACKGROUND:")) {
    sections.push([
      "FACTS / BACKGROUND:",
      `1. The complaint is based solely on the following information supplied by the petitioner: ${clean(complaint, 4000)}.`,
    ].join("\n"));
  }

  if (missing.has("ISSUES FOR DETERMINATION:")) {
    sections.push([
      "ISSUES FOR DETERMINATION:",
      banking
        ? "1. Whether the disputed loan, repayment mandate or deduction was supported by a genuine application, informed consent, valid authorisation and corresponding disbursement."
        : "1. Whether the acts or omissions described in this complaint were authorised, properly documented and consistent with the applicable obligations.",
      banking
        ? `2. Whether ${respondent}${participantText} can account for the disputed transaction, identify its beneficiary and reconcile every mandate, reference and payment record.`
        : `2. Whether ${respondent}${participantText} adequately investigated the complaint and took reasonable steps to prevent or remedy the alleged harm.`,
      "3. What corrective, restorative and preventive measures are appropriate on the verified evidence.",
    ].join("\n"));
  }

  if (missing.has("LEGAL FRAMEWORK & GROUNDS:")) {
    sections.push([
      "LEGAL FRAMEWORK & GROUNDS:",
      banking
        ? "- The matter should be assessed under the applicable Nigerian financial-services, payment-mandate, consumer-protection and complaint-resolution requirements in force when the relevant transactions occurred."
        : "- The matter should be assessed under the applicable Nigerian law, administrative requirements and fair complaint-resolution standards relevant to the verified facts.",
      "- Any allegation remains subject to verification; a competent institution or regulator should determine the applicable rule and the appropriate response after examining the evidence.",
      banking
        ? "- A disputed debit or loan obligation should be reconciled against reliable application, consent, disbursement, mandate, transaction and beneficiary records."
        : "- Decisions should be evidence-led, procedurally fair, proportionate and properly communicated to the affected person.",
    ].join("\n"));
  }

  if (missing.has("DEMANDS / RELIEFS SOUGHT:")) {
    sections.push([
      "DEMANDS / RELIEFS SOUGHT:",
      "1. Acknowledge this petition and provide a complaint reference together with the details of the officer or team handling the matter.",
      banking
        ? "2. Produce the underlying loan application, executed mandate, customer authorisation, disbursement evidence, repayment schedule, transaction logs and beneficiary details relied upon for every disputed debit."
        : "2. Investigate each factual allegation, preserve the relevant records and provide a reasoned written response supported by the available evidence.",
      banking
        ? `3. Reverse and refund any amount established to have been collected or deducted without valid authorisation${amountText}, and provide a complete transaction reconciliation.`
        : "3. Correct any verified error, restore the petitioner's affected rights or position and provide any appropriate redress supported by the evidence.",
      banking
        ? "4. Suspend any further disputed deduction or enforcement while the challenged mandate and underlying obligation are being verified, without interfering with any separately established lawful obligation."
        : "4. Introduce appropriate safeguards against a recurrence and explain the corrective steps taken.",
      "5. Confirm the outcome in writing and identify the available internal review or lawful regulatory-escalation channel if the complaint remains unresolved.",
    ].join("\n"));
  }

  if (missing.has("NOTICE & ESCALATION:")) {
    sections.push([
      "NOTICE & ESCALATION:",
      "- If this matter is not resolved within the applicable complaint-resolution process, I reserve the right to escalate it to the competent regulator, oversight body or another lawful dispute-resolution forum, subject to the required complaint stage and supporting evidence.",
    ].join("\n"));
  }

  if (missing.has("LIST OF ATTACHMENTS (if any):")) {
    const documents = [];
    if (/statement|account/i.test(complaint)) documents.push("relevant account or transaction statements");
    if (/loan|credit|facility|repay|install?ment/i.test(complaint)) documents.push("available loan, disbursement and repayment records");
    if (/mandate|reference/i.test(complaint)) documents.push("mandate details and transaction or complaint references");
    if (/salary|payroll/i.test(complaint)) documents.push("available salary or payroll records");
    if (/email|message|correspondence|complain/i.test(complaint)) documents.push("relevant communications or complaint correspondence");

    sections.push([
      "LIST OF ATTACHMENTS (if any):",
      documents.length
        ? `- Supporting documents identified in the complaint, where available: ${documents.join("; ")}.`
        : "- Any supporting documents expressly identified by the petitioner, where available.",
    ].join("\n"));
  }

  return sections;
}

export function completePetitionDraft(text, {
  complaint = "",
  sector = "",
  primaryInstitution = "",
  ccInstitutions = [],
  petitioner = {},
} = {}) {
  const name = clean(petitioner.fullName, 300) || "[Your Full Name]";
  const phone = clean(petitioner.phone, 100) || "[Phone Number]";
  const email = clean(petitioner.email, 320) || "[Your Email]";
  const assessment = inspectPetitionDraft(text, name);

  if (assessment.complete) {
    return {
      text: clean(text, 50000),
      repaired: false,
      missingHeadings: [],
    };
  }

  const repaired = [
    removeUnfinishedEnding(text),
    ...buildMissingSections({
      assessment,
      complaint,
      sector,
      primaryInstitution,
      ccInstitutions,
    }),
    ["Yours faithfully,", name, phone, email].join("\n"),
  ].filter(Boolean).join("\n\n");

  const finalAssessment = inspectPetitionDraft(repaired, name);

  if (!finalAssessment.complete) {
    const error = new Error("The generated petition is incomplete and could not be safely repaired.");
    error.code = "PETITION_INCOMPLETE";
    error.status = 502;
    throw error;
  }

  return {
    text: repaired,
    repaired: true,
    missingHeadings: assessment.missingHeadings,
  };
}

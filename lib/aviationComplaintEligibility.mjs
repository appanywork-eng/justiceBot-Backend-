/*
 * PetitionDesk aviation consumer-complaint
 * escalation safeguard.
 *
 * Ordinary passenger complaints:
 * - airline/service provider first;
 * - NCAA after evidence of the earlier complaint.
 *
 * Accidents and serious incidents bypass this
 * safeguard and route immediately to NSIB.
 */

function clean(
  value,
  max = 10000
) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}


const PROVIDER_COMPLAINT_EVIDENCE_PATTERNS = [
  /\bcomplained to (the )?(airline|carrier|service provider)\b/i,

  /\breported (the )?(issue|matter|complaint) to (the )?(airline|carrier|service provider)\b/i,

  /\bcontacted (the )?(airline|carrier|customer care|customer affairs unit)\b/i,

  /\bemailed (the )?(airline|carrier|customer care)\b/i,

  /\bsubmitted.{0,40}complaint.{0,40}(airline|carrier|service provider)\b/i,

  /\bairline.{0,30}(did not respond|has not responded|failed to respond|refused to respond)\b/i,

  /\bno response from (the )?(airline|carrier|service provider)\b/i,

  /\bprovider complaint acknowledgement\b/i,

  /\bairline complaint acknowledgement\b/i,

  /\bcomplaint correspondence\b/i,
];


const REFERENCE_REFUSAL_PATTERNS = [
  /\brefused to (give|provide|issue).{0,30}(reference|ticket|acknowledgement)\b/i,

  /\bdid not (give|provide|issue).{0,30}(reference|ticket|acknowledgement)\b/i,

  /\bfailed to (give|provide|issue).{0,30}(reference|ticket|acknowledgement)\b/i,

  /\bno complaint (reference|ticket|acknowledgement).{0,20}(was|has been) issued\b/i,

  /\bunable to obtain.{0,30}(reference|ticket|acknowledgement)\b/i,
];


const REQUIRED_EVIDENCE =
  Object.freeze([
    "Evidence that the airline or service provider was first contacted",

    "Flight ticket, booking reference or PNR",

    "Baggage tag or airway bill where applicable",

    "Incident date, airport, route and supporting correspondence",

    "The redress requested by the passenger",
  ]);


export function evaluateAviationEscalationEligibility({
  escalationRequested = false,

  priorComplaintReference = "",

  complaint = "",
} = {}) {
  const reference =
    clean(
      priorComplaintReference,
      150
    );

  const narrative =
    clean(
      complaint
    );

  const providerEvidenceNarrativeDetected =
    PROVIDER_COMPLAINT_EVIDENCE_PATTERNS.some(
      pattern =>
        pattern.test(
          narrative
        )
    );

  const referenceExceptionClaimed =
    REFERENCE_REFUSAL_PATTERNS.some(
      pattern =>
        pattern.test(
          narrative
        )
    );


  if (!escalationRequested) {
    return Object.freeze({
      escalationRequested:
        false,

      priorComplaintReferenceProvided:
        false,

      providerEvidenceNarrativeDetected:
        false,

      referenceExceptionClaimed:
        false,

      ncaaEscalationEligible:
        false,

      reason:
        "provider_first",

      requiredEvidence:
        REQUIRED_EVIDENCE,
    });
  }


  if (reference) {
    return Object.freeze({
      escalationRequested:
        true,

      priorComplaintReferenceProvided:
        true,

      providerEvidenceNarrativeDetected:
        providerEvidenceNarrativeDetected,

      referenceExceptionClaimed:
        false,

      ncaaEscalationEligible:
        true,

      reason:
        "eligible_with_provider_reference",

      requiredEvidence:
        REQUIRED_EVIDENCE,
    });
  }


  if (
    providerEvidenceNarrativeDetected ||
    referenceExceptionClaimed
  ) {
    return Object.freeze({
      escalationRequested:
        true,

      priorComplaintReferenceProvided:
        false,

      providerEvidenceNarrativeDetected:
        providerEvidenceNarrativeDetected,

      referenceExceptionClaimed:
        referenceExceptionClaimed,

      ncaaEscalationEligible:
        true,

      reason:
        referenceExceptionClaimed
          ? "eligible_provider_reference_refused"
          : "eligible_with_provider_complaint_evidence",

      requiredEvidence:
        REQUIRED_EVIDENCE,
    });
  }


  return Object.freeze({
    escalationRequested:
      true,

    priorComplaintReferenceProvided:
      false,

    providerEvidenceNarrativeDetected:
      false,

    referenceExceptionClaimed:
      false,

    ncaaEscalationEligible:
      false,

    reason:
      "provider_complaint_evidence_required",

    requiredEvidence:
      REQUIRED_EVIDENCE,
  });
}

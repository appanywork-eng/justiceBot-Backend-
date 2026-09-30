/*
 * PetitionDesk health-service escalation safeguard.
 *
 * Ordinary hospital, clinic, HMO and healthcare-service
 * complaints should ordinarily go to the responsible
 * provider first.
 *
 * Direct professional-discipline, medical-product safety
 * and human-rights complaints are handled separately by
 * the health resolver.
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
  /\bcomplained to (the )?(hospital|clinic|hmo|health maintenance organisation|health maintenance organization|healthcare provider|health care provider)\b/i,

  /\breported (the )?(issue|matter|complaint) to (the )?(hospital|clinic|hmo|healthcare provider|health care provider)\b/i,

  /\bcontacted (the )?(hospital|clinic|hmo|provider|patient relations|patient affairs|hospital management)\b/i,

  /\bsubmitted.{0,40}complaint.{0,40}(hospital|clinic|hmo|healthcare provider|health care provider)\b/i,

  /\b(hospital|clinic|hmo|healthcare provider|health care provider).{0,35}(did not respond|has not responded|failed to respond|refused to respond)\b/i,

  /\bno response from (the )?(hospital|clinic|hmo|healthcare provider|health care provider)\b/i,

  /\bprovider complaint acknowledgement\b/i,

  /\bhospital complaint acknowledgement\b/i,

  /\bhmo complaint acknowledgement\b/i,

  /\bcomplaint correspondence with (the )?(hospital|clinic|hmo|provider)\b/i,
];


const REFERENCE_REFUSAL_PATTERNS = [
  /\brefused to (give|provide|issue).{0,35}(reference|ticket|acknowledgement)\b/i,

  /\bdid not (give|provide|issue).{0,35}(reference|ticket|acknowledgement)\b/i,

  /\bfailed to (give|provide|issue).{0,35}(reference|ticket|acknowledgement)\b/i,

  /\bno complaint (reference|ticket|acknowledgement).{0,25}(was|has been) issued\b/i,

  /\bunable to obtain.{0,35}(reference|ticket|acknowledgement)\b/i,

  /\bprovider refused.{0,35}(reference|ticket|acknowledgement)\b/i,
];


const REQUIRED_EVIDENCE =
  Object.freeze([
    "Evidence of the earlier complaint to the hospital, clinic, HMO or healthcare provider",

    "Complaint reference, acknowledgement or correspondence",

    "Relevant medical record, referral, prescription or laboratory result",

    "Bills, receipts and payment records where applicable",

    "Incident date, treatment location and remedy requested",
  ]);


export function evaluateHealthEscalationEligibility({
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

      healthEscalationEligible:
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

      providerEvidenceNarrativeDetected,

      referenceExceptionClaimed:
        false,

      healthEscalationEligible:
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

      providerEvidenceNarrativeDetected,

      referenceExceptionClaimed,

      healthEscalationEligible:
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

    healthEscalationEligible:
      false,

    reason:
      "provider_complaint_evidence_required",

    requiredEvidence:
      REQUIRED_EVIDENCE,
  });
}

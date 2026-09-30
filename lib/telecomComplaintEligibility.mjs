/*
 * PetitionDesk telecommunications
 * escalation-eligibility safeguard.
 *
 * The NCC route should be used only after:
 * 1. the consumer has first complained to the operator; and
 * 2. the operator complaint ticket/reference is supplied;
 *    or the complaint clearly records that the operator
 *    refused or failed to issue one.
 */

function clean(
  value,
  max = 200
) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}


const REFERENCE_REFUSAL_PATTERNS = [
  /\brefused to (give|provide|issue).{0,30}(reference|ticket)\b/i,

  /\bdid not (give|provide|issue).{0,30}(reference|ticket)\b/i,

  /\bfailed to (give|provide|issue).{0,30}(reference|ticket)\b/i,

  /\bno complaint (reference|ticket).{0,20}(was|has been) issued\b/i,

  /\bcomplaint (reference|ticket).{0,20}(was|has been) refused\b/i,

  /\bunable to obtain.{0,30}(reference|ticket)\b/i,

  /\boperator refused.{0,30}(reference|ticket)\b/i,
];


export function evaluateTelecomEscalationEligibility({
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
      complaint,
      10000
    );

  const referenceExceptionClaimed =
    REFERENCE_REFUSAL_PATTERNS.some(
      pattern =>
        pattern.test(
          narrative
        )
    );

  const requested =
    Boolean(
      escalationRequested
    );


  if (!requested) {
    return Object.freeze({
      escalationRequested:
        false,

      priorComplaintReferenceProvided:
        false,

      referenceExceptionClaimed:
        false,

      nccEscalationEligible:
        false,

      reason:
        "provider_first",
    });
  }


  if (reference) {
    return Object.freeze({
      escalationRequested:
        true,

      priorComplaintReferenceProvided:
        true,

      referenceExceptionClaimed:
        false,

      nccEscalationEligible:
        true,

      reason:
        "eligible_with_operator_reference",
    });
  }


  if (referenceExceptionClaimed) {
    return Object.freeze({
      escalationRequested:
        true,

      priorComplaintReferenceProvided:
        false,

      referenceExceptionClaimed:
        true,

      nccEscalationEligible:
        true,

      reason:
        "eligible_operator_reference_refused",
    });
  }


  return Object.freeze({
    escalationRequested:
      true,

    priorComplaintReferenceProvided:
      false,

    referenceExceptionClaimed:
      false,

    nccEscalationEligible:
      false,

    reason:
      "operator_reference_required",
  });
}

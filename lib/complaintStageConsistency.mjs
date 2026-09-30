function normalize(
  value
) {
  return String(value || "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const INITIAL_STAGES =
  new Set([
    "initial",
    "first contact",
    "first_contact",
    "not contacted",
    "not_contacted",
    "new complaint",
    "new_complaint",
  ]);

const UNRESOLVED_STAGES =
  new Set([
    "unresolved",
    "provider contacted",
    "provider_contacted",
    "escalation",
    "escalate",
    "appeal",
    "regulator",
  ]);

const PRIOR_COMPLAINT_PATTERNS = [
  /\bpreviously complained\b/i,
  /\balready complained\b/i,
  /\bi complained to\b/i,
  /\bwe complained to\b/i,
  /\bcomplained to (the|this|my|our)\b/i,
  /\bprevious complaint\b/i,
  /\bearlier complaint\b/i,
  /\bformal complaint was (made|submitted|lodged|sent)\b/i,
  /\bcomplaint reference\b/i,
  /\bcomplaint ref\b/i,
  /\bcomplaint ticket\b/i,
  /\bticket number\b/i,
  /\breference number\b/i,
  /\btracking number\b/i,
  /\bcontacted customer (care|service|support)\b/i,
  /\bcontacted the (bank|airline|operator|provider|company)\b/i,
  /\breported the matter\b/i,
  /\breported to the\b/i,
  /\bremains unresolved\b/i,
  /\bmatter remains unresolved\b/i,
  /\bunresolved complaint\b/i,
  /\bfailed to resolve\b/i,
  /\brefused to resolve\b/i,
  /\bno response was received\b/i,
  /\bwithout response\b/i,
  /\bdespite (my|our|the) complaint\b/i,
  /\bafter (making|submitting|lodging|sending) (my|our|the|a) complaint\b/i,
];

const NO_PRIOR_COMPLAINT_PATTERNS = [
  /\bhave not complained\b/i,
  /\bhas not complained\b/i,
  /\bhad not complained\b/i,
  /\bnot complained before\b/i,
  /\bnever complained\b/i,
  /\bnot yet complained\b/i,
  /\bhave not reported\b/i,
  /\bnot yet reported\b/i,
  /\bhave not contacted\b/i,
  /\bnot yet contacted\b/i,
  /\bfirst formal complaint\b/i,
  /\bfirst complaint\b/i,
  /\bfirst time complaining\b/i,
];

const MONTH_NUMBERS = Object.freeze({
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
});

function normalizeNarrativeDate(value) {
  const text = String(value || "").trim();
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

  if (match) {
    return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  }

  match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);

  if (match) {
    return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  }

  match = text.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/i);

  if (!match) return "";

  const month = MONTH_NUMBERS[match[2].toLowerCase()];
  return month
    ? `${match[3]}-${month}-${match[1].padStart(2, "0")}`
    : "";
}

export function extractNarrativeComplaintHistory(complaint) {
  const text = String(complaint || "");
  const referenceMatches = text.matchAll(
    /\b(?:complaint\s+)?(?:reference|ref(?:erence)?|ticket)\s*(?:number|no\.?|#|:|was|is)?\s*([a-z0-9][a-z0-9._/-]{3,})/gi
  );

  let reference = "";

  for (const match of referenceMatches) {
    const candidate = String(match[1] || "")
      .trim()
      .replace(/[.,;:]+$/, "");

    if (/\d/.test(candidate)) {
      reference = candidate;
      break;
    }
  }

  const complaintDateMatch = text.match(
    /\b(?:complain(?:ed|t)?|submitted|lodged|reported)\b[^.!?\n]{0,140}?\b(?:on\s+)?(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{1,2}\s+[a-z]+\s+\d{4})\b/i
  );

  return {
    reference,
    date: normalizeNarrativeDate(
      complaintDateMatch?.[1] || ""
    ),
    inferredFromNarrative: Boolean(
      reference || complaintDateMatch?.[1]
    ),
  };
}

export function detectComplaintHistorySignals(
  complaint
) {
  const text =
    normalize(
      complaint
    );

  return {
    priorComplaintSignal:
      PRIOR_COMPLAINT_PATTERNS.some(
        pattern =>
          pattern.test(
            text
          )
      ),

    noPriorComplaintSignal:
      NO_PRIOR_COMPLAINT_PATTERNS.some(
        pattern =>
          pattern.test(
            text
          )
      ),
  };
}

export function evaluateComplaintStageConsistency({
  complaint = "",
  escalationStage = "",
  priorComplaintReference = "",
} = {}) {
  const stage =
    normalize(
      escalationStage
    );

  const reference =
    String(
      priorComplaintReference || ""
    ).trim();

  const {
    priorComplaintSignal,
    noPriorComplaintSignal,
  } =
    detectComplaintHistorySignals(
      complaint
    );

  const selectedInitial =
    INITIAL_STAGES.has(
      stage
    );

  const selectedUnresolved =
    UNRESOLVED_STAGES.has(
      stage
    );

  if (
    selectedInitial &&
    reference
  ) {
    return {
      ok: false,
      code:
        "initial_stage_with_previous_reference",
      message:
        "You selected that this is your first formal complaint, but a previous complaint reference was supplied.",
      guidance:
        "Select the unresolved-complaint option when you have already complained, or remove the previous reference and revise the complaint narrative.",
    };
  }

  if (
    selectedInitial &&
    priorComplaintSignal &&
    !noPriorComplaintSignal
  ) {
    return {
      ok: false,
      code:
        "initial_stage_conflicts_with_narrative",
      message:
        "You selected that this is your first formal complaint, but your complaint says that an earlier complaint remains unresolved.",
      guidance:
        "Confirm the correct complaint stage before generating the petition. Select the unresolved option when an earlier complaint was made.",
    };
  }

  if (
    selectedUnresolved &&
    noPriorComplaintSignal &&
    !priorComplaintSignal &&
    !reference
  ) {
    return {
      ok: false,
      code:
        "unresolved_stage_conflicts_with_narrative",
      message:
        "You selected an unresolved escalation, but your complaint says that you have not complained to the organisation before.",
      guidance:
        "Select the first-formal-complaint option, or revise the narrative if an earlier complaint was actually made.",
    };
  }

  return {
    ok: true,
    code: "",
    message: "",
    guidance: "",
    inferredPriorComplaint:
      Boolean(
        reference ||
        priorComplaintSignal
      ),
  };
}

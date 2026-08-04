const DAY_MS =
  24 * 60 * 60 * 1000;

export const BANKING_GENERAL_WAITING_DAYS =
  14;

export const BANKING_EXTENDED_WAITING_DAYS =
  30;

const INITIAL_STAGES =
  new Set([
    "",
    "initial",
    "first contact",
    "first_contact",
    "not contacted",
    "not_contacted",
    "new complaint",
    "new_complaint",
  ]);

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanDateValue(value) {
  return String(value || "")
    .trim()
    .slice(0, 10);
}

function parseIsoDate(value) {
  const text =
    cleanDateValue(value);

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      text
    )
  ) {
    return null;
  }

  const [
    year,
    month,
    day,
  ] =
    text
      .split("-")
      .map(Number);

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function startOfUtcDay(value) {
  const date =
    value instanceof Date
      ? value
      : new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return startOfUtcDay(
      new Date()
    );
  }

  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate()
    )
  );
}

export function detectBankingComplaintType({
  bankingComplaintType = "",
  complaint = "",
} = {}) {
  const explicit =
    normalize(
      bankingComplaintType
    );

  const text =
    normalize(
      complaint
    );

  const loanSignals = [
    "loan",
    "credit facility",
    "overdraft",
    "mortgage",
    "repayment",
    "interest on loan",
  ];

  const excessChargeSignals = [
    "excess charge",
    "excess charges",
    "unapproved charge",
    "unapproved charges",
    "unauthorised charge",
    "unauthorised charges",
    "unauthorized charge",
    "unauthorized charges",
    "wrongful charge",
    "wrongful charges",
  ];

  if (
    explicit === "loan" ||
    explicit === "loan or credit" ||
    explicit === "loan_or_credit" ||
    loanSignals.some(
      signal =>
        explicit.includes(signal)
    )
  ) {
    return "loan_or_credit";
  }

  if (
    explicit === "excess charge" ||
    explicit === "excess charges" ||
    explicit === "excess_charge" ||
    explicit === "excess_charges" ||
    excessChargeSignals.some(
      signal =>
        explicit.includes(signal)
    )
  ) {
    return "excess_charges";
  }

  if (
    loanSignals.some(
      signal =>
        text.includes(signal)
    )
  ) {
    return "loan_or_credit";
  }

  if (
    excessChargeSignals.some(
      signal =>
        text.includes(signal)
    )
  ) {
    return "excess_charges";
  }

  return "general_banking";
}

export function bankingWaitingPeriodDays(
  complaintType
) {
  return [
    "loan_or_credit",
    "excess_charges",
  ].includes(
    complaintType
  )
    ? BANKING_EXTENDED_WAITING_DAYS
    : BANKING_GENERAL_WAITING_DAYS;
}

export function evaluateBankingComplaintTiming({
  complaint = "",
  escalationStage = "",
  priorComplaintReference = "",
  priorComplaintDate = "",
  bankingComplaintType = "",
  providerResponseStatus = "",
  hasPriorComplaint = false,
  asOfDate = new Date(),
} = {}) {
  const normalizedStage =
    normalize(
      escalationStage
    );

  const complaintType =
    detectBankingComplaintType({
      bankingComplaintType,
      complaint,
    });

  const waitingPeriodDays =
    bankingWaitingPeriodDays(
      complaintType
    );

  const reference =
    String(
      priorComplaintReference || ""
    ).trim();

  const complaintDateText =
    cleanDateValue(
      priorComplaintDate
    );

  const prior =
    hasPriorComplaint ||
    !INITIAL_STAGES.has(
      normalizedStage
    ) ||
    Boolean(reference) ||
    Boolean(complaintDateText);

  const common = {
    complaintType,
    waitingPeriodDays,

    providerResponseStatus:
      normalize(
        providerResponseStatus
      ),

    priorComplaintReferenceProvided:
      Boolean(reference),

    priorComplaintDate:
      complaintDateText,

    escalationEligible:
      false,

    daysElapsed:
      null,

    daysRemaining:
      waitingPeriodDays,

    requiresPriorComplaintReference:
      false,

    requiresPriorComplaintDate:
      false,

    dateInvalid:
      false,
  };

  if (!prior) {
    return {
      ...common,

      stage:
        "provider_initial",

      routeKey:
        "bank_provider_first",

      routeTo:
        "provider",
    };
  }

  const requiresReference =
    !reference;

  const requiresDate =
    !complaintDateText;

  if (
    requiresReference ||
    requiresDate
  ) {
    return {
      ...common,

      stage:
        "provider_escalation_information_required",

      routeKey:
        "bank_provider_escalation_information_required",

      routeTo:
        "provider",

      requiresPriorComplaintReference:
        requiresReference,

      requiresPriorComplaintDate:
        requiresDate,
    };
  }

  const complaintDate =
    parseIsoDate(
      complaintDateText
    );

  const today =
    startOfUtcDay(
      asOfDate
    );

  if (!complaintDate) {
    return {
      ...common,

      stage:
        "provider_complaint_date_invalid",

      routeKey:
        "bank_provider_complaint_date_invalid",

      routeTo:
        "provider",

      requiresPriorComplaintDate:
        true,

      dateInvalid:
        true,
    };
  }

  const daysElapsed =
    Math.floor(
      (
        today.getTime() -
        complaintDate.getTime()
      ) /
      DAY_MS
    );

  if (daysElapsed < 0) {
    return {
      ...common,

      stage:
        "provider_complaint_date_in_future",

      routeKey:
        "bank_provider_complaint_date_invalid",

      routeTo:
        "provider",

      requiresPriorComplaintDate:
        true,

      dateInvalid:
        true,

      daysElapsed,

      daysRemaining:
        waitingPeriodDays,
    };
  }

  const daysRemaining =
    Math.max(
      waitingPeriodDays -
      daysElapsed,
      0
    );

  if (
    daysElapsed <
    waitingPeriodDays
  ) {
    return {
      ...common,

      stage:
        "provider_follow_up_pending",

      routeKey:
        "bank_provider_follow_up",

      routeTo:
        "provider",

      daysElapsed,
      daysRemaining,
    };
  }

  return {
    ...common,

    stage:
      "cbn_escalation_ready",

    routeKey:
      "cbn_consumer_protection",

    routeTo:
      "cbn",

    escalationEligible:
      true,

    daysElapsed,

    daysRemaining: 0,
  };
}

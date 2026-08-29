const ISSUE_RULES = Object.freeze([
  {
    id: "fatality_or_serious_harm",
    label: "Death or serious harm",
    severity: "critical",
    signals: [
      "death", "died", "deceased", "killed", "fatal", "loss of life",
      "serious injury", "permanent injury", "life threatening",
    ],
  },
  {
    id: "criminal_justice_process",
    label: "Criminal investigation or prosecution",
    severity: "critical",
    signals: [
      "criminal case", "criminal investigation", "prosecution", "prosecutor",
      "police investigation", "high court", "murder", "homicide", "manslaughter",
      "autopsy", "coroner", "charge sheet", "criminal trial",
    ],
  },
  {
    id: "human_rights",
    label: "Human-rights concern",
    severity: "high",
    signals: [
      "human rights", "unlawful detention", "arbitrary detention", "torture",
      "inhuman treatment", "degrading treatment", "discrimination",
      "right to life", "freedom of expression", "fundamental right",
    ],
  },
  {
    id: "professional_misconduct",
    label: "Professional misconduct",
    severity: "high",
    signals: [
      "professional misconduct", "lecturer misconduct", "teacher misconduct",
      "doctor misconduct", "nurse misconduct", "medical negligence", "malpractice",
      "unethical conduct", "disciplinary proceedings", "professional negligence",
    ],
  },
  {
    id: "corruption_or_fraud",
    label: "Corruption or suspected fraud",
    severity: "high",
    signals: [
      "corruption", "bribery", "bribe", "kickback", "embezzlement",
      "misappropriation", "fraud", "fraudulent", "forgery", "diversion of funds",
    ],
  },
  {
    id: "financial_transaction",
    label: "Financial transaction or deduction",
    severity: "medium",
    signals: [
      "loan", "deduction", "debit", "repayment", "mandate", "disbursement",
      "bank account", "payroll", "remita", "interest", "charge", "refund",
    ],
  },
  {
    id: "education_administration",
    label: "Education administration",
    severity: "medium",
    signals: [
      "university", "polytechnic", "college", "school", "student", "lecturer",
      "admission", "examination", "certificate", "academic", "registrar",
    ],
  },
  {
    id: "healthcare",
    label: "Healthcare or professional health regulation",
    severity: "medium",
    signals: [
      "hospital", "clinic", "patient", "treatment", "medical", "doctor", "nurse",
      "nursing", "midwife", "midwifery", "pharmacy", "health insurance", "hmo", "nhia",
    ],
  },
  {
    id: "security_or_law_enforcement",
    label: "Security or law-enforcement conduct",
    severity: "high",
    signals: [
      "police", "soldier", "security agency", "arrest", "detention", "custody",
      "investigating officer", "use of force", "threat to life",
    ],
  },
  {
    id: "public_service_delivery",
    label: "Public-service delivery or administrative inaction",
    severity: "medium",
    signals: [
      "public service", "government agency", "administrative delay",
      "public officer refused to act", "ministry failed to respond",
      "agency failed to respond", "government inaction",
    ],
  },
  {
    id: "consumer_service",
    label: "Consumer service or product dispute",
    severity: "medium",
    signals: [
      "consumer", "customer", "service provider", "poor service", "billing dispute",
      "defective product", "subscription", "merchant", "warranty", "lender",
      "borrower", "loan agreement", "debt collector", "debt collection",
      "credit bureau", "consumer protection",
    ],
  },
  {
    id: "data_privacy",
    label: "Personal-data or privacy concern",
    severity: "high",
    signals: [
      "personal data", "financial information", "data protection", "privacy",
      "unauthorised disclosure", "unauthorized disclosure", "disclosed my",
      "credit bureau", "third party debt collector", "third-party debt collector",
    ],
  },
  {
    id: "debt_collection",
    label: "Debt-collection or credit-reporting conduct",
    severity: "high",
    signals: [
      "debt collector", "debt collection", "debt-collection", "credit bureau",
      "credit report", "adverse credit", "threatened arrest", "default listing",
    ],
  },
  {
    id: "active_court_process",
    label: "Active court process",
    severity: "critical",
    signals: [
      "pending before the court", "pending in court", "case is in court",
      "case before the high court", "before the high court", "before high court", "pending case",
      "case remains pending", "court proceeding remains pending", "court proceedings remain pending",
      "pending court proceeding", "pending court proceedings", "suit no", "suit number",
      "magistrate court", "magistrates court", "preliminary objection",
      "appeal is pending", "notice of appeal", "ongoing trial", "sub judice",
    ],
  },
]);

const SEVERITY_RANK = Object.freeze({ low: 1, medium: 2, high: 3, critical: 4 });

function clean(value, maxLength = 10000) {
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

function containsSignal(text, signal) {
  const source = ` ${normalize(text)} `;
  const target = ` ${normalize(signal)} `;
  return target.trim() && source.includes(target);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function analyzeComplexComplaint({
  complaint = "",
  institutionName = "",
  issueLocation = "",
  escalationStage = "",
  priorComplaintReference = "",
} = {}) {
  const narrative = clean(complaint);
  const combined = [institutionName, narrative].filter(Boolean).join(" ");

  const issues = ISSUE_RULES
    .map(rule => {
      const evidence = rule.signals.filter(signal => containsSignal(combined, signal));
      return evidence.length
        ? {
            id: rule.id,
            label: rule.label,
            severity: rule.severity,
            evidence: evidence.slice(0, 6),
          }
        : null;
    })
    .filter(Boolean);

  const highestSeverity = issues.reduce(
    (highest, issue) =>
      SEVERITY_RANK[issue.severity] > SEVERITY_RANK[highest]
        ? issue.severity
        : highest,
    "low"
  );

  const issueIds = new Set(issues.map(issue => issue.id));
  const critical = highestSeverity === "critical";
  const multiIssue = issues.length >= 2;
  const activeCourtProcess = issueIds.has("active_court_process");
  const deathOrSeriousHarm = issueIds.has("fatality_or_serious_harm");

  const clarificationQuestions = [];
  if (!clean(institutionName, 300)) {
    clarificationQuestions.push(
      "What is the exact name of the organisation, company, school, hospital, agency or person complained against?"
    );
  }
  if (!clean(issueLocation, 300)) {
    clarificationQuestions.push(
      "In which state, city or country did the main incident occur?"
    );
  }
  if (!clean(escalationStage, 100)) {
    clarificationQuestions.push(
      "Is this the first formal complaint, or was an earlier complaint left unresolved?"
    );
  }
  if (
    clean(escalationStage, 100).toLowerCase() === "unresolved" &&
    !clean(priorComplaintReference, 150)
  ) {
    clarificationQuestions.push(
      "Was a reference number or written acknowledgement issued for the earlier complaint?"
    );
  }
  if (deathOrSeriousHarm) {
    clarificationQuestions.push(
      "Which authority has already investigated the death or serious harm, and is there an active court or prosecution file?"
    );
  }

  const draftingSafeguards = unique([
    "Treat disputed accusations as allegations unless an official finding is supplied.",
    "Do not invent institutions, evidence, dates, legal provisions or procedural outcomes.",
    critical
      ? "Separate administrative requests from criminal, court or emergency processes."
      : "",
    deathOrSeriousHarm
      ? "Do not imply that an administrative petition determines criminal responsibility for a death."
      : "",
    activeCourtProcess
      ? "Do not present a petition as a substitute for a court filing, appeal or instruction from qualified counsel."
      : "",
  ]);

  return {
    version: "1.0.0",
    complexity: critical ? "critical" : multiIssue ? "complex" : "standard",
    highestSeverity,
    multiIssue,
    critical,
    activeCourtProcess,
    issues,
    issueIds: [...issueIds],
    clarificationQuestions: unique(clarificationQuestions),
    draftingSafeguards,
  };
}

export function formatComplexityForPrompt(profile = {}) {
  const issues = Array.isArray(profile.issues) ? profile.issues : [];
  const safeguards = Array.isArray(profile.draftingSafeguards)
    ? profile.draftingSafeguards
    : [];

  return [
    `COMPLEXITY LEVEL: ${clean(profile.complexity || "standard", 50)}`,
    "IDENTIFIED ISSUE DIMENSIONS:",
    ...(issues.length
      ? issues.map(issue =>
          `- ${issue.label} (${issue.severity}); signals: ${(issue.evidence || []).join(", ")}`
        )
      : ["- No specialist dimension was deterministically identified."]),
    "MANDATORY DRAFTING SAFEGUARDS:",
    ...safeguards.map(rule => `- ${rule}`),
  ].join("\n");
}

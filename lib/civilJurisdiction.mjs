import {
  ABUJA_MULTI_DOOR_COURT,
  LAGOS_CITIZENS_MEDIATION_BUREAU,
  LAGOS_MULTI_DOOR_COURTHOUSE,
  RELEVANT_STATE_ADR_CENTRE,
  RELEVANT_SMALL_CLAIMS_OR_MAGISTRATES_COURT,
} from "./nigeriaCivilDisputesRegistry.mjs";

const STRONG_TENANCY_PATTERNS = [
  /\blandlord\b/i,
  /\btenant\b/i,
  /\btenancy\b/i,
  /\bquit notice\b/i,
  /\beviction notice\b/i,
  /\brent increase\b/i,
  /\bhouse rent\b/i,
  /\brent dispute\b/i,
  /\brent arrears\b/i,
  /\bunpaid rent\b/i,
  /\brented apartment\b/i,
  /\brented house\b/i,
  /\btenancy agreement\b/i,
  /\blease agreement\b/i,
  /\brental agreement\b/i,
  /\bproperty manager\b/i,
  /\bsecurity deposit\b/i,
  /\brent deposit\b/i,
  /\bcaution fee\b/i,
  /\blandlord refused repairs\b/i,
  /\blocked out by landlord\b/i,
];

const PRIVATE_DEBT_PATTERNS = [
  /\bprivate debt\b/i,
  /\bpersonal debt\b/i,
  /\bunpaid personal loan\b/i,
  /\brefused to repay(?: my| the| our)? (?:personal )?loan\b/i,
  /\bhas refused to repay(?: my| the| our)? (?:personal )?loan\b/i,
  /\bfailed to repay(?: my| the| our)? (?:personal )?loan\b/i,
  /\bdid not repay(?: my| the| our)? (?:personal )?loan\b/i,
  /\bowes me money\b/i,
  /\bmoney owed by (an )?individual\b/i,
  /\bdebt recovery\b/i,
  /\bmonetary claim\b/i,
  /\bloan repayment dispute\b/i,
  /\bpayment dispute between individuals\b/i,
  /\bpayment dispute between businesses\b/i,
];

const PRIVATE_CONTRACT_PATTERNS = [
  /\bbreach of private contract\b/i,
  /\bbreach of agreement\b/i,
  /\bbreached (?:my|our|the|a) (?:private )?(?:contract|agreement)\b/i,
  /\bhas breached (?:my|our|the|a) (?:private )?(?:contract|agreement)\b/i,
  /\bfailed to honour (?:my|our|the|a) (?:contract|agreement)\b/i,
  /\bfailed to honor (?:my|our|the|a) (?:contract|agreement)\b/i,
  /\bcontract dispute\b/i,
  /\bsale agreement dispute\b/i,
  /\bpurchase agreement dispute\b/i,
  /\bfailed private agreement\b/i,
  /\bmemorandum of understanding dispute\b/i,
  /\bmou dispute\b/i,
  /\bbusiness partnership dispute\b/i,
  /\bpartnership disagreement\b/i,
  /\bshareholder private dispute\b/i,
];

const PROPERTY_PATTERNS = [
  /\bneighbou?r dispute\b/i,
  /\bboundary dispute\b/i,
  /\bproperty boundary dispute\b/i,
  /\bshared property dispute\b/i,
  /\bland ownership dispute\b/i,
  /\bpossession dispute\b/i,
  /\bfamily property dispute\b/i,
];

const FAMILY_OR_INHERITANCE_PATTERNS = [
  /\binheritance dispute\b/i,
  /\bfamily property dispute\b/i,
  /\bestate distribution dispute\b/i,
  /\bbeneficiary dispute\b/i,
  /\bprobate settlement dispute\b/i,
];

const CIVIL_ADR_PATTERNS = [
  /\bprivate civil dispute\b/i,
  /\bcivil dispute\b/i,
  /\bcivil claim\b/i,
  /\bsmall claims court\b/i,
  /\bsmall claim court\b/i,
  /\bdebtor\b/i,
  /\bcreditor\b/i,
  /\bcourt action for debt\b/i,
  /\bdebt claim\b/i,
  /\bcivil mediation\b/i,
  /\balternative dispute resolution\b/i,
  /\bmediation request\b/i,
  /\bsettlement request\b/i,
  /\bdemand letter\b/i,
  /\bletter before action\b/i,
  /\bnotice of demand\b/i,
  /\bsettlement agreement\b/i,
  /\bmediation agreement\b/i,
  /\bcommercial mediation\b/i,
];

const REGULATED_SECTOR_PATTERNS = [
  /\belectricity\b/i,
  /\bdisco\b/i,
  /\bnerc\b/i,
  /\bmeter\b/i,
  /\bbank transfer\b/i,
  /\bcommercial bank\b/i,
  /\bcentral bank\b/i,
  /\bcbn\b/i,
  /\bairline\b/i,
  /\bflight\b/i,
  /\baviation\b/i,
  /\btelecom\b/i,
  /\bmobile network\b/i,
  /\bncc\b/i,
  /\bhospital\b/i,
  /\bmedical negligence\b/i,
  /\bhealth insurance\b/i,
  /\buniversity admission\b/i,
  /\bexamination result\b/i,
  /\bpolice misconduct\b/i,
  /\bcorruption\b/i,
  /\bbribery\b/i,
];

const COURT_PROCESS_PATTERNS = [
  /\bsmall claims court\b/i,
  /\bmagistrates court\b/i,
  /\bmagistrate court\b/i,
  /\bdistrict court\b/i,
  /\barea court\b/i,
  /\bcourt registry\b/i,
  /\bfile a lawsuit\b/i,
  /\bcommence legal action\b/i,
  /\bcommence court action\b/i,
  /\bseek judgment\b/i,
  /\bcourt order\b/i,
  /\bpossession order\b/i,
  /\beviction order\b/i,
  /\binjunction\b/i,
  /\bmediation failed\b/i,
  /\bmediation was unsuccessful\b/i,
  /\brefused mediation\b/i,
];

const FCT_PATTERNS = [
  /\bfct\b/i,
  /\babuja\b/i,
  /\bkubwa\b/i,
  /\bgwarinpa\b/i,
  /\bgarki\b/i,
  /\bwuse\b/i,
  /\bmaitama\b/i,
  /\basokoro\b/i,
  /\bjabi\b/i,
  /\bapo\b/i,
  /\blugbe\b/i,
  /\bkuje\b/i,
  /\bbwari\b/i,
  /\bgwagwalada\b/i,
  /\bnyanya\b/i,
  /\bjikwoyi\b/i,
];

const LAGOS_PATTERNS = [
  /\blagos\b/i,
  /\bikeja\b/i,
  /\blekki\b/i,
  /\bajah\b/i,
  /\bsurulere\b/i,
  /\byaba\b/i,
  /\bikorodu\b/i,
  /\bepe\b/i,
  /\bbadagry\b/i,
  /\balimosho\b/i,
  /\bagege\b/i,
  /\beti[\s-]?osa\b/i,
  /\bapapa\b/i,
  /\boshodi\b/i,
];

function clean(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesAny(
  text,
  patterns
) {
  return patterns.some(
    pattern =>
      pattern.test(text)
  );
}

function authorityChannel(
  authority
) {
  const contact =
    authority?.contact || {};

  return {
    deliveryMethod:
      authority.dynamic_route
        ? authority.court_route
          ? "official_dynamic_court_registry"
          : "official_dynamic_adr_registry"
        : authority.verification
            .direct_email_verified
        ? "verified_email_or_walk_in"
        : "official_registry_or_walk_in",

    emailRoutingExpected:
      Boolean(
        authority.verification
          .direct_email_verified
      ) &&
      !authority.dynamic_route,

    contactEmails:
      authority.verification
        .direct_email_verified &&
      !authority.dynamic_route &&
      Array.isArray(contact.emails)
        ? [...contact.emails]
        : [],

    contactPhoneNumbers:
      Array.isArray(contact.phones)
        ? [...contact.phones]
        : [],

    contactAddress:
      contact.address || "",

    submissionUrl:
      contact.filing_guidance ||
      contact.judiciary_contact ||
      contact.office_directory ||
      contact.parent_court_contact ||
      contact.website ||
      "",

    sourceUrls:
      authority.verification
        .source_urls,
  };
}

export function isLandlordTenantDispute(
  complaint
) {
  return matchesAny(
    clean(complaint),
    STRONG_TENANCY_PATTERNS
  );
}

export function isCivilDispute(
  complaint
) {
  const text =
    clean(complaint);

  if (!text) {
    return false;
  }

  if (
    matchesAny(
      text,
      REGULATED_SECTOR_PATTERNS
    ) &&
    !matchesAny(
      text,
      [
        ...STRONG_TENANCY_PATTERNS,
        ...PRIVATE_DEBT_PATTERNS,
        ...PRIVATE_CONTRACT_PATTERNS,
        ...PROPERTY_PATTERNS,
        ...FAMILY_OR_INHERITANCE_PATTERNS,
      ]
    )
  ) {
    return false;
  }

  return matchesAny(
    text,
    [
      ...STRONG_TENANCY_PATTERNS,
      ...PRIVATE_DEBT_PATTERNS,
      ...PRIVATE_CONTRACT_PATTERNS,
      ...PROPERTY_PATTERNS,
      ...FAMILY_OR_INHERITANCE_PATTERNS,
      ...CIVIL_ADR_PATTERNS,
    ]
  );
}

export function detectCivilJurisdiction({
  disputeLocation = "",
  complaint = "",
  petitionerAddress = "",
} = {}) {
  const candidates = [
    {
      value:
        clean(disputeLocation),
      source:
        "dispute_location",
    },
    {
      value:
        clean(complaint),
      source:
        "complaint",
    },
    {
      value:
        clean(petitionerAddress),
      source:
        "petitioner_address",
    },
  ];

  for (
    const candidate
    of candidates
  ) {
    if (!candidate.value) {
      continue;
    }

    if (
      matchesAny(
        candidate.value,
        FCT_PATTERNS
      )
    ) {
      return {
        jurisdiction:
          "fct",

        source:
          candidate.source,
      };
    }

    if (
      matchesAny(
        candidate.value,
        LAGOS_PATTERNS
      )
    ) {
      return {
        jurisdiction:
          "lagos",

        source:
          candidate.source,
      };
    }
  }

  return {
    jurisdiction:
      "other",

    source:
      clean(disputeLocation)
        ? "dispute_location"
        : "unknown",
  };
}

function detectDisputeType(
  complaint
) {
  const text =
    clean(complaint);

  if (
    matchesAny(
      text,
      STRONG_TENANCY_PATTERNS
    )
  ) {
    return "landlord_tenant";
  }

  if (
    matchesAny(
      text,
      FAMILY_OR_INHERITANCE_PATTERNS
    )
  ) {
    return "inheritance_or_family_property";
  }

  if (
    matchesAny(
      text,
      PROPERTY_PATTERNS
    )
  ) {
    return "land_or_property";
  }

  if (
    matchesAny(
      text,
      PRIVATE_DEBT_PATTERNS
    )
  ) {
    return "private_debt";
  }

  if (
    matchesAny(
      text,
      PRIVATE_CONTRACT_PATTERNS
    )
  ) {
    return "private_contract";
  }

  return "general_civil";
}

function civilDecision({
  authority,
  jurisdiction,
  jurisdictionSource,
  routeKey,
  disputeType,
  documentPurpose,
  routingNote,
}) {
  return {
    matched: true,

    sector:
      "civil_disputes",

    caseType:
      "civil_dispute",

    disputeType,
    jurisdiction,

    jurisdictionSource,

    routeKey,

    primaryInstitution:
      authority.name,

    ccInstitutions: [],

    ...authorityChannel(
      authority
    ),

    documentPurpose,
    routingNote,
  };
}

export function resolveCivilRouting({
  complaint = "",
  disputeLocation = "",
  petitionerAddress = "",
} = {}) {
  if (
    !isCivilDispute(
      complaint
    )
  ) {
    return {
      matched: false,
    };
  }

  const text =
    clean(complaint);

  const disputeType =
    detectDisputeType(
      text
    );

  const location =
    detectCivilJurisdiction({
      disputeLocation,
      complaint,
      petitionerAddress,
    });

  const courtProcess =
    matchesAny(
      text,
      COURT_PROCESS_PATTERNS
    );

  const commercialOrComplex =
    matchesAny(
      text,
      [
        ...PRIVATE_CONTRACT_PATTERNS,
        /\bcommercial dispute\b/i,
        /\bcommercial mediation\b/i,
        /\bbusiness partnership\b/i,
        /\bshareholder\b/i,
        /\blagos multi[\s-]?door\b/i,
        /\blmdc\b/i,
      ]
    );

  if (
    location.jurisdiction ===
      "fct"
  ) {
    if (courtProcess) {
      return civilDecision({
        authority:
          RELEVANT_SMALL_CLAIMS_OR_MAGISTRATES_COURT,

        jurisdiction:
          "fct",

        jurisdictionSource:
          location.source,

        routeKey:
          "fct_small_claims_or_magistrates",

        disputeType,

        documentPurpose:
          "Preparation for filing a civil claim through the appropriate FCT court registry",

        routingNote:
          "Confirm the correct FCT court, monetary jurisdiction, venue, limitation period and filing requirements before commencing proceedings.",
      });
    }

    return civilDecision({
      authority:
        ABUJA_MULTI_DOOR_COURT,

      jurisdiction:
        "fct",

      jurisdictionSource:
        location.source,

      routeKey:
        "fct_amdc",

      disputeType,

      documentPurpose:
        "Request for mediation or alternative dispute resolution of a private civil dispute",

      routingNote:
        "File through the Abuja Multi-Door Court Registry. No verified direct AMDC intake email is presently used by this route.",
    });
  }

  if (
    location.jurisdiction ===
      "lagos"
  ) {
    if (courtProcess) {
      return civilDecision({
        authority:
          RELEVANT_SMALL_CLAIMS_OR_MAGISTRATES_COURT,

        jurisdiction:
          "lagos",

        jurisdictionSource:
          location.source,

        routeKey:
          "lagos_small_claims_or_magistrates",

        disputeType,

        documentPurpose:
          "Preparation for filing a civil claim through the appropriate Lagos court registry",

        routingNote:
          "Confirm the appropriate Lagos court, claim value, venue, limitation period and filing procedure through the official Lagos Judiciary.",
      });
    }

    if (commercialOrComplex) {
      return civilDecision({
        authority:
          LAGOS_MULTI_DOOR_COURTHOUSE,

        jurisdiction:
          "lagos",

        jurisdictionSource:
          location.source,

        routeKey:
          "lagos_lmdc",

        disputeType,

        documentPurpose:
          "Request for court-connected or independently referred ADR of a Lagos civil or commercial dispute",

        routingNote:
          "Use the official Lagos Judiciary or LMDC registry channel. No guessed LMDC email may be used.",
      });
    }

    return civilDecision({
      authority:
        LAGOS_CITIZENS_MEDIATION_BUREAU,

      jurisdiction:
        "lagos",

      jurisdictionSource:
        location.source,

      routeKey:
        "lagos_cmb",

      disputeType,

      documentPurpose:
        "Petition requesting mediation of a Lagos private civil dispute",

      routingNote:
        "The Lagos Citizens' Mediation Bureau accepts appropriate civil disputes through its verified petition, email, telephone and walk-in channels.",
    });
  }

  if (
    location.source ===
      "dispute_location"
  ) {
    if (courtProcess) {
      return civilDecision({
        authority:
          RELEVANT_SMALL_CLAIMS_OR_MAGISTRATES_COURT,

        jurisdiction:
          "other",

        jurisdictionSource:
          location.source,

        routeKey:
          "state_small_claims_or_magistrates",

        disputeType,

        documentPurpose:
          "Preparation for filing a civil claim through the appropriate state court registry",

        routingNote:
          "Resolve the correct court only through the official state judiciary. Confirm jurisdiction, venue, limitation period, claim value and filing procedure before filing.",
      });
    }

    return civilDecision({
      authority:
        RELEVANT_STATE_ADR_CENTRE,

      jurisdiction:
        "other",

      jurisdictionSource:
        location.source,

      routeKey:
        "state_adr_centre",

      disputeType,

      documentPurpose:
        "Request for mediation through the relevant official state ADR institution",

      routingNote:
        "Locate the relevant state Multi-Door Courthouse or mediation centre only through the official state judiciary or Ministry of Justice website.",
    });
  }

  return {
    matched: true,

    sector:
      "civil_disputes",

    caseType:
      "civil_dispute",

    disputeType,

    jurisdiction:
      "other",

    jurisdictionSource:
      "unknown",

    routeKey:
      "formal_notice",

    primaryInstitution:
      disputeType ===
        "landlord_tenant"
        ? "The Landlord or Property Manager"
        : "The Other Party to the Dispute",

    ccInstitutions: [],

    deliveryMethod:
      "personal_delivery_or_verified_private_contact",

    emailRoutingExpected:
      false,

    documentPurpose:
      "Formal notice and request for amicable resolution of a private civil dispute",

    routingNote:
      "No verified jurisdiction-specific institution was selected because the dispute location was not established. Deliver a formal notice to the other party, retain proof of delivery and obtain legal advice before court proceedings.",
  };
}

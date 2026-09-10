function clean(
  value,
  maxLength = 10000
) {
  return String(
    value || ""
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(
      0,
      maxLength
    );
}

function uniqueStrings(
  values
) {
  return [
    ...new Set(
      (
        Array.isArray(values)
          ? values
          : []
      )
        .map(
          value =>
            clean(
              value,
              1000
            )
        )
        .filter(Boolean)
    ),
  ];
}

function validEmail(
  value
) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    clean(
      value,
      320
    )
  );
}

function verifiedEmails(
  values
) {
  return uniqueStrings(
    values
  ).filter(
    validEmail
  );
}

function itemEmails(
  items
) {
  return verifiedEmails(
    (
      Array.isArray(items)
        ? items
        : []
    ).flatMap(
      item =>
        Array.isArray(
          item?.emails
        )
          ? item.emails
          : []
    )
  );
}

function itemNames(
  items
) {
  return uniqueStrings(
    (
      Array.isArray(items)
        ? items
        : []
    ).map(
      item =>
        item?.name
    )
  );
}

function officialUrls(
  values
) {
  return uniqueStrings(
    values
  ).filter(
    value =>
      /^https?:\/\//i.test(
        value
      )
  );
}

function normalizeInstitutionName(
  value
) {
  return clean(
    value,
    1000
  )
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchingCatalogItem(
  items,
  institutionName
) {
  const target =
    normalizeInstitutionName(
      institutionName
    );

  if (!target) {
    return null;
  }

  return (
    Array.isArray(items)
      ? items
      : []
  ).find(
    item => {
      const names = [
        item?.name,
        item?.shortName,
        item?.norm,
        item?.shortNorm,
        ...(
          Array.isArray(
            item?.aliases
          )
            ? item.aliases
            : []
        ),
        ...(
          Array.isArray(
            item?.aliasNorms
          )
            ? item.aliasNorms
            : []
        ),
        ...(
          Array.isArray(
            item?.shortAliasNorms
          )
            ? item.shortAliasNorms
            : []
        ),
      ];

      return names.some(
        value =>
          normalizeInstitutionName(
            value
          ) === target
      );
    }
  ) || null;
}

export function buildStructuredComplaintPrompt({
  complaint = "",
  institutionName = "",
  issueLocation = "",
  institutionLevel = "",
  escalationStage = "",
  priorComplaintReference = "",
  priorComplaintDate = "",
  bankingComplaintType = "",
  providerResponseStatus = "",
  supportingEvidence = "",
  desiredOutcome = "",
  country = "Nigeria",
} = {}) {
  const sections = [
    [
      "COMPLAINT NARRATIVE",
      clean(
        complaint,
        10000
      ),
    ],

    [
      "INSTITUTION COMPLAINED AGAINST",
      clean(
        institutionName,
        300
      ),
    ],

    [
      "ISSUE LOCATION",
      clean(
        issueLocation,
        300
      ),
    ],

    [
      "INSTITUTION LEVEL",
      clean(
        institutionLevel,
        100
      ),
    ],

    [
      "COMPLAINT STAGE",
      clean(
        escalationStage,
        100
      ),
    ],

    [
      "PREVIOUS COMPLAINT REFERENCE",
      clean(
        priorComplaintReference,
        150
      ),
    ],

    [
      "PREVIOUS COMPLAINT DATE",
      clean(
        priorComplaintDate,
        20
      ),
    ],

    [
      "BANKING COMPLAINT TYPE",
      clean(
        bankingComplaintType,
        100
      ),
    ],

    [
      "PROVIDER RESPONSE STATUS",
      clean(
        providerResponseStatus,
        100
      ),
    ],

    [
      "SUPPORTING EVIDENCE AVAILABLE",
      clean(
        supportingEvidence,
        4000
      ),
    ],

    [
      "DESIRED OUTCOME OR RELIEF",
      clean(
        desiredOutcome,
        2000
      ),
    ],

    [
      "COUNTRY",
      clean(
        country || "Nigeria",
        100
      ) || "Nigeria",
    ],
  ];

  return [
    "Use only the facts supplied below. Do not invent missing facts, dates, identities, references, evidence or legal conclusions.",

    ...sections
      .filter(
        (
          [heading, value]
        ) =>
          heading ===
            "COMPLAINT NARRATIVE" ||
          heading ===
            "COUNTRY" ||
          Boolean(value)
      )
      .map(
        (
          [heading, value]
        ) =>
          `${heading}:\n${value}`
      ),
  ].join(
    "\n\n"
  );
}

export function resolveDeliveryPlan({
  routingDecision = null,
  catalogToItems = [],
  catalogCcItems = [],
  legacyToEmails = [],
  legacyToInstitutions = [],
  legacyCcInstitutions = [],
  legacyAdminCc = [],
} = {}) {
  const matched =
    routingDecision?.matched ===
    true;

  const firstCatalogItem =
    Array.isArray(
      catalogToItems
    )
      ? catalogToItems[0] ||
        null
      : null;

  if (matched) {
    const primaryInstitution =
      clean(
        routingDecision
          ?.primaryInstitution,
        500
      );

    const deliveryMethod =
      clean(
        routingDecision
          ?.deliveryMethod,
        300
      );

    const emailExpected =
      routingDecision
        ?.emailRoutingExpected ===
      true;

    const emailDeliveryPermitted =
      emailExpected ||
      /(^|_)email(_|$)/i.test(
        deliveryMethod
      ) ||
      deliveryMethod ===
        "official_institution_channel_resolution_required";

    const resolverEmails =
      emailDeliveryPermitted
        ? verifiedEmails(
            routingDecision
              ?.contactEmails
          )
        : [];

    /*
     * Catalogue recovery is exact-recipient only.  Never use the first
     * catalogue record merely because the route matched.
     */
    const catalogPrimaryItem =
      matchingCatalogItem(
        catalogToItems,
        primaryInstitution
      );

    const catalogPrimaryEmails =
      emailDeliveryPermitted &&
      catalogPrimaryItem
        ? itemEmails([
            catalogPrimaryItem,
          ])
        : [];

    const toEmails =
      verifiedEmails([
        ...resolverEmails,
        ...catalogPrimaryEmails,
      ]);

    const contactAddress =
      clean(
        routingDecision
          ?.contactAddress,
        1000
      ) ||
      clean(
        catalogPrimaryItem
          ?.primaryAddress,
        1000
      );

    const submissionUrl =
      clean(
        routingDecision
          ?.submissionUrl,
        2000
      );

    const contactPhoneNumbers =
      uniqueStrings(
        routingDecision
          ?.contactPhoneNumbers
      );

    const sourceUrls =
      officialUrls(
        routingDecision
          ?.sourceUrls
      );

    const ccInstitutions =
      uniqueStrings(
        routingDecision
          ?.ccInstitutions
      );

    const ccEmails =
      itemEmails(
        catalogCcItems
      );

    const emailRoutingAvailable =
      toEmails.length >
      0;

    const portalRoutingAvailable =
      /^https?:\/\//i.test(
        submissionUrl
      );

    const physicalRoutingAvailable =
      Boolean(
        contactAddress
      );

    const primaryItem =
      primaryInstitution
        ? {
            ...(
              catalogPrimaryItem ||
              {}
            ),

            name:
              primaryInstitution,

            emails:
              toEmails,

            primaryAddress:
              contactAddress,

            addresses:
              contactAddress
                ? [
                    contactAddress,
                  ]
                : [],
          }
        : null;

    return {
      matched: true,

      toInstitutions:
        primaryInstitution
          ? [
              primaryInstitution,
            ]
          : [],

      ccInstitutions,

      toEmails,

      ccEmails,

      emailRoutingAvailable,

      primaryItem,

      submissionRoute: {
        deliveryMethod,

        emailRoutingExpected:
          emailExpected,

        emailRoutingAvailable,

        portalRoutingAvailable,

        physicalRoutingAvailable,

        submissionUrl,

        contactAddress,

        contactPhoneNumbers,

        contactEmails:
          toEmails,

        sourceUrls,

        routingNote:
          clean(
            routingDecision
              ?.routingNote,
            3000
          ),
      },
    };
  }

  const toEmails =
    verifiedEmails([
      ...itemEmails(
        catalogToItems
      ),

      ...(
        Array.isArray(
          legacyToEmails
        )
          ? legacyToEmails
          : []
      ),
    ]);

  const ccEmails =
    verifiedEmails([
      ...itemEmails(
        catalogCcItems
      ),

      ...(
        Array.isArray(
          legacyAdminCc
        )
          ? legacyAdminCc
          : []
      ),
    ]);

  const toInstitutions =
    uniqueStrings([
      ...itemNames(
        catalogToItems
      ),

      ...(
        Array.isArray(
          legacyToInstitutions
        )
          ? legacyToInstitutions
          : []
      ),
    ]);

  const ccInstitutions =
    uniqueStrings([
      ...itemNames(
        catalogCcItems
      ),

      ...(
        Array.isArray(
          legacyCcInstitutions
        )
          ? legacyCcInstitutions
          : []
      ),
    ]);

  const contactAddress =
    clean(
      firstCatalogItem
        ?.primaryAddress,
      1000
    );

  const sourceUrls =
    officialUrls(
      firstCatalogItem
        ?.officialContactSources
    );

  const emailRoutingAvailable =
    toEmails.length > 0;

  const physicalRoutingAvailable =
    Boolean(
      contactAddress
    );

  return {
    matched: false,

    toInstitutions,

    ccInstitutions,

    toEmails,

    ccEmails,

    emailRoutingAvailable,

    primaryItem:
      firstCatalogItem,

    submissionRoute: {
      deliveryMethod:
        emailRoutingAvailable
          ? "verified_email"
          : physicalRoutingAvailable
          ? "verified_physical_address"
          : "official_institution_channel_resolution_required",

      emailRoutingExpected:
        emailRoutingAvailable,

      emailRoutingAvailable,

      portalRoutingAvailable:
        false,

      physicalRoutingAvailable,

      submissionUrl: "",

      contactAddress,

      contactPhoneNumbers:
        [],

      contactEmails:
        toEmails,

      sourceUrls,

      routingNote: "",
    },
  };
}

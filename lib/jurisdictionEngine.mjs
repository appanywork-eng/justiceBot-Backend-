import {
  resolveCivilRouting,
} from "./civilJurisdiction.mjs";
import {
  resolveAviationRouting,
  resolveBankingRouting,
  resolvePowerRouting,
  resolveTelecomRouting,
} from "./regulatedSectorJurisdiction.mjs";
import {
  resolveEducationRouting,
  resolveHealthRouting,
  resolveJudiciaryRouting,
  resolveSecurityRouting,
} from "./publicInstitutionJurisdiction.mjs";

export const JURISDICTION_ENGINE_VERSION =
  "1.2.0";

const resolverRegistry =
  new Map();

function cleanText(
  value,
  maxLength = 500
) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeSector(
  value
) {
  return cleanText(
    value,
    100
  )
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
}

function normalizeInstitutionLevel(
  value
) {
  const normalized =
    cleanText(
      value,
      100
    )
      .toLowerCase()
      .replace(/[\s-]+/g, "_");

  const supported = new Set([
    "",
    "federal",
    "state",
    "local",
    "private",
    "private_regulated",
    "international",
    "unknown",
  ]);

  return supported.has(
    normalized
  )
    ? normalized
    : "unknown";
}

export function buildJurisdictionContext({
  sector = "",
  complaint = "",
  issueLocation = "",
  petitionerAddress = "",
  institutionName = "",
  institutionLevel = "",
  escalationStage = "",
  priorComplaintReference = "",
  country = "Nigeria",
} = {}) {
  return {
    sector:
      normalizeSector(
        sector
      ),

    complaint:
      cleanText(
        complaint,
        10000
      ),

    issueLocation:
      cleanText(
        issueLocation,
        300
      ),

    petitionerAddress:
      cleanText(
        petitionerAddress,
        300
      ),

    institutionName:
      cleanText(
        institutionName,
        300
      ),

    institutionLevel:
      normalizeInstitutionLevel(
        institutionLevel
      ),

    escalationStage:
      cleanText(
        escalationStage,
        100
      ),

    priorComplaintReference:
      cleanText(
        priorComplaintReference,
        150
      ),

    country:
      cleanText(
        country || "Nigeria",
        100
      ) || "Nigeria",
  };
}

function publicRoutingInputs(
  context
) {
  return {
    sector:
      context.sector,

    issueLocation:
      context.issueLocation,

    institutionName:
      context.institutionName,

    institutionLevel:
      context.institutionLevel,

    escalationStage:
      context.escalationStage,

    priorComplaintReferenceProvided:
      Boolean(
        context
          .priorComplaintReference
      ),

    country:
      context.country,
  };
}

export function registerJurisdictionResolver(
  sector,
  resolver,
  metadata = {}
) {
  const sectorKey =
    normalizeSector(
      sector
    );

  if (!sectorKey) {
    throw new Error(
      "Jurisdiction resolver sector is required."
    );
  }

  if (
    typeof resolver !==
    "function"
  ) {
    throw new Error(
      `Jurisdiction resolver for ${sectorKey} must be a function.`
    );
  }

  resolverRegistry.set(
    sectorKey,
    {
      sector:
        sectorKey,

      resolve:
        resolver,

      status:
        cleanText(
          metadata.status ||
            "active",
          50
        ),

      scope:
        cleanText(
          metadata.scope ||
            "sector_routing",
          200
        ),

      version:
        cleanText(
          metadata.version ||
            "1.0.0",
          50
        ),

      requiresVerifiedData:
        metadata
          .requiresVerifiedData !==
        false,
    }
  );
}

function runResolver(
  entry,
  context
) {
  if (!entry) {
    return {
      matched: false,
      sector:
        context.sector,
      engineVersion:
        JURISDICTION_ENGINE_VERSION,
      coverageStatus:
        "legacy_fallback",
      reason:
        "resolver_not_registered",
      routingInputs:
        publicRoutingInputs(
          context
        ),
    };
  }

  let rawDecision;

  try {
    rawDecision =
      entry.resolve(
        context
      );
  } catch (error) {
    return {
      matched: false,
      sector:
        context.sector,
      engineVersion:
        JURISDICTION_ENGINE_VERSION,
      coverageStatus:
        "safe_fallback",
      reason:
        "resolver_error",
      resolver:
        entry.sector,
      resolverError:
        cleanText(
          error?.message ||
            "Unknown resolver error",
          300
        ),
      routingInputs:
        publicRoutingInputs(
          context
        ),
    };
  }

  if (
    !rawDecision ||
    rawDecision.matched !==
      true
  ) {
    return {
      matched: false,
      sector:
        context.sector,
      engineVersion:
        JURISDICTION_ENGINE_VERSION,
      coverageStatus:
        entry.status,
      reason:
        rawDecision?.reason ||
        "no_jurisdiction_match",
      resolver:
        entry.sector,
      resolverVersion:
        entry.version,
      routingInputs:
        publicRoutingInputs(
          context
        ),
    };
  }

  return {
    ...rawDecision,

    matched: true,

    sector:
      rawDecision.sector ||
      context.sector,

    engineVersion:
      JURISDICTION_ENGINE_VERSION,

    coverageStatus:
      entry.status,

    resolver:
      entry.sector,

    resolverVersion:
      entry.version,

    routingInputs:
      publicRoutingInputs(
        context
      ),
  };
}

/*
 * Pre-sector resolvers are used only
 * where the complaint type must override
 * ordinary keyword sector detection.
 *
 * The existing landlord-tenant resolver
 * is the first registered override.
 */
export function resolvePreSectorJurisdiction({
  complaint = "",
  issueLocation = "",
  petitionerAddress = "",
  institutionName = "",
  institutionLevel = "",
  escalationStage = "",
  priorComplaintReference = "",
  country = "Nigeria",
} = {}) {
  const context =
    buildJurisdictionContext({
      sector:
        "civil_disputes",

      complaint,
      issueLocation,
      petitionerAddress,
      institutionName,
      institutionLevel,
      escalationStage,
      priorComplaintReference,
      country,
    });

  return runResolver(
    resolverRegistry.get(
      "civil_disputes"
    ),
    context
  );
}

export function resolveJurisdictionRouting({
  sector = "",
  complaint = "",
  issueLocation = "",
  petitionerAddress = "",
  institutionName = "",
  institutionLevel = "",
  escalationStage = "",
  priorComplaintReference = "",
  country = "Nigeria",
} = {}) {
  const context =
    buildJurisdictionContext({
      sector,
      complaint,
      issueLocation,
      petitionerAddress,
      institutionName,
      institutionLevel,
      escalationStage,
      priorComplaintReference,
      country,
    });

  return runResolver(
    resolverRegistry.get(
      context.sector
    ),
    context
  );
}

export function getJurisdictionCapabilities(
  sectors = []
) {
  const sectorKeys =
    [
      ...new Set([
        ...(
          Array.isArray(
            sectors
          )
            ? sectors
            : []
        )
          .map(
            normalizeSector
          )
          .filter(Boolean),

        ...resolverRegistry.keys(),
      ]),
    ].sort();

  const capabilities =
    sectorKeys.map(
      (sector) => {
        const entry =
          resolverRegistry.get(
            sector
          );

        if (!entry) {
          return {
            sector,
            status:
              "legacy_fallback",
            resolverVersion:
              null,
            scope:
              "Existing sector catalogue and AI-assisted institution matching",
            requiresVerifiedData:
              true,
          };
        }

        return {
          sector,
          status:
            entry.status,
          resolverVersion:
            entry.version,
          scope:
            entry.scope,
          requiresVerifiedData:
            entry
              .requiresVerifiedData,
        };
      }
    );

  return {
    engineVersion:
      JURISDICTION_ENGINE_VERSION,

    totalSectors:
      capabilities.length,

    activeResolvers:
      capabilities.filter(
        (item) =>
          item.status ===
          "active"
      ).length,

    legacyFallbackSectors:
      capabilities.filter(
        (item) =>
          item.status ===
          "legacy_fallback"
      ).length,

    sectors:
      capabilities,
  };
}

/*
 * Phase 1 active resolver:
 * landlord-tenant civil disputes.
 */
registerJurisdictionResolver(
  "civil_disputes",

  (context) =>
    resolveCivilRouting({
      complaint:
        context.complaint,

      disputeLocation:
        context.issueLocation,

      petitionerAddress:
        context
          .petitionerAddress,
    }),

  {
    status:
      "active",

    scope:
      "Landlord-tenant disputes with FCT, Lagos and formal-notice routing",

    version:
      "1.0.0",

    requiresVerifiedData:
      true,
  }
);

registerJurisdictionResolver(
  "power",
  resolvePowerRouting,
  {
    status: "active",
    scope:
      "Provider-first electricity complaints with state-regulator and NERC escalation",
    version: "1.0.0",
    requiresVerifiedData: true,
  }
);

registerJurisdictionResolver(
  "telecoms",
  resolveTelecomRouting,
  {
    status: "active",
    scope:
      "Provider-first telecommunications complaints with NCC portal escalation",
    version: "1.0.0",
    requiresVerifiedData: true,
  }
);

registerJurisdictionResolver(
  "banking",
  resolveBankingRouting,
  {
    status: "active",
    scope:
      "Financial-institution complaints with CBN Consumer Protection escalation",
    version: "1.0.0",
    requiresVerifiedData: true,
  }
);

registerJurisdictionResolver(
  "aviation",
  resolveAviationRouting,
  {
    status: "active",
    scope:
      "Airline and aviation-provider complaints with NCAA Consumer Protection escalation",
    version: "1.0.0",
    requiresVerifiedData: true,
  }
);

registerJurisdictionResolver(
  "health",
  resolveHealthRouting,
  {
    status: "active",
    scope:
      "Provider-first health complaints with NHIA, MDCN, NHRC and consumer escalation",
    version: "1.0.0",
    requiresVerifiedData: true,
  }
);

registerJurisdictionResolver(
  "education",
  resolveEducationRouting,
  {
    status: "active",
    scope:
      "Institution-first education complaints with examination and regulator-specific routing",
    version: "1.0.0",
    requiresVerifiedData: true,
  }
);

registerJurisdictionResolver(
  "security",
  resolveSecurityRouting,
  {
    status: "active",
    scope:
      "Agency, police-discipline, human-rights and urgent-security routing",
    version: "1.0.0",
    requiresVerifiedData: true,
  }
);

registerJurisdictionResolver(
  "judiciary",
  resolveJudiciaryRouting,
  {
    status: "active",
    scope:
      "Court administration, judicial discipline, rights and appeal-safety routing",
    version: "1.0.0",
    requiresVerifiedData: true,
  }
);

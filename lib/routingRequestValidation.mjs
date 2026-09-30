function plainObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function invalidField(label, maximum) {
  return {
    ok: false,
    error: `${label} must be a string not longer than ${maximum} characters.`,
    code: "invalid_routing_field",
  };
}

function cleanString(value, label, maximum) {
  if (value === undefined || value === null) {
    return { ok: true, value: "" };
  }

  if (typeof value !== "string") {
    return invalidField(label, maximum);
  }

  const cleaned = value.trim();
  if (cleaned.length > maximum) {
    return invalidField(label, maximum);
  }

  return { ok: true, value: cleaned };
}

export function validateRoutingResolveBody(body) {
  if (!plainObject(body)) {
    return {
      ok: false,
      error: "Routing request body must be a JSON object.",
      code: "invalid_routing_body",
    };
  }

  const petitioner = body.petitioner === undefined || body.petitioner === null
    ? {}
    : body.petitioner;

  if (!plainObject(petitioner)) {
    return {
      ok: false,
      error: "Petitioner must be a JSON object when supplied.",
      code: "invalid_petitioner",
    };
  }

  const fields = [
    ["complaint", "Complaint", 10000],
    ["sector", "Sector", 100],
    ["institutionName", "Institution name", 300],
    ["institutionLevel", "Institution level", 100],
    ["issueLocation", "Issue location", 300],
    ["disputeLocation", "Dispute location", 300],
    ["escalationStage", "Escalation stage", 100],
    ["priorComplaintReference", "Prior complaint reference", 150],
    ["priorComplaintDate", "Prior complaint date", 20],
    ["bankingComplaintType", "Banking complaint type", 100],
    ["providerResponseStatus", "Provider response status", 100],
    ["country", "Country", 100],
  ];

  const cleaned = {};
  for (const [key, label, maximum] of fields) {
    const result = cleanString(body[key], label, maximum);
    if (!result.ok) return result;
    cleaned[key] = result.value;
  }

  const address = cleanString(
    petitioner.address,
    "Petitioner address",
    300
  );
  if (!address.ok) return address;

  if (cleaned.complaint.length < 3) {
    return {
      ok: false,
      error: "Complaint is required for routing.",
      code: "invalid_routing_field",
    };
  }

  if (cleaned.institutionName.length < 2) {
    return {
      ok: false,
      error: "Institution name is required for safe routing.",
      code: "institution_required",
    };
  }

  const issueLocation = cleaned.issueLocation || cleaned.disputeLocation;
  if (issueLocation.length < 2) {
    return {
      ok: false,
      error: "Issue location is required for jurisdiction routing.",
      code: "issue_location_required",
    };
  }

  return {
    ok: true,
    value: {
      sector: cleaned.sector,
      complaint: cleaned.complaint,
      issueLocation,
      petitionerAddress: address.value,
      institutionName: cleaned.institutionName,
      institutionLevel: cleaned.institutionLevel,
      escalationStage: cleaned.escalationStage,
      priorComplaintReference: cleaned.priorComplaintReference,
      priorComplaintDate: cleaned.priorComplaintDate,
      bankingComplaintType: cleaned.bankingComplaintType,
      providerResponseStatus: cleaned.providerResponseStatus,
      country: cleaned.country || "Nigeria",
    },
  };
}

export function classifyJsonBodyError(error) {
  if (error?.type === "entity.too.large") {
    return {
      handled: true,
      status: 413,
      body: {
        ok: false,
        error: "Request body is too large.",
        code: "request_body_too_large",
      },
    };
  }

  if (error?.type === "entity.parse.failed") {
    return {
      handled: true,
      status: 400,
      body: {
        ok: false,
        error: "Request body contains invalid JSON.",
        code: "invalid_json_body",
      },
    };
  }

  return { handled: false };
}

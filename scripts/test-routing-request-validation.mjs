import assert from "node:assert/strict";

import {
  classifyJsonBodyError,
  validateRoutingResolveBody,
} from "../lib/routingRequestValidation.mjs";

function valid(overrides = {}) {
  return {
    complaint: "My electricity bill remains incorrect.",
    institutionName: "Abuja Electricity Distribution Company",
    issueLocation: "Kubwa, Abuja",
    sector: "power",
    institutionLevel: "private_regulated",
    escalationStage: "initial",
    priorComplaintReference: "",
    priorComplaintDate: "",
    bankingComplaintType: "",
    providerResponseStatus: "",
    country: "Nigeria",
    petitioner: {
      address: "Kubwa, Abuja",
    },
    ...overrides,
  };
}

const normalized = validateRoutingResolveBody(valid({
  complaint: "  My electricity bill remains incorrect.  ",
  institutionName: "  AEDC  ",
  issueLocation: "",
  disputeLocation: "  Kubwa, Abuja  ",
  sector: "  power  ",
  country: "  Nigeria  ",
  petitioner: { address: "  Kubwa, Abuja  " },
}));

assert.deepEqual(normalized, {
  ok: true,
  value: {
    sector: "power",
    complaint: "My electricity bill remains incorrect.",
    issueLocation: "Kubwa, Abuja",
    petitionerAddress: "Kubwa, Abuja",
    institutionName: "AEDC",
    institutionLevel: "private_regulated",
    escalationStage: "initial",
    priorComplaintReference: "",
    priorComplaintDate: "",
    bankingComplaintType: "",
    providerResponseStatus: "",
    country: "Nigeria",
  },
});

for (const [field, maximum] of [
  ["complaint", 10000],
  ["institutionName", 300],
  ["issueLocation", 300],
  ["sector", 100],
  ["institutionLevel", 100],
  ["escalationStage", 100],
  ["priorComplaintReference", 150],
  ["priorComplaintDate", 20],
  ["bankingComplaintType", 100],
  ["providerResponseStatus", 100],
  ["country", 100],
]) {
  assert.equal(
    validateRoutingResolveBody(valid({ [field]: "x".repeat(maximum) })).ok,
    true,
    `${field} must accept its documented boundary`
  );

  const over = validateRoutingResolveBody(
    valid({ [field]: "x".repeat(maximum + 1) })
  );
  assert.equal(over.ok, false, `${field} must reject oversized input`);
  assert.equal(over.code, "invalid_routing_field");
}

assert.equal(
  validateRoutingResolveBody(valid({
    petitioner: { address: "x".repeat(300) },
  })).ok,
  true
);
assert.equal(
  validateRoutingResolveBody(valid({
    petitioner: { address: "x".repeat(301) },
  })).code,
  "invalid_routing_field"
);

for (const body of [null, [], "not-an-object", 12]) {
  assert.deepEqual(validateRoutingResolveBody(body), {
    ok: false,
    error: "Routing request body must be a JSON object.",
    code: "invalid_routing_body",
  });
}

for (const [field, invalidValue] of [
  ["complaint", {}],
  ["institutionName", []],
  ["issueLocation", {}],
  ["sector", []],
  ["country", {}],
]) {
  const result = validateRoutingResolveBody(valid({ [field]: invalidValue }));
  assert.equal(result.ok, false, `${field} must reject non-string values`);
  assert.equal(result.code, "invalid_routing_field");
}

assert.deepEqual(
  validateRoutingResolveBody(valid({ petitioner: [] })),
  {
    ok: false,
    error: "Petitioner must be a JSON object when supplied.",
    code: "invalid_petitioner",
  }
);

assert.deepEqual(
  validateRoutingResolveBody(valid({ institutionName: " " })),
  {
    ok: false,
    error: "Institution name is required for safe routing.",
    code: "institution_required",
  }
);

assert.deepEqual(
  validateRoutingResolveBody(valid({ issueLocation: "", disputeLocation: "" })),
  {
    ok: false,
    error: "Issue location is required for jurisdiction routing.",
    code: "issue_location_required",
  }
);

const oversizedMixedPayload = validateRoutingResolveBody(valid({
  complaint: "security banking hospital electricity ".repeat(400),
  institutionName: "x".repeat(301),
  issueLocation: "y".repeat(301),
  sector: { malicious: true },
}));
assert.equal(oversizedMixedPayload.ok, false);
assert.equal(oversizedMixedPayload.code, "invalid_routing_field");

assert.deepEqual(
  classifyJsonBodyError({ type: "entity.too.large" }),
  {
    handled: true,
    status: 413,
    body: {
      ok: false,
      error: "Request body is too large.",
      code: "request_body_too_large",
    },
  }
);
assert.deepEqual(
  classifyJsonBodyError({ type: "entity.parse.failed" }),
  {
    handled: true,
    status: 400,
    body: {
      ok: false,
      error: "Request body contains invalid JSON.",
      code: "invalid_json_body",
    },
  }
);
assert.deepEqual(classifyJsonBodyError(new Error("other")), {
  handled: false,
});

console.log("✅ ROUTING DIAGNOSTIC INPUTS ARE TYPE-CHECKED AND BOUNDED");
console.log("✅ ROUTING REQUIRES INSTITUTION AND ISSUE LOCATION");
console.log("✅ OVERSIZED AND MALFORMED JSON ERRORS ARE SAFE AND STABLE");

import assert from "node:assert/strict";

const baseUrl = String(process.env.BASE_URL || "")
  .trim()
  .replace(/\/+$/, "");
const expectedRevision = String(
  process.env.EXPECTED_REVISION || ""
).trim();

if (!baseUrl) {
  throw new Error("BASE_URL is required");
}

async function readJson(pathname) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: {
      accept: "application/json",
      "user-agent": "petitiondesk-release-smoke/1.0",
    },
    signal: AbortSignal.timeout(15_000),
  });

  const body = await response.json().catch(() => null);

  assert.equal(response.ok, true, `${pathname} returned HTTP ${response.status}`);
  assert.ok(body && typeof body === "object", `${pathname} did not return JSON`);
  return body;
}

const health = await readJson("/health");
assert.equal(health.ok, true);
assert.equal(health.service, "petitiondesk-backend");

const readiness = await readJson("/ready");
assert.equal(readiness.ok, true);
assert.equal(readiness.ready, true);
assert.deepEqual(readiness.missing, []);

if (expectedRevision) {
  assert.equal(health.revision, expectedRevision, "health revision mismatch");
  assert.equal(readiness.revision, expectedRevision, "readiness revision mismatch");
}

const capabilities = await readJson("/routing/capabilities");
assert.equal(capabilities.ok, true);
assert.equal(capabilities.totalSectors, 16);
assert.equal(capabilities.activeResolvers, 16);
assert.equal(capabilities.legacyFallbackSectors, 0);
assert.equal(capabilities.sectors.length, 16);
assert.ok(
  capabilities.sectors.every((item) => item.status === "active"),
  "every production sector must use an active deterministic resolver"
);

console.log(JSON.stringify({
  ok: true,
  baseUrl,
  revision: health.revision,
  ready: readiness.ready,
  totalSectors: capabilities.totalSectors,
  activeResolvers: capabilities.activeResolvers,
}));

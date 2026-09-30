import assert from "node:assert/strict";

import {
  adminSessionStorageKey,
  PetitionRuntimeStore,
  RuntimeStoreUnavailableError,
} from "../lib/petitionRuntimeStore.mjs";

class FakeDurableStore {
  constructor() {
    this.values = new Map();
    this.claims = new Map();
    this.keys = [];
    this.fail = false;
  }

  check(key) {
    this.keys.push(String(key));
    if (this.fail) throw new Error("durable store offline");
  }

  async set(key, value) {
    this.check(key);
    this.values.set(String(key), String(value));
    return "OK";
  }

  async get(key) {
    this.check(key);
    return this.values.get(String(key)) ?? null;
  }

  async del(key) {
    this.check(key);
    this.values.delete(String(key));
    return 1;
  }

  async claim(key, value) {
    this.check(key);
    if (this.claims.has(String(key))) return false;
    this.claims.set(String(key), String(value));
    this.values.set(String(key), String(value));
    return true;
  }
}

let now = 1_000;
const memory = new PetitionRuntimeStore({
  store: null,
  ttlSeconds: 2,
  now: () => now,
  schedule: () => ({ unref() {} }),
});

await memory.putPetition("pd_local", { petition: "Local petition" });
assert.equal((await memory.getPetition("pd_local")).petition, "Local petition");
await memory.putTransactionId("pd_local", "flw-local-1");
assert.equal(await memory.getTransactionId("pd_local"), "flw-local-1");
await memory.markPaid("pd_local");
assert.equal(await memory.isPaid("pd_local"), true);
await memory.putUnlocked("pd_local", { ok: true, petition: "Unlocked" });
assert.equal((await memory.getUnlocked("pd_local")).petition, "Unlocked");
await memory.putAdminSession("secret-token");
assert.equal(await memory.hasAdminSession("secret-token"), true);
await memory.deletePetition("pd_local");
assert.equal(await memory.getPetition("pd_local"), null);

await memory.putPetition("pd_expiring", { petition: "Temporary" });
now = 3_001;
assert.equal(await memory.getPetition("pd_expiring"), null, "expired local records must disappear");

const firstLocalClaim = await memory.claimPaymentTransaction("flw-replay-1", "pd_a");
const sameLocalClaim = await memory.claimPaymentTransaction("flw-replay-1", "pd_a");
const conflictingLocalClaim = await memory.claimPaymentTransaction("flw-replay-1", "pd_b");
assert.deepEqual(firstLocalClaim, { ok: true, claimed: true, idempotent: false });
assert.deepEqual(sameLocalClaim, { ok: true, claimed: true, idempotent: true });
assert.deepEqual(conflictingLocalClaim, { ok: false, claimed: false, idempotent: false });

const durableBackend = new FakeDurableStore();
const durable = new PetitionRuntimeStore({
  store: durableBackend,
  ttlSeconds: 30,
});

await durable.putPetition("pd_durable", { petition: "Durable petition" });
assert.equal((await durable.getPetition("pd_durable")).petition, "Durable petition");
await durable.putTransactionId("pd_durable", "flw-durable-1");
assert.equal(await durable.getTransactionId("pd_durable"), "flw-durable-1");
await durable.markPaid("pd_durable");
assert.equal(await durable.isPaid("pd_durable"), true);
await durable.putUnlocked("pd_durable", { ok: true, petition: "Durable unlock" });
assert.equal((await durable.getUnlocked("pd_durable")).petition, "Durable unlock");
await durable.deletePetition("pd_durable");
assert.equal(await durable.getPetition("pd_durable"), null);

const firstDurableClaim = await durable.claimPaymentTransaction("flw-unique-1", "pd_a");
const sameDurableClaim = await durable.claimPaymentTransaction("flw-unique-1", "pd_a");
const conflictingDurableClaim = await durable.claimPaymentTransaction("flw-unique-1", "pd_b");
assert.deepEqual(firstDurableClaim, { ok: true, claimed: true, idempotent: false });
assert.deepEqual(sameDurableClaim, { ok: true, claimed: true, idempotent: true });
assert.deepEqual(conflictingDurableClaim, { ok: false, claimed: false, idempotent: false });

const bearer = "pdadm_super-secret-bearer-token";
const hashedKey = adminSessionStorageKey(bearer);
assert.match(hashedKey, /^pd:admin:[a-f0-9]{64}$/);
assert.doesNotMatch(hashedKey, /super-secret|pdadm_/);
await durable.putAdminSession(bearer);
assert.equal(await durable.hasAdminSession(bearer), true);
assert.ok(durableBackend.keys.includes(hashedKey));
assert.ok(durableBackend.keys.every((key) => !key.includes(bearer)));

const failedBackend = new FakeDurableStore();
const failedDurable = new PetitionRuntimeStore({ store: failedBackend, ttlSeconds: 30 });
failedBackend.fail = true;

for (const operation of [
  () => failedDurable.putPetition("pd_fail", { petition: "must not cache" }),
  () => failedDurable.getPetition("pd_fail"),
  () => failedDurable.deletePetition("pd_fail"),
  () => failedDurable.markPaid("pd_fail"),
  () => failedDurable.isPaid("pd_fail"),
  () => failedDurable.putUnlocked("pd_fail", { ok: true }),
  () => failedDurable.getUnlocked("pd_fail"),
  () => failedDurable.putTransactionId("pd_fail", "flw-fail"),
  () => failedDurable.getTransactionId("pd_fail"),
  () => failedDurable.claimPaymentTransaction("flw-fail", "pd_fail"),
  () => failedDurable.putAdminSession(bearer),
  () => failedDurable.hasAdminSession(bearer),
]) {
  await assert.rejects(operation, (error) =>
    error instanceof RuntimeStoreUnavailableError &&
    error.code === "runtime_store_unavailable"
  );
}

failedBackend.fail = false;
assert.equal(
  await failedDurable.getPetition("pd_fail"),
  null,
  "a failed durable write must never appear from a local fallback"
);
assert.equal(await failedDurable.getUnlocked("pd_fail"), null);

console.log("✅ LOCAL MODE EXPIRES AND ROUND-TRIPS ALL RUNTIME RECORD TYPES");
console.log("✅ DURABLE FAILURES PROPAGATE WITHOUT MEMORY FALLBACK");
console.log("✅ PAYMENT TRANSACTION CLAIMS ARE IDEMPOTENT AND CROSS-REFERENCE SAFE");
console.log("✅ ADMIN SESSION KEYS NEVER CONTAIN THE BEARER TOKEN");
console.log("✅ PETITION RUNTIME STORE CONTRACT PASSED");

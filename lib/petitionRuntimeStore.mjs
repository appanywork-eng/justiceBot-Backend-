import crypto from "node:crypto";

export class RuntimeStoreUnavailableError extends Error {
  constructor(message = "Runtime state storage is unavailable.", { cause } = {}) {
    super(message, { cause });
    this.name = "RuntimeStoreUnavailableError";
    this.code = "runtime_store_unavailable";
    this.status = 503;
  }
}

export function adminSessionStorageKey(token) {
  const digest = crypto
    .createHash("sha256")
    .update(String(token || "").trim())
    .digest("hex");

  return `pd:admin:${digest}`;
}

export class PetitionRuntimeStore {
  constructor({
    store = null,
    ttlSeconds = 7200,
    now = () => Date.now(),
    schedule = (callback, delay) => setTimeout(callback, delay),
  } = {}) {
    this.store = store;
    this.ttlSeconds = Math.max(Number(ttlSeconds) || 7200, 1);
    this.now = now;
    this.schedule = schedule;
    this.memory = store === null ? new Map() : null;
  }

  key(kind, value) {
    return `pd:${kind}:${String(value || "").trim()}`;
  }

  async durable(operation) {
    try {
      return await operation();
    } catch (cause) {
      throw new RuntimeStoreUnavailableError(undefined, { cause });
    }
  }

  putLocal(key, value, ttlSeconds = this.ttlSeconds) {
    const ttl = Math.max(Number(ttlSeconds) || this.ttlSeconds, 1);
    const expiresAt = this.now() + ttl * 1000;
    const record = { value: String(value), expiresAt };
    this.memory.set(key, record);

    const timer = this.schedule(() => {
      if (this.memory.get(key) === record) this.memory.delete(key);
    }, ttl * 1000);
    timer?.unref?.();
  }

  getLocal(key) {
    const record = this.memory.get(key);
    if (!record) return null;

    if (this.now() >= record.expiresAt) {
      this.memory.delete(key);
      return null;
    }

    return record.value;
  }

  async setValue(key, value, ttlSeconds = this.ttlSeconds) {
    const ttl = Math.max(Number(ttlSeconds) || this.ttlSeconds, 1);

    if (this.memory) {
      this.putLocal(key, value, ttl);
      return;
    }

    await this.durable(() =>
      this.store.set(key, String(value), "EX", ttl)
    );
  }

  async getValue(key) {
    if (this.memory) return this.getLocal(key);
    return this.durable(() => this.store.get(key));
  }

  async deleteValue(key) {
    if (this.memory) {
      this.memory.delete(key);
      return;
    }

    await this.durable(() => this.store.del(key));
  }

  async putJson(key, value) {
    await this.setValue(key, JSON.stringify(value));
  }

  async getJson(key) {
    const raw = await this.getValue(key);
    if (!raw) return null;

    try {
      return JSON.parse(raw);
    } catch (cause) {
      if (this.memory) throw cause;
      throw new RuntimeStoreUnavailableError("Runtime state storage returned invalid data.", { cause });
    }
  }

  async putPetition(txRef, payload) {
    await this.putJson(this.key("petition", txRef), {
      ...payload,
      storedAt: this.now(),
    });
  }

  getPetition(txRef) {
    return this.getJson(this.key("petition", txRef));
  }

  deletePetition(txRef) {
    return this.deleteValue(this.key("petition", txRef));
  }

  markPaid(txRef) {
    return this.setValue(this.key("paid", txRef), "1");
  }

  async isPaid(txRef) {
    return (await this.getValue(this.key("paid", txRef))) === "1";
  }

  putUnlocked(txRef, payload) {
    return this.putJson(this.key("unlocked", txRef), payload);
  }

  getUnlocked(txRef) {
    return this.getJson(this.key("unlocked", txRef));
  }

  putTransactionId(txRef, transactionId) {
    const id = String(transactionId || "").trim();
    if (!id) return Promise.resolve();
    return this.setValue(this.key("txid", txRef), id);
  }

  async getTransactionId(txRef) {
    return String(await this.getValue(this.key("txid", txRef)) || "").trim();
  }

  async claimPaymentTransaction(transactionId, txRef) {
    const id = String(transactionId || "").trim();
    const reference = String(txRef || "").trim();

    if (!id || !reference) {
      return { ok: false, claimed: false, idempotent: false };
    }

    const key = this.key("payment-transaction", id);

    if (this.memory) {
      const existing = this.getLocal(key);
      if (existing === reference) {
        return { ok: true, claimed: true, idempotent: true };
      }
      if (existing) {
        return { ok: false, claimed: false, idempotent: false };
      }
      this.putLocal(key, reference);
      return { ok: true, claimed: true, idempotent: false };
    }

    const claimed = await this.durable(() =>
      this.store.claim(key, reference, this.ttlSeconds)
    );

    if (claimed) {
      return { ok: true, claimed: true, idempotent: false };
    }

    const existing = await this.durable(() => this.store.get(key));
    if (String(existing || "") === reference) {
      return { ok: true, claimed: true, idempotent: true };
    }

    return { ok: false, claimed: false, idempotent: false };
  }

  putAdminSession(token, ttlSeconds = this.ttlSeconds) {
    return this.setValue(adminSessionStorageKey(token), "1", ttlSeconds);
  }

  async hasAdminSession(token) {
    const value = String(token || "").trim();
    if (!value) return false;
    return (await this.getValue(adminSessionStorageKey(value))) === "1";
  }
}

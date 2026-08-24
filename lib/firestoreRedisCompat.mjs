import {
  FieldValue,
  Firestore,
  Timestamp,
} from "@google-cloud/firestore";

/**
 * Firestore compatibility layer for the limited Redis operations
 * used by PetitionDesk.
 *
 * Supported operations:
 * set, get, del, incr, sadd and scard.
 */
export class FirestoreRedisCompat {
  constructor({
    collection = "petitiondesk_runtime",
    projectId =
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.GCLOUD_PROJECT ||
      undefined,
  } = {}) {
    const safeCollection =
      String(collection || "petitiondesk_runtime")
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, "_") ||
      "petitiondesk_runtime";

    this.db = new Firestore({
      ignoreUndefinedProperties: true,
      ...(projectId ? { projectId } : {}),
    });

    this.collection =
      this.db.collection(safeCollection);
  }

  documentId(key) {
    return Buffer
      .from(String(key), "utf8")
      .toString("base64url");
  }

  memberId(value) {
    return Buffer
      .from(String(value), "utf8")
      .toString("base64url");
  }

  document(key) {
    return this.collection.doc(
      this.documentId(key)
    );
  }

  expiryMillis(value) {
    if (!value) return 0;

    if (
      typeof value.toMillis === "function"
    ) {
      return value.toMillis();
    }

    if (value instanceof Date) {
      return value.getTime();
    }

    if (typeof value === "number") {
      return value;
    }

    return 0;
  }

  isExpired(data) {
    const expiry =
      this.expiryMillis(data?.expiresAt);

    return Boolean(
      expiry && Date.now() >= expiry
    );
  }

  async set(key, value, ...args) {
    let expiresAt = null;

    const expiryIndex =
      args.findIndex(
        (argument) =>
          String(argument || "")
            .toUpperCase() === "EX"
      );

    if (expiryIndex !== -1) {
      const seconds =
        Number(args[expiryIndex + 1] || 0);

      if (
        Number.isFinite(seconds) &&
        seconds > 0
      ) {
        expiresAt =
          Timestamp.fromMillis(
            Date.now() +
              seconds * 1000
          );
      }
    }

    await this.document(key).set({
      key: String(key),
      kind: "string",
      value: String(value),
      expiresAt,
      updatedAt:
        FieldValue.serverTimestamp(),
    });

    return "OK";
  }

  async get(key) {
    const reference =
      this.document(key);

    const snapshot =
      await reference.get();

    if (!snapshot.exists) {
      return null;
    }

    const data =
      snapshot.data() || {};

    if (this.isExpired(data)) {
      await reference
        .delete()
        .catch(() => {});

      return null;
    }

    if (
      data.value === undefined ||
      data.value === null
    ) {
      return null;
    }

    return String(data.value);
  }

  async del(key) {
    await this.document(key).delete();
    return 1;
  }

  async incr(key) {
    const reference =
      this.document(key);

    return this.db.runTransaction(
      async (transaction) => {
        const snapshot =
          await transaction.get(
            reference
          );

        const previous =
          snapshot.exists
            ? snapshot.data() || {}
            : {};

        const expired =
          this.isExpired(previous);

        const current =
          expired
            ? 0
            : Number(
                previous.value || 0
              );

        const next =
          (
            Number.isFinite(current)
              ? current
              : 0
          ) + 1;

        transaction.set(reference, {
          key: String(key),
          kind: "counter",
          value: next,
          expiresAt:
            !expired &&
            previous.expiresAt
              ? previous.expiresAt
              : null,
          updatedAt:
            FieldValue
              .serverTimestamp(),
        });

        return next;
      }
    );
  }

  async consumeRateLimit(key, {
    maximum = 10,
    windowMilliseconds = 15 * 60 * 1000,
  } = {}) {
    const reference = this.document(key);
    const safeMaximum = Math.max(Number(maximum) || 10, 1);
    const safeWindow = Math.max(Number(windowMilliseconds) || 15 * 60 * 1000, 1000);

    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      const previous = snapshot.exists ? snapshot.data() || {} : {};
      const currentTime = Date.now();
      const previousExpiry = this.expiryMillis(previous.expiresAt);
      const active = previousExpiry > currentTime;
      const count = active ? Number(previous.value || 0) : 0;
      const expiresAt = active
        ? previous.expiresAt
        : Timestamp.fromMillis(currentTime + safeWindow);
      const resetAt = this.expiryMillis(expiresAt);

      if (count >= safeMaximum) {
        return {
          ok: false,
          retryAfterSeconds: Math.max(Math.ceil((resetAt - currentTime) / 1000), 1),
        };
      }

      transaction.set(reference, {
        key: String(key),
        kind: "rate_limit",
        value: count + 1,
        expiresAt,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return {
        ok: true,
        remaining: Math.max(safeMaximum - count - 1, 0),
        retryAfterSeconds: 0,
      };
    });
  }

  async sadd(key, value) {
    const setReference =
      this.document(key);

    const memberReference =
      setReference
        .collection("members")
        .doc(this.memberId(value));

    return this.db.runTransaction(
      async (transaction) => {
        const memberSnapshot =
          await transaction.get(
            memberReference
          );

        if (memberSnapshot.exists) {
          return 0;
        }

        transaction.set(
          setReference,
          {
            key: String(key),
            kind: "set",
            updatedAt:
              FieldValue
                .serverTimestamp(),
          },
          { merge: true }
        );

        transaction.set(
          memberReference,
          {
            value: String(value),
            createdAt:
              FieldValue
                .serverTimestamp(),
          }
        );

        return 1;
      }
    );
  }

  async scard(key) {
    const members =
      this.document(key)
        .collection("members");

    const aggregate =
      await members.count().get();

    return Number(
      aggregate.data().count || 0
    );
  }
}

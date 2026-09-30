import {
  FieldValue,
  Firestore,
} from "@google-cloud/firestore";

export class SupportStore {
  constructor({
    enabled = false,
    collection =
      "petitiondesk_support_tickets",
    projectId =
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.GCLOUD_PROJECT ||
      undefined,
  } = {}) {
    this.enabledRequested =
      Boolean(enabled);

    this.memory = new Map();
    this.db = null;
    this.collection = null;

    if (!this.enabledRequested) {
      console.log(
        "ℹ️ Support tickets using local memory"
      );
      return;
    }

    const safeCollection =
      String(
        collection ||
          "petitiondesk_support_tickets"
      )
        .trim()
        .replace(
          /[^a-zA-Z0-9_-]/g,
          "_"
        ) ||
      "petitiondesk_support_tickets";

    this.db = new Firestore({
      ignoreUndefinedProperties: true,
      ...(projectId
        ? { projectId }
        : {}),
    });

    this.collection =
      this.db.collection(
        safeCollection
      );

    console.log(
      `✅ Support ticket storage enabled: ${safeCollection}`
    );
  }

  ensureStorage() {
    if (
      this.enabledRequested &&
      !this.collection
    ) {
      throw new Error(
        "Support ticket storage unavailable"
      );
    }
  }

  cleanReference(reference) {
    return String(
      reference || ""
    )
      .trim()
      .toUpperCase();
  }

  serializeDocument(snapshot) {
    if (
      !snapshot ||
      !snapshot.exists
    ) {
      return null;
    }

    const data =
      snapshot.data() || {};

    return {
      ...data,
      supportRef:
        data.supportRef ||
        snapshot.id,
    };
  }

  async create(ticket) {
    const supportRef =
      this.cleanReference(
        ticket?.supportRef
      );

    if (!supportRef) {
      throw new Error(
        "Missing support reference"
      );
    }

    const record = {
      ...ticket,
      supportRef,
    };

    this.memory.set(
      supportRef,
      record
    );

    if (!this.enabledRequested) {
      return { ...record };
    }

    this.ensureStorage();

    await this.collection
      .doc(supportRef)
      .create({
        ...record,
        createdAtServer:
          FieldValue
            .serverTimestamp(),
        updatedAtServer:
          FieldValue
            .serverTimestamp(),
      });

    return { ...record };
  }

  async get(reference) {
    const supportRef =
      this.cleanReference(
        reference
      );

    if (!supportRef) {
      return null;
    }

    if (!this.enabledRequested) {
      const local =
        this.memory.get(
          supportRef
        );

      return local
        ? { ...local }
        : null;
    }

    this.ensureStorage();

    const snapshot =
      await this.collection
        .doc(supportRef)
        .get();

    return this.serializeDocument(
      snapshot
    );
  }

  async list({
    limit = 100,
  } = {}) {
    const safeLimit =
      Math.min(
        Math.max(
          Number(limit) || 100,
          1
        ),
        100
      );

    if (!this.enabledRequested) {
      return [
        ...this.memory.values(),
      ]
        .sort(
          (a, b) =>
            Number(
              b.createdAtMillis ||
                0
            ) -
            Number(
              a.createdAtMillis ||
                0
            )
        )
        .slice(
          0,
          safeLimit
        )
        .map(
          (ticket) => ({
            ...ticket,
          })
        );
    }

    this.ensureStorage();

    const snapshot =
      await this.collection
        .orderBy(
          "createdAtMillis",
          "desc"
        )
        .limit(safeLimit)
        .get();

    return snapshot.docs
      .map(
        (document) =>
          this.serializeDocument(
            document
          )
      )
      .filter(Boolean);
  }

  async update(
    reference,
    updates
  ) {
    const supportRef =
      this.cleanReference(
        reference
      );

    if (!supportRef) {
      return null;
    }

    if (!this.enabledRequested) {
      const existing =
        this.memory.get(
          supportRef
        );

      if (!existing) {
        return null;
      }

      const updated = {
        ...existing,
        ...updates,
        supportRef,
      };

      this.memory.set(
        supportRef,
        updated
      );

      return { ...updated };
    }

    this.ensureStorage();

    const document =
      this.collection.doc(
        supportRef
      );

    const before =
      await document.get();

    if (!before.exists) {
      return null;
    }

    await document.set(
      {
        ...updates,
        supportRef,
        updatedAtServer:
          FieldValue
            .serverTimestamp(),
      },
      {
        merge: true,
      }
    );

    const after =
      await document.get();

    return this.serializeDocument(
      after
    );
  }
}

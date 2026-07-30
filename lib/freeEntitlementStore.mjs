import {
  FieldValue,
  Firestore,
} from "@google-cloud/firestore";

function positiveInteger(
  value,
  fallback
) {
  const parsed =
    Number(value);

  if (
    !Number.isInteger(
      parsed
    ) ||
    parsed < 0
  ) {
    return fallback;
  }

  return parsed;
}

function cleanIdentifier(
  value,
  label
) {
  const cleaned =
    String(value || "")
      .trim();

  if (!cleaned) {
    throw new Error(
      `${label} is required`
    );
  }

  return cleaned;
}

function documentId(
  value
) {
  return Buffer
    .from(
      String(value),
      "utf8"
    )
    .toString(
      "base64url"
    );
}

export class FreeEntitlementStore {
  constructor({
    enabled = false,

    collection =
      "petitiondesk_entitlements",

    freeLimit = 2,

    projectId =
      process.env
        .GOOGLE_CLOUD_PROJECT ||
      process.env
        .GCLOUD_PROJECT ||
      undefined,
  } = {}) {
    this.enabled =
      Boolean(enabled);

    this.freeLimit =
      positiveInteger(
        freeLimit,
        2
      );

    this.memory =
      new Map();

    if (this.enabled) {
      const safeCollection =
        String(
          collection ||
          "petitiondesk_entitlements"
        )
          .trim()
          .replace(
            /[^a-zA-Z0-9_-]/g,
            "_"
          ) ||
        "petitiondesk_entitlements";

      this.db =
        new Firestore({
          ignoreUndefinedProperties:
            true,

          ...(projectId
            ? {
                projectId,
              }
            : {}),
        });

      this.collection =
        this.db.collection(
          safeCollection
        );
    } else {
      this.db = null;
      this.collection = null;
    }
  }

  buildStatus(
    freeUsed = 0
  ) {
    const safeUsed =
      Math.max(
        positiveInteger(
          freeUsed,
          0
        ),
        0
      );

    return {
      enabled: true,

      freeLimit:
        this.freeLimit,

      freeUsed:
        safeUsed,

      freeRemaining:
        Math.max(
          this.freeLimit -
            safeUsed,
          0
        ),

      requiresPayment:
        safeUsed >=
        this.freeLimit,
    };
  }

  memoryRecord(uid) {
    const key =
      cleanIdentifier(
        uid,
        "uid"
      );

    if (
      !this.memory.has(key)
    ) {
      this.memory.set(
        key,
        {
          freeUsed: 0,

          claims:
            new Set(),

          createdAt:
            Date.now(),

          updatedAt:
            Date.now(),
        }
      );
    }

    return this.memory.get(
      key
    );
  }

  async getStatus({
    uid,
  }) {
    const cleanUid =
      cleanIdentifier(
        uid,
        "uid"
      );

    if (!this.enabled) {
      const record =
        this.memoryRecord(
          cleanUid
        );

      return this.buildStatus(
        record.freeUsed
      );
    }

    const userReference =
      this.collection.doc(
        documentId(
          cleanUid
        )
      );

    const snapshot =
      await userReference.get();

    const data =
      snapshot.exists
        ? snapshot.data() || {}
        : {};

    return this.buildStatus(
      data.freeUsed
    );
  }

  async claimFreeUnlock({
    uid,
    txRef,
    sector = "",
  }) {
    const cleanUid =
      cleanIdentifier(
        uid,
        "uid"
      );

    const cleanTxRef =
      cleanIdentifier(
        txRef,
        "txRef"
      );

    if (!this.enabled) {
      const record =
        this.memoryRecord(
          cleanUid
        );

      if (
        record.claims.has(
          cleanTxRef
        )
      ) {
        return {
          granted: true,
          alreadyClaimed: true,

          status:
            this.buildStatus(
              record.freeUsed
            ),
        };
      }

      if (
        record.freeUsed >=
        this.freeLimit
      ) {
        return {
          granted: false,
          alreadyClaimed: false,

          reason:
            "free_limit_reached",

          status:
            this.buildStatus(
              record.freeUsed
            ),
        };
      }

      record.claims.add(
        cleanTxRef
      );

      record.freeUsed += 1;
      record.updatedAt =
        Date.now();

      return {
        granted: true,
        alreadyClaimed: false,

        status:
          this.buildStatus(
            record.freeUsed
          ),
      };
    }

    const userReference =
      this.collection.doc(
        documentId(
          cleanUid
        )
      );

    const claimReference =
      userReference
        .collection(
          "free_unlock_claims"
        )
        .doc(
          documentId(
            cleanTxRef
          )
        );

    return this.db
      .runTransaction(
        async (
          transaction
        ) => {
          /*
           * All reads are completed before
           * transaction writes.
           */
          const [
            claimSnapshot,
            userSnapshot,
          ] =
            await Promise.all([
              transaction.get(
                claimReference
              ),

              transaction.get(
                userReference
              ),
            ]);

          const userData =
            userSnapshot.exists
              ? userSnapshot
                  .data() || {}
              : {};

          const currentUsed =
            Math.max(
              positiveInteger(
                userData.freeUsed,
                0
              ),
              0
            );

          if (
            claimSnapshot.exists
          ) {
            return {
              granted: true,
              alreadyClaimed:
                true,

              status:
                this.buildStatus(
                  currentUsed
                ),
            };
          }

          if (
            currentUsed >=
            this.freeLimit
          ) {
            return {
              granted: false,
              alreadyClaimed:
                false,

              reason:
                "free_limit_reached",

              status:
                this.buildStatus(
                  currentUsed
                ),
            };
          }

          const nextUsed =
            currentUsed + 1;

          transaction.set(
            userReference,
            {
              uid:
                cleanUid,

              freeLimit:
                this.freeLimit,

              freeUsed:
                nextUsed,

              createdAt:
                userSnapshot
                  .exists
                  ? userData
                      .createdAt ||
                    FieldValue
                      .serverTimestamp()
                  : FieldValue
                      .serverTimestamp(),

              updatedAt:
                FieldValue
                  .serverTimestamp(),

              lastFreeUnlockAt:
                FieldValue
                  .serverTimestamp(),
            },
            {
              merge: true,
            }
          );

          transaction.set(
            claimReference,
            {
              txRef:
                cleanTxRef,

              sector:
                String(
                  sector ||
                  ""
                )
                  .trim()
                  .slice(
                    0,
                    100
                  ),

              createdAt:
                FieldValue
                  .serverTimestamp(),
            }
          );

          return {
            granted: true,
            alreadyClaimed:
              false,

            status:
              this.buildStatus(
                nextUsed
              ),
          };
        }
      );
  }
}

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
    String(
      value ||
      ""
    ).trim();

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

function cloneJson(
  value
) {
  return JSON.parse(
    JSON.stringify(
      value
    )
  );
}

function validUnlockedPayload(
  value
) {
  return Boolean(
    value &&
    typeof value ===
      "object" &&
    value.ok === true &&
    value.unlocked ===
      true &&
    String(
      value.petition ||
      ""
    ).trim()
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

  memoryRecord(
    uid
  ) {
    const key =
      cleanIdentifier(
        uid,
        "uid"
      );

    if (
      !this.memory.has(
        key
      )
    ) {
      this.memory.set(
        key,
        {
          freeUsed: 0,

          claims:
            new Map(),

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

  userReference(
    uid
  ) {
    return this.collection.doc(
      documentId(
        uid
      )
    );
  }

  claimReference(
    uid,
    txRef
  ) {
    return this
      .userReference(
        uid
      )
      .collection(
        "free_unlock_claims"
      )
      .doc(
        documentId(
          txRef
        )
      );
  }

  ownedPayload({
    payload,
    uid,
    status,
  }) {
    if (
      !validUnlockedPayload(
        payload
      )
    ) {
      throw new Error(
        "A complete unlocked petition payload is required"
      );
    }

    return cloneJson({
      ...payload,

      access:
        status,

      _ownerUid:
        uid,
    });
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

    const snapshot =
      await this
        .userReference(
          cleanUid
        )
        .get();

    const data =
      snapshot.exists
        ? snapshot.data() ||
          {}
        : {};

    return this.buildStatus(
      data.freeUsed
    );
  }


  async listUsers({
    limit = 5000,
  } = {}) {
    const safeLimit =
      Math.min(
        Math.max(
          Number(limit) ||
            1000,
          1
        ),
        5000
      );

    const timestampIso = (
      value
    ) => {
      if (!value) {
        return "";
      }

      try {
        if (
          typeof value
            .toDate ===
          "function"
        ) {
          return value
            .toDate()
            .toISOString();
        }

        if (
          typeof value
            .toMillis ===
          "function"
        ) {
          return new Date(
            value.toMillis()
          ).toISOString();
        }

        if (
          value instanceof
          Date
        ) {
          return value
            .toISOString();
        }

        return String(
          value
        );
      } catch {
        return "";
      }
    };

    if (!this.enabled) {
      return [
        ...this.memory
          .entries(),
      ]
        .slice(
          0,
          safeLimit
        )
        .map(
          ([
            uid,
            record,
          ]) => {
            const freeUsed =
              Math.max(
                Number(
                  record
                    ?.freeUsed ||
                  0
                ),
                0
              );

            return {
              uid,

              freeLimit:
                this.freeLimit,

              freeUsed,

              freeRemaining:
                Math.max(
                  this
                    .freeLimit -
                    freeUsed,
                  0
                ),

              requiresPayment:
                freeUsed >=
                this
                  .freeLimit,

              createdAt:
                record
                  ?.createdAt
                  ? new Date(
                      record
                        .createdAt
                    )
                      .toISOString()
                  : "",

              updatedAt:
                record
                  ?.updatedAt
                  ? new Date(
                      record
                        .updatedAt
                    )
                      .toISOString()
                  : "",

              lastFreeUnlockAt:
                "",
            };
          }
        );
    }

    const snapshot =
      await this
        .collection
        .limit(
          safeLimit
        )
        .get();

    return snapshot.docs.map(
      (document) => {
        const data =
          document.data() ||
          {};

        const freeUsed =
          Math.max(
            Number(
              data.freeUsed ||
              0
            ),
            0
          );

        const freeLimit =
          Math.max(
            Number(
              data.freeLimit ??
              this.freeLimit
            ),
            0
          );

        return {
          uid:
            String(
              data.uid ||
              document.id
            ),

          freeLimit,

          freeUsed,

          freeRemaining:
            Math.max(
              freeLimit -
                freeUsed,
              0
            ),

          requiresPayment:
            freeUsed >=
            freeLimit,

          createdAt:
            timestampIso(
              data.createdAt
            ),

          updatedAt:
            timestampIso(
              data.updatedAt
            ),

          lastFreeUnlockAt:
            timestampIso(
              data
                .lastFreeUnlockAt
            ),
        };
      }
    );
  }

  async getClaimedUnlock({
    uid,
    txRef,
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

      const claim =
        record.claims.get(
          cleanTxRef
        );

      if (
        !validUnlockedPayload(
          claim?.payload
        )
      ) {
        return null;
      }

      return cloneJson(
        claim.payload
      );
    }

    const snapshot =
      await this
        .claimReference(
          cleanUid,
          cleanTxRef
        )
        .get();

    if (!snapshot.exists) {
      return null;
    }

    const data =
      snapshot.data() ||
      {};

    if (
      data.uid &&
      data.uid !==
        cleanUid
    ) {
      throw new Error(
        "Free-unlock ownership mismatch"
      );
    }

    if (
      !validUnlockedPayload(
        data.unlockedPayload
      )
    ) {
      return null;
    }

    return cloneJson(
      data.unlockedPayload
    );
  }

  async claimFreeUnlock({
    uid,
    txRef,
    sector = "",
    payload,
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

    if (
      !validUnlockedPayload(
        payload
      )
    ) {
      throw new Error(
        "A complete unlocked petition payload is required"
      );
    }

    if (!this.enabled) {
      const record =
        this.memoryRecord(
          cleanUid
        );

      const existing =
        record.claims.get(
          cleanTxRef
        );

      const currentStatus =
        this.buildStatus(
          record.freeUsed
        );

      if (existing) {
        if (
          validUnlockedPayload(
            existing.payload
          )
        ) {
          return {
            granted: true,
            alreadyClaimed:
              true,
            status:
              currentStatus,
            payload:
              cloneJson(
                existing.payload
              ),
          };
        }

        const recoveredPayload =
          this.ownedPayload({
            payload,
            uid:
              cleanUid,
            status:
              currentStatus,
          });

        existing.payload =
          recoveredPayload;

        existing.state =
          "completed";

        existing.updatedAt =
          Date.now();

        return {
          granted: true,
          alreadyClaimed:
            true,
          status:
            currentStatus,
          payload:
            cloneJson(
              recoveredPayload
            ),
        };
      }

      if (
        record.freeUsed >=
        this.freeLimit
      ) {
        return {
          granted: false,
          alreadyClaimed:
            false,

          reason:
            "free_limit_reached",

          status:
            currentStatus,

          payload:
            null,
        };
      }

      const nextUsed =
        record.freeUsed + 1;

      const nextStatus =
        this.buildStatus(
          nextUsed
        );

      const ownedPayload =
        this.ownedPayload({
          payload,
          uid:
            cleanUid,
          status:
            nextStatus,
        });

      record.claims.set(
        cleanTxRef,
        {
          uid:
            cleanUid,

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

          state:
            "completed",

          payload:
            ownedPayload,

          createdAt:
            Date.now(),

          updatedAt:
            Date.now(),
        }
      );

      record.freeUsed =
        nextUsed;

      record.updatedAt =
        Date.now();

      return {
        granted: true,
        alreadyClaimed:
          false,
        status:
          nextStatus,
        payload:
          cloneJson(
            ownedPayload
          ),
      };
    }

    const userReference =
      this.userReference(
        cleanUid
      );

    const claimReference =
      this.claimReference(
        cleanUid,
        cleanTxRef
      );

    return this.db
      .runTransaction(
        async (
          transaction
        ) => {
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
                  .data() ||
                {}
              : {};

          const currentUsed =
            Math.max(
              positiveInteger(
                userData.freeUsed,
                0
              ),
              0
            );

          const currentStatus =
            this.buildStatus(
              currentUsed
            );

          if (
            claimSnapshot.exists
          ) {
            const claimData =
              claimSnapshot
                .data() ||
              {};

            if (
              claimData.uid &&
              claimData.uid !==
                cleanUid
            ) {
              throw new Error(
                "Free-unlock ownership mismatch"
              );
            }

            if (
              validUnlockedPayload(
                claimData
                  .unlockedPayload
              )
            ) {
              return {
                granted:
                  true,

                alreadyClaimed:
                  true,

                status:
                  currentStatus,

                payload:
                  cloneJson(
                    claimData
                      .unlockedPayload
                  ),
              };
            }

            /*
             * Recovery for any earlier
             * claim that was recorded
             * without its completed
             * unlocked payload.
             */
            const recoveredPayload =
              this.ownedPayload({
                payload,
                uid:
                  cleanUid,
                status:
                  currentStatus,
              });

            transaction.set(
              claimReference,
              {
                uid:
                  cleanUid,

                txRef:
                  cleanTxRef,

                state:
                  "completed",

                unlockedPayload:
                  recoveredPayload,

                completedAt:
                  FieldValue
                    .serverTimestamp(),

                updatedAt:
                  FieldValue
                    .serverTimestamp(),
              },
              {
                merge:
                  true,
              }
            );

            return {
              granted:
                true,

              alreadyClaimed:
                true,

              status:
                currentStatus,

              payload:
                recoveredPayload,
            };
          }

          if (
            currentUsed >=
            this.freeLimit
          ) {
            return {
              granted:
                false,

              alreadyClaimed:
                false,

              reason:
                "free_limit_reached",

              status:
                currentStatus,

              payload:
                null,
            };
          }

          const nextUsed =
            currentUsed + 1;

          const nextStatus =
            this.buildStatus(
              nextUsed
            );

          const ownedPayload =
            this.ownedPayload({
              payload,
              uid:
                cleanUid,
              status:
                nextStatus,
            });

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
              merge:
                true,
            }
          );

          /*
           * The entitlement count and
           * completed unlocked payload
           * are written in one Firestore
           * transaction.
           */
          transaction.set(
            claimReference,
            {
              uid:
                cleanUid,

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

              state:
                "completed",

              unlockedPayload:
                ownedPayload,

              createdAt:
                FieldValue
                  .serverTimestamp(),

              completedAt:
                FieldValue
                  .serverTimestamp(),

              updatedAt:
                FieldValue
                  .serverTimestamp(),
            }
          );

          return {
            granted:
              true,

            alreadyClaimed:
              false,

            status:
              nextStatus,

            payload:
              ownedPayload,
          };
        }
      );
  }
}

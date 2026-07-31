import assert from "node:assert/strict";

import {
  FreeEntitlementStore,
} from "../lib/freeEntitlementStore.mjs";

import {
  SupportNotifier,
} from "../lib/supportNotifier.mjs";


function unlockedPayload(
  petition
) {
  return {
    ok: true,
    unlocked: true,

    unlockMethod:
      "free",

    needsPayment:
      false,

    petition,

    sector:
      "general",

    toInstitutions: [
      "Public Complaints Commission",
    ],

    ccInstitutions: [],

    to: [
      "complaint@pcc.gov.ng",
    ],

    cc: [],

    mailto:
      "mailto:complaint@pcc.gov.ng",

    emailRoutingAvailable:
      true,

    routingDecision:
      null,
  };
}


const store =
  new FreeEntitlementStore({
    enabled: false,
    freeLimit: 2,
  });


await assert.rejects(
  () =>
    store.claimFreeUnlock({
      uid:
        "user-one",

      txRef:
        "pd-missing-payload",
    }),

  /complete unlocked petition payload/i
);


const first =
  await store.claimFreeUnlock({
    uid:
      "user-one",

    txRef:
      "pd-first",

    sector:
      "general",

    payload:
      unlockedPayload(
        "First complete petition"
      ),
  });


assert.equal(
  first.granted,
  true
);

assert.equal(
  first.alreadyClaimed,
  false
);

assert.equal(
  first.status.freeUsed,
  1
);

assert.equal(
  first.status.freeRemaining,
  1
);

assert.equal(
  first.payload._ownerUid,
  "user-one"
);


const recovered =
  await store.getClaimedUnlock({
    uid:
      "user-one",

    txRef:
      "pd-first",
  });


assert.equal(
  recovered.petition,
  "First complete petition"
);


const repeated =
  await store.claimFreeUnlock({
    uid:
      "user-one",

    txRef:
      "pd-first",

    sector:
      "general",

    payload:
      unlockedPayload(
        "This must not replace the first petition"
      ),
  });


assert.equal(
  repeated.alreadyClaimed,
  true
);

assert.equal(
  repeated.status.freeUsed,
  1
);

assert.equal(
  repeated.payload.petition,
  "First complete petition"
);


const second =
  await store.claimFreeUnlock({
    uid:
      "user-one",

    txRef:
      "pd-second",

    sector:
      "general",

    payload:
      unlockedPayload(
        "Second complete petition"
      ),
  });


assert.equal(
  second.granted,
  true
);

assert.equal(
  second.status.freeUsed,
  2
);

assert.equal(
  second.status.freeRemaining,
  0
);


const third =
  await store.claimFreeUnlock({
    uid:
      "user-one",

    txRef:
      "pd-third",

    sector:
      "general",

    payload:
      unlockedPayload(
        "Third petition"
      ),
  });


assert.equal(
  third.granted,
  false
);

assert.equal(
  third.reason,
  "free_limit_reached"
);

assert.equal(
  third.status.requiresPayment,
  true
);


const legacyRecord =
  store.memoryRecord(
    "legacy-user"
  );

legacyRecord.freeUsed = 1;

legacyRecord.claims.set(
  "legacy-tx",
  {
    state:
      "legacy",

    payload:
      null,
  }
);


const legacyRecovery =
  await store.claimFreeUnlock({
    uid:
      "legacy-user",

    txRef:
      "legacy-tx",

    payload:
      unlockedPayload(
        "Recovered legacy petition"
      ),
  });


assert.equal(
  legacyRecovery.granted,
  true
);

assert.equal(
  legacyRecovery.alreadyClaimed,
  true
);

assert.equal(
  legacyRecovery.status.freeUsed,
  1
);

assert.equal(
  legacyRecovery.payload.petition,
  "Recovered legacy petition"
);


const disabledNotifier =
  new SupportNotifier({
    enabled: false,
  });


const disabledResult =
  await disabledNotifier
    .notifyNewTicket({
      supportRef:
        "PDS-DISABLED",
    });


assert.equal(
  disabledResult.skipped,
  true
);

assert.equal(
  disabledResult.reason,
  "disabled"
);


let capturedRequest =
  null;


const notifier =
  new SupportNotifier({
    enabled: true,

    apiKey:
      "test_api_key",

    to:
      "admin@example.com",

    from:
      "PetitionDesk <alerts@example.com>",

    adminUrl:
      "https://example.com/admin/support",

    fetchImpl:
      async (
        url,
        options
      ) => {
        capturedRequest = {
          url,
          options,
        };

        return {
          ok: true,
          status: 200,

          json:
            async () => ({
              id:
                "email-test-id",
            }),
        };
      },
  });


const notification =
  await notifier
    .notifyNewTicket({
      supportRef:
        "PDS-20260731-ABC123",

      category:
        "payment_unlock",

      subject:
        "PRIVATE SUBJECT",

      fullName:
        "PRIVATE NAME",

      email:
        "private@example.com",

      phone:
        "08000000000",

      message:
        "VERY PRIVATE MESSAGE",

      petitionRef:
        "pd_private",

      paymentRef:
        "payment_private",

      createdAtIso:
        "2026-07-31T05:00:00.000Z",
    });


assert.equal(
  notification.sent,
  true
);

assert.equal(
  notification.id,
  "email-test-id"
);


const requestBody =
  JSON.parse(
    capturedRequest
      .options
      .body
  );


assert.equal(
  capturedRequest.url,
  "https://api.resend.com/emails"
);

assert.equal(
  requestBody.to[0],
  "admin@example.com"
);

assert.match(
  requestBody.text,
  /PDS-20260731-ABC123/
);

assert.match(
  requestBody.text,
  /payment_unlock/
);


for (
  const privateValue
  of [
    "PRIVATE SUBJECT",
    "PRIVATE NAME",
    "private@example.com",
    "08000000000",
    "VERY PRIVATE MESSAGE",
    "pd_private",
    "payment_private",
  ]
) {
  assert.equal(
    requestBody.text.includes(
      privateValue
    ),
    false
  );
}


assert.equal(
  capturedRequest
    .options
    .headers[
      "Idempotency-Key"
    ],
  "petitiondesk-support-PDS-20260731-ABC123"
);


console.log(
  "✅ ATOMIC FREE-UNLOCK RECOVERY PASSED"
);

console.log(
  "✅ REPEATED FREE UNLOCK DOES NOT CONSUME ANOTHER USE"
);

console.log(
  "✅ THIRD PETITION REQUIRES PAYMENT"
);

console.log(
  "✅ LEGACY INCOMPLETE CLAIM RECOVERY PASSED"
);

console.log(
  "✅ SUPPORT ALERT EXCLUDES PRIVATE USER INFORMATION"
);

console.log(
  "✅ SUPPORT ALERT IDEMPOTENCY PASSED"
);

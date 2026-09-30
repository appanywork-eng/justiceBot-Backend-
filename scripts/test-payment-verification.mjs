import assert from "node:assert/strict";

import { assessFlutterwavePayment } from "../lib/paymentVerification.mjs";

const expected = {
  expectedTxRef: "pd_test_reference",
  expectedCurrency: "NGN",
  minimumAmount: 550,
};

const paid = {
  id: 908172635,
  tx_ref: "pd_test_reference",
  status: "successful",
  currency: "NGN",
  charged_amount: 550,
};

assert.deepEqual(
  assessFlutterwavePayment({ transaction: paid, ...expected }),
  {
    ok: true,
    code: "payment_verified",
    transactionId: "908172635",
    txRef: "pd_test_reference",
    amount: 550,
    currency: "NGN",
    status: "successful",
  }
);

for (const [name, transaction, code] of [
  ["empty returned reference", { ...paid, tx_ref: "" }, "payment_reference_missing"],
  ["missing expected reference", paid, "payment_reference_missing"],
  ["mismatched reference", { ...paid, tx_ref: "pd_other" }, "payment_reference_mismatch"],
  ["pending status", { ...paid, status: "pending" }, "payment_status_pending"],
  ["failed status", { ...paid, status: "failed" }, "payment_status_not_successful"],
  ["wrong currency", { ...paid, currency: "USD" }, "payment_currency_mismatch"],
  ["underpayment", { ...paid, charged_amount: 549.99 }, "payment_amount_insufficient"],
  ["non-finite amount", { ...paid, charged_amount: "not-a-number" }, "payment_amount_invalid"],
  ["missing transaction id", { ...paid, id: "" }, "payment_transaction_id_missing"],
]) {
  const input = name === "missing expected reference"
    ? { transaction, ...expected, expectedTxRef: "" }
    : { transaction, ...expected };
  const assessment = assessFlutterwavePayment(input);
  assert.equal(assessment.ok, false, name);
  assert.equal(assessment.code, code, name);
}

assert.deepEqual(
  assessFlutterwavePayment({ transaction: [paid], ...expected }),
  assessFlutterwavePayment({ transaction: paid, ...expected }),
  "array verification responses must normalize to their first transaction"
);

assert.deepEqual(
  assessFlutterwavePayment({ transaction: { data: [paid] }, ...expected }),
  assessFlutterwavePayment({ transaction: paid, ...expected }),
  "wrapped Flutterwave responses must normalize safely"
);

console.log("✅ EXACT NON-EMPTY FLUTTERWAVE REFERENCES ARE REQUIRED");
console.log("✅ STATUS, CURRENCY, AMOUNT AND TRANSACTION ID ARE VERIFIED");
console.log("✅ ARRAY AND WRAPPED RESPONSES NORMALIZE SAFELY");
console.log("✅ FLUTTERWAVE PAYMENT VERIFICATION CONTRACT PASSED");

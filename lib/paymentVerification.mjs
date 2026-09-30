const SUCCESS_STATUSES = new Set(["successful", "success", "completed"]);
const PENDING_STATUSES = new Set(["pending", "processing", "queued"]);

function normalizeTransaction(value) {
  if (Array.isArray(value)) return normalizeTransaction(value[0] || {});

  if (!value || typeof value !== "object") return {};

  const hasTransactionIdentity = ["id", "tx_ref", "status", "currency", "amount", "charged_amount"]
    .some((key) => Object.hasOwn(value, key));

  if (!hasTransactionIdentity && Object.hasOwn(value, "data")) {
    return normalizeTransaction(value.data);
  }

  return value;
}

function resultFields(transaction) {
  const amountValue = transaction.charged_amount ?? transaction.amount;

  return {
    transactionId: transaction.id == null ? "" : String(transaction.id).trim(),
    txRef: String(transaction.tx_ref || "").trim(),
    amount: Number(amountValue),
    currency: String(transaction.currency || "").trim().toUpperCase(),
    status: String(transaction.status || "").trim().toLowerCase(),
  };
}

export function assessFlutterwavePayment({
  transaction,
  expectedTxRef,
  expectedCurrency = "NGN",
  minimumAmount,
} = {}) {
  const normalized = normalizeTransaction(transaction);
  const fields = resultFields(normalized);
  const expectedReference = String(expectedTxRef || "").trim();
  const requiredCurrency = String(expectedCurrency || "").trim().toUpperCase();
  const requiredAmount = Number(minimumAmount);

  const reject = (code) => ({ ok: false, code, ...fields });

  if (!expectedReference || !fields.txRef) {
    return reject("payment_reference_missing");
  }

  if (fields.txRef !== expectedReference) {
    return reject("payment_reference_mismatch");
  }

  if (PENDING_STATUSES.has(fields.status)) {
    return reject("payment_status_pending");
  }

  if (!SUCCESS_STATUSES.has(fields.status)) {
    return reject("payment_status_not_successful");
  }

  if (!requiredCurrency || fields.currency !== requiredCurrency) {
    return reject("payment_currency_mismatch");
  }

  if (!Number.isFinite(fields.amount) || !Number.isFinite(requiredAmount)) {
    return reject("payment_amount_invalid");
  }

  if (fields.amount < requiredAmount) {
    return reject("payment_amount_insufficient");
  }

  if (!fields.transactionId) {
    return reject("payment_transaction_id_missing");
  }

  return {
    ok: true,
    code: "payment_verified",
    ...fields,
  };
}

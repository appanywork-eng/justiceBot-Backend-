/**
 * PDPS-2.3 PRO
 * Flutterwave Payment + Verification + Persistent Storage
 */

const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");

// Location of JSON store
const STORE_PATH = path.join(__dirname, "..", "verifiedPayments.json");

// Ensure file exists
function ensureStoreFile() {
  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, JSON.stringify({}), "utf8");
  }
}

// Load store
function loadStore() {
  ensureStoreFile();
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
  } catch {
    return {};
  }
}

// Save store
function saveStore(data) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), "utf8");
}

// Mark verified
function markVerified(txRef) {
  const store = loadStore();
  store[txRef] = true;
  saveStore(store);
}

// Check verification
function isVerified(txRef) {
  const store = loadStore();
  return !!store[txRef];
}

// Generate Flutterwave payment link
async function startFlutterwavePayment(body) {
  const secret = process.env.FLW_SECRET_KEY;
  if (!secret) {
    return { ok: false, error: "Payment gateway not configured." };
  }

  const { amount = 1500, currency = "NGN", fullName, email, description } = body || {};

  const txRef = `PDK-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

  const payload = {
    tx_ref: txRef,
    amount,
    currency,
    redirect_url:
      process.env.FLW_REDIRECT_URL || "https://petitiondesk.com/payment-complete",
    customer: {
      email: email || "no-email@petitiondesk.com",
      name: fullName || "PetitionDesk User",
    },
    customizations: {
      title: "PetitionDesk – Petition Generation Fee",
      description: description?.slice(0, 200) || "Petition drafting service.",
    },
  };

  const result = await fetch("https://api.flutterwave.com/v3/payments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await result.json().catch(() => ({}));

  if (!data?.data?.link) {
    return { ok: false, error: "Unable to initialise payment." };
  }

  return {
    ok: true,
    paymentLink: data.data.link,
    txRef,
  };
}

// Verify completed payment
async function verifyFlutterwavePayment(txRef) {
  const secret = process.env.FLW_SECRET_KEY;

  try {
    const url = `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${txRef}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${secret}` },
    });

    const data = await res.json();

    if (data?.status !== "success") {
      return { ok: false, error: "Verification failed." };
    }

    // Check if already verified
    if (isVerified(txRef)) {
      return { ok: true, verified: true };
    }

    // New verification
    markVerified(txRef);
    return { ok: true, verified: true };
  } catch (e) {
    return { ok: false, error: "Verification error." };
  }
}

module.exports = {
  startFlutterwavePayment,
  verifyFlutterwavePayment,
  isVerified,
};

// core/payments.js
// Flutterwave payment initialisation + verification

const fetch = require("node-fetch");

/**
 * START PAYMENT
 */
async function startFlutterwavePayment(body) {
  try {
    const secret = process.env.FLW_SECRET_KEY;
    if (!secret) {
      return {
        ok: false,
        error: "Payment gateway not configured.",
      };
    }

    const {
      amount = 1150, // flat rate ₦1,150
      currency,
      fullName,
      email,
      description,
    } = body || {};

    const baseCurrency =
      currency || process.env.BASE_PAYMENT_CURRENCY || "NGN";

    const txRef = `PDK-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;

    const payload = {
      tx_ref: txRef,
      amount,
      currency: baseCurrency,
      redirect_url:
        process.env.FLW_REDIRECT_URL ||
        "https://petitiondesk.com/payment-complete",
      customer: {
        email: email || "no-email@petitiondesk.com",
        name: fullName || "PetitionDesk User",
      },
      customizations: {
        title: "PetitionDesk – Petition Draft",
        description:
          (description && description.slice(0, 200)) ||
          "Payment for petition drafting service.",
      },
    };

    const fwRes = await fetch(
      "https://api.flutterwave.com/v3/payments",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify(payload),
      }
    );

    const data = await fwRes.json().catch(() => ({}));

    if (!fwRes.ok || !data?.data?.link) {
      console.error("Flutterwave init error:", data);
      return {
        ok: false,
        error: "Unable to initialise payment.",
      };
    }

    return {
      ok: true,
      paymentLink: data.data.link,
      txRef,
    };
  } catch (err) {
    console.error("Payment handler error:", err);
    return {
      ok: false,
      error: "Payment error.",
    };
  }
}

/**
 * VERIFY PAYMENT
 */
async function verifyFlutterwavePayment(txRef) {
  if (!txRef) {
    return { verified: false };
  }

  const secret = process.env.FLW_SECRET_KEY;
  if (!secret) {
    throw new Error("FLW_SECRET_KEY not set");
  }

  const res = await fetch(
    `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(
      txRef
    )}`,
    {
      headers: {
        Authorization: `Bearer ${secret}`,
      },
    }
  );

  const json = await res.json().catch(() => ({}));
  const data = json?.data;

  return {
    verified: data?.status === "successful",
    amount: data?.amount,
    currency: data?.currency,
    txRef,
  };
}

module.exports = {
  startFlutterwavePayment,
  verifyFlutterwavePayment,
};

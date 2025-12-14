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
      amount = 1150, // FLAT RATE ₦1,150
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
        title: "PetitionDesk - Petition Draft",
        description:
          (description && description.slice(0, 200)) ||
          "Payment for petition drafting service.",
      },
    };

    const fwRes = await fetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(payload),
    });

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
 * Uses Flutterwave OFFICIAL verification endpoint
 */
async function verifyFlutterwavePayment(transactionId) {
  try {
    if (!transactionId) {
      return { verified: false };
    }

    const secret = process.env.FLW_SECRET_KEY;
    if (!secret) {
      return { verified: false, error: "FLW_SECRET_KEY not set" };
    }

    const res = await fetch(
      `https://api.flutterwave.com/v3/transactions/${transactionId}/verify`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${secret}`,
        },
      }
    );

    const json = await res.json().catch(() => ({}));
    const data = json?.data;

    if (
      !res.ok ||
      json.status !== "success" ||
      data?.status !== "successful" ||
      Number(data?.amount) !== 1150 ||
      data?.currency !== "NGN"
    ) {
      return { verified: false };
    }

    return {
      verified: true,
      amount: data.amount,
      currency: data.currency,
      txRef: data.tx_ref,
    };
  } catch (err) {
    console.error("Flutterwave verification error:", err);
    return { verified: false };
  }
}

module.exports = {
  startFlutterwavePayment,
  verifyFlutterwavePayment,
};

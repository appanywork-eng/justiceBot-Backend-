import crypto from "node:crypto";

export function requestAddress(request) {
  return String(
    request?.ip ||
    request?.socket?.remoteAddress ||
    "unknown"
  ).trim().slice(0, 128);
}

export function requestFingerprint(request, identity = "") {
  return crypto
    .createHash("sha256")
    .update(`${requestAddress(request)}|${String(identity || "").trim().toLowerCase()}`)
    .digest("hex");
}

export function safeSecretEqual(provided, expected) {
  const providedBuffer = Buffer.from(String(provided || ""));
  const expectedBuffer = Buffer.from(String(expected || ""));

  return providedBuffer.length > 0 &&
    providedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

export function createRequestLimiter({
  namespace,
  maximum = 10,
  windowMilliseconds = 15 * 60 * 1000,
  store = null,
  now = Date.now,
  onStoreError = () => {},
} = {}) {
  const safeNamespace = String(namespace || "request")
    .replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeMaximum = Math.max(Number(maximum) || 10, 1);
  const safeWindow = Math.max(Number(windowMilliseconds) || 15 * 60 * 1000, 1000);
  const buckets = new Map();

  return async function consume(identity) {
    const digest = crypto
      .createHash("sha256")
      .update(String(identity || "unknown"))
      .digest("hex");
    const key = `pd:limit:${safeNamespace}:${digest}`;

    if (typeof store?.consumeRateLimit === "function") {
      try {
        return await store.consumeRateLimit(key, {
          maximum: safeMaximum,
          windowMilliseconds: safeWindow,
        });
      } catch (error) {
        onStoreError(error);
      }
    }

    const currentTime = now();
    const previous = buckets.get(key);
    const active = previous && previous.resetAt > currentTime
      ? previous
      : { count: 0, resetAt: currentTime + safeWindow };

    if (active.count >= safeMaximum) {
      return {
        ok: false,
        retryAfterSeconds: Math.max(Math.ceil((active.resetAt - currentTime) / 1000), 1),
      };
    }

    active.count += 1;
    buckets.set(key, active);

    if (buckets.size > 5000) {
      for (const [bucketKey, value] of buckets) {
        if (value.resetAt <= currentTime) buckets.delete(bucketKey);
      }
    }

    return {
      ok: true,
      remaining: Math.max(safeMaximum - active.count, 0),
      retryAfterSeconds: 0,
    };
  };
}

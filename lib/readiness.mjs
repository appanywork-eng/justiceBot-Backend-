export function evaluateReadiness({
  production = false,
  firestoreEnabled = false,
  firestoreReachable = false,
  geminiConfigured = false,
  paymentConfigured = false,
  webhookConfigured = false,
} = {}) {
  if (!production) {
    return {
      ready: true,
      checks: {
        firestore: true,
        gemini: true,
        payment: true,
        webhook: true,
      },
      missing: [],
    };
  }

  const checks = {
    firestore:
      firestoreEnabled === true &&
      firestoreReachable === true,
    gemini: geminiConfigured === true,
    payment: paymentConfigured === true,
    webhook: webhookConfigured === true,
  };

  const missing = Object
    .entries(checks)
    .filter(([, ready]) => !ready)
    .map(([label]) => label);

  return {
    ready: missing.length === 0,
    checks,
    missing,
  };
}

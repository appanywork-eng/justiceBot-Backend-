#!/usr/bin/env bash
set -euo pipefail

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Required environment variable is missing: ${name}" >&2
    exit 2
  fi
}

require_env PROJECT_ID
require_env REGION
require_env SERVICE
require_env CANDIDATE_REVISION
require_env CANDIDATE_URL

command -v gcloud >/dev/null 2>&1 || {
  echo "gcloud is required" >&2
  exit 2
}
command -v node >/dev/null 2>&1 || {
  echo "node is required" >&2
  exit 2
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$PROJECT_ROOT"

READY_STATUS="$(
  gcloud run revisions describe "$CANDIDATE_REVISION" \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --platform=managed \
    --flatten='status.conditions[]' \
    --format='value(status.conditions.type,status.conditions.status)' \
    | bash scripts/select-cloud-run-traffic.sh condition Ready
)"

if [[ "$READY_STATUS" != "True" ]]; then
  echo "Candidate revision does not exist or is not Ready: ${CANDIDATE_REVISION}" >&2
  exit 1
fi

BASE_URL="$CANDIDATE_URL" EXPECTED_REVISION="$CANDIDATE_REVISION" \
  node scripts/smoke-release.mjs

PREVIOUS_REVISION="$(
  gcloud run services describe "$SERVICE" \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --platform=managed \
    --flatten='status.traffic[]' \
    --format='value(status.traffic.percent,status.traffic.revisionName)' \
    | bash scripts/select-cloud-run-traffic.sh percent 100
)"

if [[ -z "$PREVIOUS_REVISION" ]]; then
  echo "Could not identify the current 100%-serving revision; promotion stopped." >&2
  exit 1
fi

PRODUCTION_URL="$(
  gcloud run services describe "$SERVICE" \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --platform=managed \
    --format="value(status.url)"
)"

if [[ -z "$PRODUCTION_URL" ]]; then
  echo "Could not identify the production service URL; promotion stopped." >&2
  exit 1
fi

echo "Previous revision: ${PREVIOUS_REVISION}"
echo "Candidate revision: ${CANDIDATE_REVISION}"
echo "Candidate verification: passed"

gcloud run services update-traffic "$SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --platform=managed \
  --to-revisions="${CANDIDATE_REVISION}=100" \
  --quiet

if ! BASE_URL="$PRODUCTION_URL" EXPECTED_REVISION="$CANDIDATE_REVISION" \
  node scripts/smoke-release.mjs; then
  echo "Production verification failed; restoring ${PREVIOUS_REVISION}." >&2
  gcloud run services update-traffic "$SERVICE" \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --platform=managed \
    --to-revisions="${PREVIOUS_REVISION}=100" \
    --quiet
  echo "Rollback completed: ${PREVIOUS_REVISION}" >&2
  exit 1
fi

FINAL_TRAFFIC="$(
  gcloud run services describe "$SERVICE" \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --platform=managed \
    --flatten='status.traffic[]' \
    --format='value(status.traffic.percent,status.traffic.revisionName)' \
    | bash scripts/select-cloud-run-traffic.sh percent 100
)"

if [[ "$FINAL_TRAFFIC" != "$CANDIDATE_REVISION" ]]; then
  echo "Final traffic does not point to the requested candidate." >&2
  exit 1
fi

echo "Production verification: passed"
echo "Final traffic revision: ${FINAL_TRAFFIC}"

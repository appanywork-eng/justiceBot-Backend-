#!/usr/bin/env bash
set -euo pipefail

service_name="${1:-}"
build_id="${2:-}"

if [[ -z "$service_name" || -z "$build_id" ]]; then
  echo "usage: cloud-run-candidate-tag.sh SERVICE_NAME BUILD_ID" >&2
  exit 2
fi

compact_build_id="${build_id//-/}"
compact_build_id="${compact_build_id,,}"
candidate_tag="candidate-${compact_build_id:0:12}"

if [[ ! "$candidate_tag" =~ ^[a-z][a-z0-9-]*[a-z0-9]$ ]]; then
  echo "Generated candidate tag is invalid: ${candidate_tag}" >&2
  exit 1
fi

if (( ${#service_name} + ${#candidate_tag} > 63 )); then
  echo "Cloud Run service name and candidate tag exceed the safe combined limit." >&2
  exit 1
fi

printf '%s\n' "$candidate_tag"

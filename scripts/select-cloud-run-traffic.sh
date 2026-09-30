#!/usr/bin/env bash
set -euo pipefail

mode="${1:-}"
target="${2:-}"

case "$mode" in
  tag|percent|condition) ;;
  *)
    echo "usage: select-cloud-run-traffic.sh {tag|percent|condition} VALUE" >&2
    exit 2
    ;;
esac

if [[ -z "$target" ]]; then
  echo "Traffic selector value is required." >&2
  exit 2
fi

awk -F '\t' -v mode="$mode" -v target="$target" '
  $1 == target {
    if (mode == "tag" && $2 != "" && $3 != "") {
      print $2 "\t" $3
      found = 1
      exit
    }
    if ((mode == "percent" || mode == "condition") && $2 != "") {
      print $2
      found = 1
      exit
    }
  }
  END {
    if (!found) {
      exit 1
    }
  }
'

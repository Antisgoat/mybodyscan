#!/usr/bin/env bash
set -euo pipefail

BUCKET="mybodyscan-f3daf.appspot.com"

if ! command -v gsutil >/dev/null 2>&1; then
  echo "gsutil is required to read bucket CORS configuration." >&2
  exit 1
fi

echo "Current CORS settings for gs://${BUCKET}:"
gsutil cors get "gs://${BUCKET}"


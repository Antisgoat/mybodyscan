#!/usr/bin/env bash
set -euo pipefail

# Configure Firebase Storage CORS for browser uploads.
# Usage: bash scripts/configureStorageCors.sh

BUCKET="mybodyscan-f3daf.appspot.com"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORS_FILE="${SCRIPT_DIR}/cors.json"

if command -v gcloud >/dev/null 2>&1; then
  echo "Applying CORS to gs://${BUCKET} with gcloud storage…"
  gcloud storage buckets update "gs://${BUCKET}" --cors-file="${CORS_FILE}"
elif command -v gsutil >/dev/null 2>&1; then
  echo "Applying CORS to gs://${BUCKET} with gsutil…"
  gsutil cors set "${CORS_FILE}" "gs://${BUCKET}"
else
  echo "gcloud or gsutil is required to configure bucket CORS." >&2
  exit 1
fi

echo "Bucket updated: ${BUCKET}"

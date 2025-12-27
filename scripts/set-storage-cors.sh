#!/usr/bin/env bash
set -euo pipefail

BUCKET="mybodyscan-f3daf.appspot.com"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORS_FILE="${SCRIPT_DIR}/cors.json"

if [[ ! -f "${CORS_FILE}" ]]; then
  echo "CORS file not found at ${CORS_FILE}" >&2
  exit 1
fi

if ! command -v gsutil >/dev/null 2>&1; then
  echo "gsutil is required to configure bucket CORS." >&2
  exit 1
fi

echo "Applying CORS policy from ${CORS_FILE} to gs://${BUCKET}..."
gsutil cors set "${CORS_FILE}" "gs://${BUCKET}"
echo "CORS configuration updated on ${BUCKET}."


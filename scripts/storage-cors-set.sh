#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_PATH="${ROOT_DIR}/infra/storage-cors.json"
BUCKET="gs://mybodyscan-f3daf.appspot.com"

if ! command -v gsutil >/dev/null 2>&1; then
  echo "gsutil is required to set bucket CORS. Please install the Google Cloud SDK." >&2
  exit 1
fi

if [[ ! -f "${CONFIG_PATH}" ]]; then
  echo "CORS config not found at ${CONFIG_PATH}" >&2
  exit 1
fi

echo "Applying CORS configuration to ${BUCKET}..."
gsutil cors set "${CONFIG_PATH}" "${BUCKET}"
echo "Current bucket CORS:"
gsutil cors get "${BUCKET}"

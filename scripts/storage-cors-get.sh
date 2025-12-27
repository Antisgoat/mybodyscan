#!/usr/bin/env bash
set -euo pipefail

BUCKET="gs://mybodyscan-f3daf.appspot.com"

if ! command -v gsutil >/dev/null 2>&1; then
  echo "gsutil is required to read bucket CORS. Please install the Google Cloud SDK." >&2
  exit 1
fi

gsutil cors get "${BUCKET}"

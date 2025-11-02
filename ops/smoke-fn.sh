#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-mybodyscan-f3daf}"

echo "=== recent coachChat logs (most recent 50 by default) ==="
firebase functions:log --project "${PROJECT_ID}" --only "coachChat" || true

echo
echo "=== systemHealth probe ==="
HEALTH_URL="${HEALTH_URL:-https://systemhealth-534gpapj7q-uc.a.run.app}"
curl -sS "${HEALTH_URL}" | jq . || curl -sS "${HEALTH_URL}"
echo

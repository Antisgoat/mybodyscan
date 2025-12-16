#!/usr/bin/env bash
set -euo pipefail

API_KEY="${VITE_FIREBASE_API_KEY:-${FIREBASE_WEB_API_KEY:-${FIREBASE_API_KEY:-}}}"
API_KEY="${API_KEY:-AIzaSyCmtvkIuKNP-NRzH_yFUt4PyWdWCCeO0k8}"

echo "Using API_KEY=${API_KEY:0:6}***************"

JSON=$(curl -sS -X POST \
  -H "Content-Type: application/json" \
  "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}" \
  -d '{"returnSecureToken":true}')

ID_TOKEN=$(python3 -c 'import sys, json; print((json.load(sys.stdin) or {}).get("idToken",""))' <<< "$JSON" 2>/dev/null || true)

LEN=${#ID_TOKEN}
echo "ID_TOKEN_LEN=${LEN}"
if [ "$LEN" -eq 0 ]; then
  echo "ERROR: No idToken returned. Check API key, Auth authorized domains, and that Anonymous sign-in is enabled in Firebase Auth."
  exit 2
fi
echo "OK: Received idToken."

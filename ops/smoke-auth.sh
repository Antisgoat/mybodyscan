#!/usr/bin/env bash
set -euo pipefail

API_KEY="${VITE_FIREBASE_API_KEY:-${FIREBASE_WEB_API_KEY:-}}"
if [[ -z "${API_KEY}" ]]; then
  echo "ERROR: Missing VITE_FIREBASE_API_KEY (or FIREBASE_WEB_API_KEY)."
  exit 2
fi

echo "=== Identity Toolkit anonymous signUp probe ==="
URL="https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}"
RES="$(curl -sS -X POST -H "Content-Type: application/json" -d '{"returnSecureToken":true}' "${URL}" || true)"
echo "${RES}"

ID_TOKEN="$(echo "${RES}" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);console.log(j.idToken||"")}catch{console.log("")}})')"
LEN=${#ID_TOKEN}
echo "ID_TOKEN_LEN=${LEN}"
if [[ "${LEN}" -eq 0 ]]; then
  echo "If error is OPERATION_NOT_ALLOWED, enable Anonymous provider in Firebase Console → Authentication."
fi

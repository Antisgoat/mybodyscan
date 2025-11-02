#!/usr/bin/env bash
set -euo pipefail

API_KEY="${VITE_FIREBASE_API_KEY:-${1:-}}"
if [[ -z "${API_KEY}" ]]; then
  API_KEY="AIzaSyCmtvkIuKNP-NRzH_yFUt4PyWdWCCeO0k8"
fi

OUT="$(curl -sS -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}" \
  -H "Content-Type: application/json" -d '{"returnSecureToken":true}')"

python3 - <<'PY' <<<"$OUT"
import json,sys
try:
  d=json.load(sys.stdin)
  tok=d.get("idToken","")
  if tok:
    print(f"OK: got ID token ({len(tok)} chars)")
    sys.exit(0)
  else:
    print("FAIL: no idToken. payload=",d)
    sys.exit(2)
except Exception as e:
  print("FAIL: bad JSON",e)
  sys.exit(2)
PY

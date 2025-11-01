#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   PROJECT_ID=mybodyscan-f3daf ./ops/check-oauth.sh
# Requires: gcloud, jq

PROJECT_ID="${PROJECT_ID:-mybodyscan-f3daf}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1"; exit 1; }; }
need gcloud
need jq

ACCESS_TOKEN="$(gcloud auth print-access-token)"

EXPECTED_DOMAINS=(
  "mybodyscanapp.com"
  "$PROJECT_ID.firebaseapp.com"
  "$PROJECT_ID.web.app"
  "localhost"
  "127.0.0.1"
)

echo "=== Fetching Identity Toolkit config for $PROJECT_ID ==="
CONF_JSON="$(curl -sS -H "Authorization: Bearer $ACCESS_TOKEN" \
  "https://identitytoolkit.googleapis.com/v1/projects/$PROJECT_ID/config")"

# Validate JSON
echo "$CONF_JSON" | jq . >/dev/null

mapfile -t AUTH_DOMAINS < <(echo "$CONF_JSON" | jq -r '.authorizedDomains // [] | .[]')
echo "Authorized domains:"
for d in "${AUTH_DOMAINS[@]:-}"; do echo " - $d"; done

missing=()
for d in "${EXPECTED_DOMAINS[@]}"; do
  if printf '%s\0' "${AUTH_DOMAINS[@]}" | grep -Fxqz -- "$d"; then
    :
  else
    missing+=("$d")
  fi
done

if [ "${#missing[@]}" -gt 0 ]; then
  echo
  echo "MISSING domains (add in Firebase Console → Authentication → Settings → Authorized domains):"
  for d in "${missing[@]}"; do echo " - $d"; done
  exit 2
else
  echo
  echo "All expected domains are authorized ✔"
fi

echo
cat <<'EOF'
=== Provider checklist (manual verification) ===
1) Firebase Console → Authentication → Sign-in method:
   - Email/Password: Enabled
   - Google: Enabled
   - Apple: Enabled

2) Apple Sign-In (Apple Developer → Identifiers → Service IDs):
   Ensure these return URLs exist:
     https://mybodyscan-f3daf.firebaseapp.com/__/auth/handler
     https://mybodyscan-f3daf.web.app/__/auth/handler
     https://mybodyscanapp.com/__/auth/handler
   If you use a custom authDomain, include its /__/auth/handler too.

3) After changes, clear Safari site data on iOS (Settings → Safari → Advanced → Website Data)
   or use a private tab to avoid cached OAuth errors.
EOF

# end of file

#!/bin/bash
# Non-blocking check for required Firebase env vars
FILE=".env.production"
REQUIRED_KEYS=(
  VITE_FIREBASE_API_KEY
  VITE_FIREBASE_AUTH_DOMAIN
  VITE_FIREBASE_PROJECT_ID
  VITE_FIREBASE_STORAGE_BUCKET
  VITE_FIREBASE_MESSAGING_SENDER_ID
  VITE_FIREBASE_APP_ID
  VITE_FIREBASE_MEASUREMENT_ID
  VITE_FUNCTIONS_BASE_URL
  VITE_ENABLE_PUBLIC_MARKETING_PAGE
  VITE_SCAN_MODE
  VITE_APPCHECK_SITE_KEY
)

if [ ! -f "$FILE" ]; then
  echo "[check-firebase-env] $FILE not found"
  exit 0
fi
missing=()
for key in "${REQUIRED_KEYS[@]}"; do
  if ! grep -q "^$key=" "$FILE" || [ -z "$(grep "^$key=" "$FILE" | cut -d= -f2-)" ]; then
    missing+=("$key")
  fi
done
if [ ${#missing[@]} -gt 0 ]; then
  echo "[check-firebase-env] Missing values for: ${missing[*]}"
  echo "Please copy them from Firebase Console > Project settings."
else
  echo "[check-firebase-env] All Firebase env keys present."
fi
exit 0

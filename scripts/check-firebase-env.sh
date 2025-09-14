#!/usr/bin/env bash
set -euo pipefail
missing=0
vars=(
  VITE_FIREBASE_API_KEY
  VITE_FIREBASE_AUTH_DOMAIN
  VITE_FIREBASE_PROJECT_ID
  VITE_FIREBASE_STORAGE_BUCKET
  VITE_FIREBASE_MESSAGING_SENDER_ID
  VITE_FIREBASE_APP_ID
)
for v in "${vars[@]}"; do
  if ! grep -q "^$v=" .env.local .env .env.production 2>/dev/null; then
    echo "❌ Missing: $v (not found in .env.local / .env / .env.production)"
    missing=1
  else
    # Check not empty
    val=$(grep -h "^$v=" .env.local .env .env.production 2>/dev/null | tail -n1 | cut -d= -f2-)
    if [ -z "$val" ]; then
      echo "❌ Empty value: $v"
      missing=1
    else
      echo "✅ $v present"
    fi
  fi
done
if [ "$missing" -eq 1 ]; then
  echo ""
  echo "Fix the missing/empty env vars above (copy from your known-good Firebase config)."
  echo "Then re-run: npm run build && npm run preview"
  exit 2
fi
echo "All required Firebase env vars found."

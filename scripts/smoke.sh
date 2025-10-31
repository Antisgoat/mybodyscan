#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

FIREBASE_API_KEY="${VITE_FIREBASE_API_KEY:-}"

if [[ -z "$FIREBASE_API_KEY" ]]; then
  for env_file in ".env.production" ".env.production.local" ".env.local" ".env"; do
    if [[ -f "$ROOT_DIR/$env_file" ]]; then
      candidate=$(grep -E '^VITE_FIREBASE_API_KEY=' "$ROOT_DIR/$env_file" | tail -n1 | cut -d= -f2- | tr -d '\r')
      if [[ -n "$candidate" ]]; then
        FIREBASE_API_KEY="$candidate"
        break
      fi
    fi
  done
fi

if [[ -z "$FIREBASE_API_KEY" ]]; then
  echo "[smoke] VITE_FIREBASE_API_KEY is not set. Export it or add it to an env file." >&2
  exit 1
fi

BASE_URL="${BASE_URL:-https://mybodyscanapp.com}"
SYSTEM_URL="${BASE_URL}/systemHealth"
if [[ -n "$FIREBASE_API_KEY" ]]; then
  SYSTEM_URL="${SYSTEM_URL}?clientKey=${FIREBASE_API_KEY}"
fi
NUTRITION_URL="${BASE_URL}/nutritionSearch?q=apple"
COACH_URL="${BASE_URL}/coachChat"
CHECKOUT_URL="${BASE_URL}/createCheckout"

TMP_EMAIL="smoke-$(date +%s%N)@example.com"
TMP_PASSWORD="SmokeTest123!"

echo "[smoke] Creating temporary account ${TMP_EMAIL}"
SIGNUP_RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" \
  -d "{\"email\":\"${TMP_EMAIL}\",\"password\":\"${TMP_PASSWORD}\",\"returnSecureToken\":true}" \
  "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}")

ID_TOKEN=$(echo "$SIGNUP_RESPONSE" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("idToken",""))')
LOCAL_ID=$(echo "$SIGNUP_RESPONSE" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("localId",""))')

if [[ -z "$ID_TOKEN" ]]; then
  echo "[smoke] Failed to obtain ID token" >&2
  echo "$SIGNUP_RESPONSE" >&2
  exit 1
fi

cleanup() {
  if [[ -n "$ID_TOKEN" ]]; then
    curl -s -o /dev/null -X POST -H "Content-Type: application/json" \
      -d "{\"idToken\":\"${ID_TOKEN}\"}" \
      "https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${FIREBASE_API_KEY}" || true
  fi
}
trap cleanup EXIT

echo "[smoke] Temporary UID ${LOCAL_ID}"

hit() {
  local name="$1"
  local method="$2"
  local url="$3"
  local body="${4:-}"

  echo "[smoke] ${name}: ${method} ${url}"
  if [[ "$method" == "GET" ]]; then
    response=$(curl -s -w '\n%{http_code}' -H "Authorization: Bearer ${ID_TOKEN}" "$url")
  else
    response=$(curl -s -w '\n%{http_code}' -H "Authorization: Bearer ${ID_TOKEN}" -H "Content-Type: application/json" -d "$body" "$url")
  fi

  status=$(echo "$response" | tail -n1)
  content=$(echo "$response" | sed '$d')
  echo "HTTP ${status}"
  echo "$content" | head -c 200
  echo -e "\n"
}

hit "systemHealth" "GET" "$SYSTEM_URL"
hit "nutritionSearch" "GET" "$NUTRITION_URL"
hit "coachChat" "POST" "$COACH_URL" '{"message":"Diagnostics smoke test"}'

PRICE_ID="${VITE_PRICE_STARTER:-}"
if [[ -z "$PRICE_ID" ]]; then
  PRICE_ID="price_test_placeholder"
fi
hit "createCheckout" "POST" "$CHECKOUT_URL" "{\"priceId\":\"${PRICE_ID}\"}"

echo "[smoke] Completed"

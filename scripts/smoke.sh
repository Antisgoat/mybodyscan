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
COACH_URL="${BASE_URL}/api/coach/chat"
CHECKOUT_URL="${BASE_URL}/api/createCheckout"
NUTRITION_URL="${BASE_URL}/api/nutrition/search?q=chicken%20breast"
SYSTEM_URL="${BASE_URL}/systemHealth?clientKey=${FIREBASE_API_KEY}"

PRICE_ID="${VITE_PRICE_STARTER:-}"
if [[ -z "$PRICE_ID" ]]; then
  for env_file in ".env.production" ".env.production.local" ".env.local" ".env"; do
    if [[ -f "$ROOT_DIR/$env_file" ]]; then
      candidate=$(grep -E '^VITE_PRICE_STARTER=' "$ROOT_DIR/$env_file" | tail -n1 | cut -d= -f2- | tr -d '\r')
      if [[ -n "$candidate" ]]; then
        PRICE_ID="$candidate"
        break
      fi
    fi
  done
fi

echo "[smoke] Requesting anonymous ID token"
SIGNUP_RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"returnSecureToken":true}' \
  "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}")

ID_TOKEN=$(printf '%s' "$SIGNUP_RESPONSE" | node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync(0,'utf8'));console.log(d.idToken||'');")
LOCAL_ID=$(printf '%s' "$SIGNUP_RESPONSE" | node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync(0,'utf8'));console.log(d.localId||'');")

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

FAILURES=()

call_endpoint() {
  local name="$1"
  local method="$2"
  local url="$3"
  local body="${4:-}"

  echo "[smoke] ${name}: ${method} ${url}"
  local response
  if [[ "$method" == "GET" ]]; then
    response=$(curl -s -w '\n%{http_code}' -H "Accept: application/json" -H "Authorization: Bearer ${ID_TOKEN}" "$url")
  else
    response=$(curl -s -w '\n%{http_code}' -H "Accept: application/json" -H "Authorization: Bearer ${ID_TOKEN}" -H "Content-Type: application/json" -d "$body" "$url")
  fi

  local status=$(echo "$response" | tail -n1)
  local content=$(echo "$response" | sed '$d')

  echo "HTTP ${status}"
  echo "$content" | head -c 200
  echo -e "\n"

  case "$name" in
    coachChat)
      if [[ "$status" =~ ^(200|501|502)$ ]]; then
        return
      fi
      if [[ "$status" == "401" ]] && echo "$content" | grep -q 'app_check'; then
        echo "[smoke] coachChat responded with app_check requirement"
        return
      fi
      FAILURES+=("coachChat:${status}")
      ;;
    createCheckout)
      if [[ "$status" == "200" ]]; then
        local sessionField=$(printf '%s' "$content" | node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync(0,'utf8'));console.log(typeof d.sessionId==='string' && d.sessionId ? 1 : 0);")
        if [[ "$sessionField" == "1" ]]; then
          return
        fi
      fi
      FAILURES+=("createCheckout:${status}")
      ;;
    nutritionSearch)
      if [[ "$status" == "200" ]]; then
        return
      fi
      if [[ "$status" == "401" ]] && echo "$content" | grep -q 'auth_required'; then
        echo "[smoke] nutritionSearch responded with auth_required"
        FAILURES+=("nutritionSearch:${status}")
        return
      fi
      FAILURES+=("nutritionSearch:${status}")
      ;;
    systemHealth)
      if [[ "$status" == "200" ]]; then
        return
      fi
      FAILURES+=("systemHealth:${status}")
      ;;
  esac
}

call_endpoint "systemHealth" "GET" "$SYSTEM_URL"
call_endpoint "nutritionSearch" "GET" "$NUTRITION_URL"
call_endpoint "coachChat" "POST" "$COACH_URL" '{"message":"Diagnostics smoke test"}'

if [[ -n "$PRICE_ID" ]]; then
  call_endpoint "createCheckout" "POST" "$CHECKOUT_URL" "{\"priceId\":\"${PRICE_ID}\"}"
else
  echo "[smoke] VITE_PRICE_STARTER not set; skipping checkout probe"
fi

if [[ ${#FAILURES[@]} -gt 0 ]]; then
  echo "[smoke] Failures detected: ${FAILURES[*]}" >&2
  exit 1
fi

echo "[smoke] Completed"

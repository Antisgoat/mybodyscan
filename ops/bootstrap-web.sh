#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-mybodyscan-f3daf}"
APP_NICKNAME="${APP_NICKNAME:-MyBodyScan Web}"
ENV_FILE="${ENV_FILE:-.env.local}"

have_cmd() { command -v "$1" >/dev/null 2>&1; }

if ! have_cmd firebase; then
  echo "firebase CLI not found. Install: npm i -g firebase-tools" >&2
  exit 1
fi

echo ">>> Using project: ${PROJECT_ID}"
firebase use "${PROJECT_ID}" >/dev/null 2>&1 || firebase use --add "${PROJECT_ID}"

# Find or create a WEB app
APP_ID="$(firebase apps:list --project "${PROJECT_ID}" --json | node -e 'const fs = require("fs"); const d = JSON.parse(fs.readFileSync(0, "utf8")); const apps = (d.result || []).filter((a) => a.platform === "WEB"); console.log(apps.length ? apps[0].appId : "");')"

if [ -z "${APP_ID}" ]; then
  echo ">>> No WEB app found. Creating one..."
  APP_ID="$(firebase apps:create web "${APP_NICKNAME}" --project "${PROJECT_ID}" --json | node -e 'const fs = require("fs"); const d = JSON.parse(fs.readFileSync(0, "utf8")); console.log(d.result.appId);')"
  echo ">>> Created WEB app: ${APP_ID}"
else
  echo ">>> Found WEB app: ${APP_ID}"
fi

# Fetch SDK config
SDK_JSON="$(firebase apps:sdkconfig web "${APP_ID}" --project "${PROJECT_ID}" --json)"
API_KEY="$(echo "${SDK_JSON}" | node -e 'const fs = require("fs"); const d = JSON.parse(fs.readFileSync(0, "utf8")); console.log(d.result.sdkConfig.apiKey || "");')"
AUTH_DOMAIN="$(echo "${SDK_JSON}" | node -e 'const fs = require("fs"); const d = JSON.parse(fs.readFileSync(0, "utf8")); console.log(d.result.sdkConfig.authDomain || "");')"
PROJ_ID="$(echo "${SDK_JSON}" | node -e 'const fs = require("fs"); const d = JSON.parse(fs.readFileSync(0, "utf8")); console.log(d.result.sdkConfig.projectId || "");')"
APP_ID_VAL="$(echo "${SDK_JSON}" | node -e 'const fs = require("fs"); const d = JSON.parse(fs.readFileSync(0, "utf8")); console.log(d.result.sdkConfig.appId || "");')"
STORAGE_BUCKET="$(echo "${SDK_JSON}" | node -e 'const fs = require("fs"); const d = JSON.parse(fs.readFileSync(0, "utf8")); console.log(d.result.sdkConfig.storageBucket || "");')"
MSG_SENDER_ID="$(echo "${SDK_JSON}" | node -e 'const fs = require("fs"); const d = JSON.parse(fs.readFileSync(0, "utf8")); console.log(d.result.sdkConfig.messagingSenderId || "");')"

echo ">>> Writing ${ENV_FILE}"
cat > "${ENV_FILE}" <<EOF_ENV
VITE_FIREBASE_API_KEY=${API_KEY}
VITE_FIREBASE_AUTH_DOMAIN=${AUTH_DOMAIN}
VITE_FIREBASE_PROJECT_ID=${PROJ_ID}
VITE_FIREBASE_APP_ID=${APP_ID_VAL}
VITE_FIREBASE_STORAGE_BUCKET=${STORAGE_BUCKET}
VITE_FIREBASE_MESSAGING_SENDER_ID=${MSG_SENDER_ID}

# Optional: App Check (recaptcha v3 site key). Leave blank to skip.
VITE_APPCHECK_SITE_KEY=
EOF_ENV

echo ">>> Done. Inspect ${ENV_FILE}. Rebuild the web app after changes."

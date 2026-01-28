#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== MyBodyScan Doctor =="

echo "Node: $(node -v)"
echo "npm: $(npm -v)"

if ! command -v rg >/dev/null 2>&1; then
  echo "Missing required tool: rg (ripgrep)" >&2
  exit 2
fi

if rg -n "server\.url" capacitor.config.ts ios android 2>/dev/null; then
  echo "ERROR: server.url detected in Capacitor config." >&2
  exit 2
fi

echo "Capacitor config: OK (no server.url)"

if [ ! -f dist/index.html ]; then
  echo "ERROR: dist/index.html missing. Run: npm run build:web" >&2
  exit 2
fi

echo "Web build: dist/index.html present"

if [ ! -f ios/App/App/public/index.html ]; then
  echo "ERROR: ios/App/App/public/index.html missing. Run: npm run sync:ios" >&2
  exit 2
fi

echo "iOS public assets: OK"

if [ ! -d ios/App ]; then
  echo "ERROR: ios/App missing. Run: npx cap add ios" >&2
  exit 2
fi

echo "iOS project: OK"

if [ ! -d android ]; then
  echo "ERROR: android/ missing. Run: npx cap add android and commit the result." >&2
  exit 2
fi

echo "Android project: OK"

if [ -d android ] && [ ! -f android/app/google-services.json ]; then
  echo "ERROR: android/app/google-services.json missing." >&2
  exit 2
fi

echo "Android Firebase config: OK"

echo "Doctor checks complete."

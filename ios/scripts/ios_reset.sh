#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
IOS_APP_DIR="${REPO_ROOT}/ios/App"

cd "${REPO_ROOT}"
node scripts/assert-repo-root.mjs
node scripts/assert-no-native-firebase-auth.mjs

echo "Resetting iOS build artifacts..."

DERIVED_DATA_DIR="${HOME}/Library/Developer/Xcode/DerivedData"
if [ -d "${DERIVED_DATA_DIR}" ]; then
  shopt -s nullglob
  for path in "${DERIVED_DATA_DIR}/App-"* "${DERIVED_DATA_DIR}/MyBodyScan-"*; do
    rm -rf "${path}"
  done
  shopt -u nullglob
fi

rm -rf "${IOS_APP_DIR}/Pods" "${IOS_APP_DIR}/Podfile.lock" "${IOS_APP_DIR}/App.xcworkspace"

if [ ! -d "${REPO_ROOT}/node_modules" ]; then
  echo "Installing npm dependencies..."
  if [ -f "${REPO_ROOT}/package-lock.json" ]; then
    (cd "${REPO_ROOT}" && npm ci)
  else
    (cd "${REPO_ROOT}" && npm install --prefer-online --no-audit --no-fund)
  fi
else
  echo "node_modules already present. Skipping npm install."
fi

echo "Ensuring Firebase plist (if available)..."
(cd "${REPO_ROOT}" && bash scripts/ios-ensure-firebase-plist.sh)

echo "Building web assets for native..."
(cd "${REPO_ROOT}" && npm run build:native)

echo "Syncing Capacitor iOS..."
(cd "${REPO_ROOT}" && npx cap sync ios)
(cd "${REPO_ROOT}" && node scripts/assert-no-native-firebase-auth.mjs)
(cd "${REPO_ROOT}" && node scripts/assert-ios-public-bundle.mjs)

if ! command -v pod >/dev/null 2>&1; then
  echo "error: CocoaPods is not installed. Install CocoaPods and re-run this script." >&2
  exit 1
fi

echo "Running pod install..."
(cd "${IOS_APP_DIR}" && pod install)

if command -v open >/dev/null 2>&1; then
  echo "Opening Xcode workspace..."
  open "${IOS_APP_DIR}/App.xcworkspace"
else
  echo "info: 'open' not available; open ios/App/App.xcworkspace manually."
fi

echo "iOS reset complete."

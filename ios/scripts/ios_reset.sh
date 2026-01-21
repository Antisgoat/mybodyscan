#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
IOS_APP_DIR="${REPO_ROOT}/ios/App"

echo "Resetting iOS build artifacts..."

DERIVED_DATA_DIR="${HOME}/Library/Developer/Xcode/DerivedData"
if [ -d "${DERIVED_DATA_DIR}" ]; then
  shopt -s nullglob
  for path in "${DERIVED_DATA_DIR}/App-"* "${DERIVED_DATA_DIR}/MyBodyScan-"*; do
    rm -rf "${path}"
  done
  shopt -u nullglob
fi

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

echo "Building web assets for native..."
(cd "${REPO_ROOT}" && npm run build:native)

echo "Syncing Capacitor iOS..."
(cd "${REPO_ROOT}" && npx cap sync ios)

if ! command -v pod >/dev/null 2>&1; then
  echo "error: CocoaPods is not installed. Install CocoaPods and re-run this script." >&2
  exit 1
fi

echo "Running pod install..."
(cd "${IOS_APP_DIR}" && pod install)

echo "iOS reset complete."

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${REPO_ROOT}"

if [[ ! -f "${REPO_ROOT}/package.json" ]]; then
  echo "error: package.json not found. Run this script from the repo root." >&2
  exit 1
fi

if [[ ! -d "${REPO_ROOT}/node_modules" ]]; then
  echo "info: node_modules missing, running npm install"
  npm install
fi

echo "info: cleaning native build artifacts"
rm -rf "${REPO_ROOT}/dist" "${REPO_ROOT}/ios/App/App/public" "${REPO_ROOT}/ios/App/DerivedData"

DERIVED_DATA_ROOT="${HOME}/Library/Developer/Xcode/DerivedData"
if [[ -d "${DERIVED_DATA_ROOT}" ]]; then
  shopt -s nullglob
  APP_DERIVED_DATA=("${DERIVED_DATA_ROOT}"/App-*)
  if [[ ${#APP_DERIVED_DATA[@]} -gt 0 ]]; then
    rm -rf "${APP_DERIVED_DATA[@]}"
  fi
  shopt -u nullglob
fi

echo "info: building web bundle"
npm run build

echo "info: syncing Capacitor iOS"
npx cap sync ios

echo "info: verifying no native Firebase plugins"
node scripts/assert-no-native-firebase-auth.mjs

echo "info: validating bundled iOS web assets"
node scripts/assert-ios-public-bundle.mjs

if ! command -v pod >/dev/null 2>&1; then
  echo "error: CocoaPods (pod) not found. Install CocoaPods and re-run." >&2
  exit 1
fi

echo "info: installing CocoaPods"
(cd "${REPO_ROOT}/ios/App" && pod install --repo-update)

if [[ ! -d "${REPO_ROOT}/ios/App/App.xcworkspace" ]]; then
  echo "error: ios/App/App.xcworkspace missing. Run npm run ios:reset again." >&2
  exit 1
fi

if command -v open >/dev/null 2>&1; then
  echo "info: opening Xcode workspace"
  open "${REPO_ROOT}/ios/App/App.xcworkspace"
else
  echo "warn: 'open' not available. Open ios/App/App.xcworkspace manually."
fi

echo "info: ios reset complete"

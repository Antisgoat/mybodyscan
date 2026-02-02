#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${REPO_ROOT}"

if [[ ! -f "${REPO_ROOT}/package.json" || ! -d "${REPO_ROOT}/ios" ]]; then
  echo "error: package.json or ios/ not found. Run this script from the repo root." >&2
  exit 1
fi

if [[ ! -d "${REPO_ROOT}/node_modules" ]]; then
  echo "info: node_modules missing, running npm install"
  npm install
fi

BUILD_CMD="build"
if node -e "const scripts=require('./package.json').scripts||{}; process.exit(scripts['build:web'] ? 0 : 1)"; then
  BUILD_CMD="build:web"
fi

echo "info: building web bundle (npm run ${BUILD_CMD})"
npm run "${BUILD_CMD}"

echo "info: syncing Capacitor iOS"
npx cap sync ios

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

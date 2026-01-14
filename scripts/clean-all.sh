#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

rm -rf dist
rm -rf node_modules
rm -rf functions/node_modules
rm -rf ios/App/build
rm -rf android/.gradle android/build android/app/build 2>/dev/null || true

rm -rf "$HOME/Library/Developer/Xcode/DerivedData" 2>/dev/null || true

if [ -d ios/App ]; then
  rm -rf ios/App/Pods
fi

echo "Cleaned web, functions, iOS, and Android build artifacts."

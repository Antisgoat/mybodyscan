#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -d ios/App ]; then
  echo "ERROR: ios/App missing. Run: npx cap add ios" >&2
  exit 2
fi

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "ERROR: xcodebuild not found. Install Xcode and retry." >&2
  exit 2
fi

echo "== iOS Release build =="

rm -rf "$HOME/Library/Developer/Xcode/DerivedData" || true

pushd ios/App >/dev/null
if ! command -v pod >/dev/null 2>&1; then
  echo "ERROR: CocoaPods not found. Install with: sudo gem install cocoapods" >&2
  exit 2
fi

pod install

xcodebuild \
  -workspace App.xcworkspace \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  build
popd >/dev/null

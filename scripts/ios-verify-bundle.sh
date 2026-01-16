#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DERIVED_DATA_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$DERIVED_DATA_DIR"
}
trap cleanup EXIT

xcodebuild \
  -workspace "$ROOT_DIR/ios/App/App.xcworkspace" \
  -scheme App \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination "generic/platform=iOS Simulator" \
  -derivedDataPath "$DERIVED_DATA_DIR" \
  clean build

APP_PATH="$(find "$DERIVED_DATA_DIR/Build/Products" -maxdepth 3 -type d -name "App.app" | head -n 1)"
if [[ -z "$APP_PATH" ]]; then
  echo "App.app not found in DerivedData." >&2
  exit 1
fi

INFO_PLIST="$APP_PATH/Info.plist"
if [[ ! -f "$INFO_PLIST" ]]; then
  echo "Info.plist not found at $INFO_PLIST" >&2
  exit 1
fi

CF_BUNDLE_EXECUTABLE="$(/usr/libexec/PlistBuddy -c "Print :CFBundleExecutable" "$INFO_PLIST" 2>/dev/null || true)"
if [[ -z "$CF_BUNDLE_EXECUTABLE" ]]; then
  echo "CFBundleExecutable missing in Info.plist." >&2
  exit 1
fi

EXECUTABLE_PATH="$APP_PATH/$CF_BUNDLE_EXECUTABLE"
if [[ ! -f "$EXECUTABLE_PATH" ]]; then
  echo "Executable $CF_BUNDLE_EXECUTABLE not found at $EXECUTABLE_PATH" >&2
  exit 1
fi

echo "Verified CFBundleExecutable=$CF_BUNDLE_EXECUTABLE at $EXECUTABLE_PATH"

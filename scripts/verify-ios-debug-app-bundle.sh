#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DERIVED_DATA_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$DERIVED_DATA_DIR"
}
trap cleanup EXIT

xcodebuild \
  -project "$ROOT_DIR/ios/App/App.xcodeproj" \
  -scheme App \
  -configuration Debug \
  -sdk iphonesimulator \
  -derivedDataPath "$DERIVED_DATA_DIR" \
  build

APP_PATH="$DERIVED_DATA_DIR/Build/Products/Debug-iphonesimulator/App.app"
INFO_PLIST="$APP_PATH/Info.plist"

if [[ ! -d "$APP_PATH" ]]; then
  echo "Expected app bundle not found at $APP_PATH" >&2
  exit 1
fi

if [[ ! -f "$INFO_PLIST" ]]; then
  echo "Info.plist not found at $INFO_PLIST" >&2
  exit 1
fi

CF_BUNDLE_EXECUTABLE=$(/usr/libexec/PlistBuddy -c "Print :CFBundleExecutable" "$INFO_PLIST" 2>/dev/null || true)

if [[ -z "$CF_BUNDLE_EXECUTABLE" ]]; then
  echo "CFBundleExecutable is missing or empty in $INFO_PLIST" >&2
  exit 1
fi

EXECUTABLE_PATH="$APP_PATH/$CF_BUNDLE_EXECUTABLE"

if [[ ! -x "$EXECUTABLE_PATH" ]]; then
  echo "Executable $EXECUTABLE_PATH is missing or not executable" >&2
  exit 1
fi

echo "Verified CFBundleExecutable ($CF_BUNDLE_EXECUTABLE) exists and is executable."

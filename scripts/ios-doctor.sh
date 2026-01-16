#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

fail() {
  echo "" >&2
  echo "FAIL: $1" >&2
  if [ "${2-}" != "" ]; then
    echo "DETAILS: $2" >&2
  fi
  exit 1
}

step() {
  echo ""
  echo "==> $1"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "Missing required command: $1"
  fi
}

step "Checking required tools"
require_cmd node
require_cmd npm
require_cmd npx
require_cmd xcodebuild
require_cmd xcrun
require_cmd pod
require_cmd /usr/libexec/PlistBuddy

step "Installing npm dependencies"
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

step "Building web app"
npm run build

step "Syncing Capacitor iOS project"
npx cap sync ios

step "Installing CocoaPods dependencies"
(
  cd ios/App
  pod install --repo-update
)

step "Clearing DerivedData for App-*"
DERIVED_DATA_ROOT="$HOME/Library/Developer/Xcode/DerivedData"
if [ -d "$DERIVED_DATA_ROOT" ]; then
  shopt -s nullglob
  APP_DERIVED_DATA=("$DERIVED_DATA_ROOT"/App-*)
  if [ ${#APP_DERIVED_DATA[@]} -gt 0 ]; then
    rm -rf "${APP_DERIVED_DATA[@]}"
  fi
  shopt -u nullglob
fi

step "Resetting iOS simulators"
xcrun simctl shutdown all || true
xcrun simctl erase all

step "Building iOS app for simulator (Debug)"
DERIVED_DATA_PATH="$ROOT_DIR/ios/App/DerivedData"
rm -rf "$DERIVED_DATA_PATH"

xcodebuild clean build \
  -workspace ios/App/App.xcworkspace \
  -scheme App \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath "$DERIVED_DATA_PATH"

step "Locating built App.app"
APP_BUNDLE_PATH="$(find "$DERIVED_DATA_PATH" -type d -name "App.app" -path "*/Build/Products/*-iphonesimulator/*" -print -quit)"
if [ -z "$APP_BUNDLE_PATH" ]; then
  fail "Unable to locate App.app in DerivedData" "$DERIVED_DATA_PATH"
fi

echo "Found app bundle: $APP_BUNDLE_PATH"

INFO_PLIST_PATH="$APP_BUNDLE_PATH/Info.plist"
if [ ! -f "$INFO_PLIST_PATH" ]; then
  fail "Info.plist missing from app bundle" "$INFO_PLIST_PATH"
fi

step "Verifying Info.plist and executable"
CF_BUNDLE_EXECUTABLE="$(/usr/libexec/PlistBuddy -c 'Print CFBundleExecutable' "$INFO_PLIST_PATH" 2>/dev/null || true)"
if [ -z "$CF_BUNDLE_EXECUTABLE" ]; then
  fail "CFBundleExecutable missing from Info.plist" "$INFO_PLIST_PATH"
fi

EXECUTABLE_PATH="$APP_BUNDLE_PATH/$CF_BUNDLE_EXECUTABLE"
if [ ! -f "$EXECUTABLE_PATH" ]; then
  fail "Executable missing from app bundle" "$EXECUTABLE_PATH"
fi

CF_BUNDLE_IDENTIFIER="$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$INFO_PLIST_PATH" 2>/dev/null || true)"
EXPECTED_BUNDLE_ID="com.mybodyscan.app"
if [ "$CF_BUNDLE_IDENTIFIER" != "$EXPECTED_BUNDLE_ID" ]; then
  fail "CFBundleIdentifier mismatch" "Expected $EXPECTED_BUNDLE_ID, found $CF_BUNDLE_IDENTIFIER"
fi

step "PASS"
echo "iOS build verified successfully."
echo "App bundle: $APP_BUNDLE_PATH"
echo "Executable: $EXECUTABLE_PATH"
echo "Bundle ID: $CF_BUNDLE_IDENTIFIER"

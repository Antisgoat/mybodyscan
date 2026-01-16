#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
APP_DIR="${IOS_DIR}/App"

cd "${APP_DIR}"

if ! command -v pod >/dev/null 2>&1; then
  echo "error: CocoaPods is not installed. Install CocoaPods and re-run this script." >&2
  exit 1
fi

if [ ! -f "Pods/Manifest.lock" ] || [ "Podfile.lock" -nt "Pods/Manifest.lock" ]; then
  echo "Running pod install..."
  pod install
else
  echo "Pods are up to date."
fi

DERIVED_DATA_DEFAULT="${HOME}/Library/Developer/Xcode/DerivedData"
if [ -d "${DERIVED_DATA_DEFAULT}" ]; then
  rm -rf "${DERIVED_DATA_DEFAULT}/App-"*
fi

DERIVED_DATA_DIR="${TMPDIR:-/tmp}/mybodyscan-derived-data"
rm -rf "${DERIVED_DATA_DIR}"

echo "Building Debug simulator..."
xcodebuild \
  -workspace App.xcworkspace \
  -scheme App \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath "${DERIVED_DATA_DIR}" \
  clean build

APP_PATH="$(find "${DERIVED_DATA_DIR}" -type d -path "*Build/Products/Debug-iphonesimulator/App.app" -print -quit)"
if [ -z "${APP_PATH}" ]; then
  echo "error: Unable to locate built App.app under ${DERIVED_DATA_DIR}." >&2
  exit 1
fi

PLIST_PATH="${APP_PATH}/Info.plist"
if [ ! -f "${PLIST_PATH}" ]; then
  echo "error: Info.plist missing at ${PLIST_PATH}." >&2
  exit 1
fi

BUNDLE_EXECUTABLE=$(/usr/libexec/PlistBuddy -c "Print CFBundleExecutable" "${PLIST_PATH}" 2>/dev/null || true)
if [ -z "${BUNDLE_EXECUTABLE}" ]; then
  echo "error: CFBundleExecutable missing in ${PLIST_PATH}." >&2
  exit 1
fi

if [ ! -f "${APP_PATH}/${BUNDLE_EXECUTABLE}" ]; then
  echo "error: Executable '${BUNDLE_EXECUTABLE}' missing in ${APP_PATH}." >&2
  exit 1
fi

echo "CFBundleExecutable: ${BUNDLE_EXECUTABLE}"
echo "Executable file: ${APP_PATH}/${BUNDLE_EXECUTABLE}"

echo "Installing on simulator..."
xcrun simctl install booted "${APP_PATH}"

echo "Preflight succeeded."

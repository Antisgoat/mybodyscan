#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
APP_DIR="${REPO_ROOT}/ios/App"
ARCHIVE_DIR="${APP_DIR}/build"
ARCHIVE_PATH="${ARCHIVE_DIR}/App.xcarchive"

cd "${APP_DIR}"

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "error: xcodebuild not found. Install Xcode and command line tools." >&2
  exit 1
fi

if ! command -v pod >/dev/null 2>&1; then
  echo "error: CocoaPods is not installed. Install CocoaPods and re-run this script." >&2
  exit 1
fi

if [ ! -f "Pods/Manifest.lock" ] || [ ! -f "App.xcworkspace" ] || [ "Podfile.lock" -nt "Pods/Manifest.lock" ]; then
  echo "Running pod install..."
  pod install
fi

echo "Validating Firebase plist for Release..."
CONFIGURATION=Release bash "${REPO_ROOT}/ios/scripts/validate_firebase_plist.sh"

mkdir -p "${ARCHIVE_DIR}"

echo "Archiving for App Store..."
xcodebuild \
  -workspace App.xcworkspace \
  -scheme App \
  -configuration Release \
  -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  -archivePath "${ARCHIVE_PATH}" \
  archive

echo "Archive created at: ${ARCHIVE_PATH}"

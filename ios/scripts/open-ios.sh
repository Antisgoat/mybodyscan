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

if [ ! -f "Pods/Manifest.lock" ] || [ ! -f "App.xcworkspace" ] || [ "Podfile.lock" -nt "Pods/Manifest.lock" ]; then
  echo "Running pod install..."
  pod install
else
  echo "Pods are up to date."
fi

echo "Opening App.xcworkspace..."
open "App.xcworkspace"

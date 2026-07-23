#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$repo_root"

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "error: xcodebuild not found. Install Xcode and command line tools." >&2
  exit 1
fi

if [[ ! -f ios/App/App/GoogleService-Info.plist ]]; then
  echo "error: ios/App/App/GoogleService-Info.plist is required for the Firebase iOS app." >&2
  exit 1
fi

echo "==> Verifying native configuration"
npm run ios:doctor

echo "==> Building the App Store web bundle"
# This fails closed if the real public RevenueCat iOS key is absent, if a Test
# Store key is supplied, or if the entitlement differs from the backend's `pro`.
npm run build:native:release

echo "==> Synchronizing Capacitor and CocoaPods"
npx cap sync ios
node scripts/assert-no-native-firebase-auth.mjs
node scripts/assert-ios-public-bundle.mjs
(cd ios/App && pod install)

mkdir -p ios/build

archive_log="$(mktemp "${TMPDIR:-/tmp}/mbs-archive.XXXXXX")"
trap 'rm -f "$archive_log"' EXIT

xcodebuild \
  -workspace ios/App/App.xcworkspace \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath ios/build/MyBodyScan.xcarchive \
  -allowProvisioningUpdates \
  archive | tee "$archive_log"
grep -n "error:" "$archive_log" && exit 1 || true

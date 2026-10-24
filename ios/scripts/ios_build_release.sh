#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$repo_root"

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "error: xcodebuild not found. Install Xcode and command line tools." >&2
  exit 1
fi

if [[ ! -d ios/App/App.xcworkspace ]]; then
  echo "error: ios/App/App.xcworkspace not found. Run npm run ios:reset first." >&2
  exit 1
fi

node scripts/assert-ios-public-bundle.mjs

log_path="/tmp/mbs-release.log"
signing_options=()
if [[ "${MBS_IOS_COMPILE_ONLY:-0}" == "1" ]]; then
  echo "Compile-only check: this does not verify App Store signing."
  signing_options+=(CODE_SIGNING_ALLOWED=NO)
fi
if ! xcodebuild -workspace ios/App/App.xcworkspace -scheme App -configuration Release -destination 'generic/platform=iOS' "${signing_options[@]}" build | tee "$log_path"; then
  echo "error: xcodebuild Release failed. Showing the first error lines:" >&2
  grep -n "error:" "$log_path" | head -n 120 >&2 || true
  exit 1
fi
grep -n "error:" "$log_path" | head -n 80 || echo "✅ NO RELEASE ERRORS"

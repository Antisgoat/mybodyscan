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

log_path="/tmp/mbs-release.log"
if ! xcodebuild -workspace ios/App/App.xcworkspace -scheme App -configuration Release -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build | tee "$log_path"; then
  echo "error: xcodebuild Release failed. Showing the first error lines:" >&2
  grep -n "error:" "$log_path" | head -n 120 >&2 || true
  exit 1
fi
grep -n "error:" "$log_path" | head -n 80 || echo "✅ NO RELEASE ERRORS"

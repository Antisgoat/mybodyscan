#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$repo_root"

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "error: xcodebuild not found. Install Xcode and command line tools." >&2
  exit 1
fi

xcodebuild -workspace ios/App/App.xcworkspace -scheme App -configuration Release -destination 'generic/platform=iOS' build | tee /tmp/mbs-release.log
if grep -n "error:" /tmp/mbs-release.log > /tmp/mbs-release-errors.log; then
  echo "First 80 error lines:"
  head -n 80 /tmp/mbs-release-errors.log
  exit 1
fi

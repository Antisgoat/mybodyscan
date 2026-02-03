#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$repo_root"

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "error: xcodebuild not found. Install Xcode and command line tools." >&2
  exit 1
fi

xcodebuild -workspace ios/App/App.xcworkspace -scheme App -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build | tee /tmp/mbs-debug.log
rg -n "error:" /tmp/mbs-debug.log | head -n 80 || echo "✅ NO DEBUG ERRORS"

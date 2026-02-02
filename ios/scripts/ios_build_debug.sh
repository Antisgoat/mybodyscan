#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$repo_root"

xcodebuild -workspace ios/App/App.xcworkspace -scheme App -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 15 Pro' build | tee /tmp/mbs-debug.log
if grep -n "error:" /tmp/mbs-debug.log | head -n 40; then
  exit 1
fi
echo "✅ ios:build:debug PASS"

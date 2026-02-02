#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$repo_root"

xcodebuild -workspace ios/App/App.xcworkspace -scheme App -configuration Release -destination 'generic/platform=iOS' build | tee /tmp/mbs-release.log
if grep -n "error:" /tmp/mbs-release.log | head -n 40; then
  exit 1
fi
echo "✅ ios:build:release PASS"

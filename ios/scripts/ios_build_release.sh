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
if ! xcodebuild -workspace ios/App/App.xcworkspace -scheme App -configuration Release -destination 'generic/platform=iOS' build | tee "$log_path"; then
  echo "error: xcodebuild Release failed. Showing context around the first error:" >&2
  if command -v rg >/dev/null 2>&1; then
    error_line=$(rg -n "error:" "$log_path" | head -n 1 | cut -d: -f1 || true)
  else
    error_line=$(grep -n "error:" "$log_path" | head -n 1 | cut -d: -f1 || true)
  fi
  if [[ -n "$error_line" ]]; then
    start=$((error_line - 60))
    if [[ "$start" -lt 1 ]]; then
      start=1
    fi
    end=$((error_line + 60))
    sed -n "${start},${end}p" "$log_path" >&2
  else
    tail -n 120 "$log_path" >&2
  fi
  exit 1
fi
if command -v rg >/dev/null 2>&1; then
  rg -n "error:" "$log_path" | head -n 80 || echo "✅ NO RELEASE ERRORS"
else
  grep -n "error:" "$log_path" | head -n 80 || echo "✅ NO RELEASE ERRORS"
fi

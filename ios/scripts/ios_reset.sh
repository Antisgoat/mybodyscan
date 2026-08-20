#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$repo_root"

node scripts/ensure-native-firebase-config.mjs

ios_app_dir="$repo_root/ios/App"
if [[ -d "$ios_app_dir/Pods" ]]; then
  rm -rf "$ios_app_dir/Pods"
fi
if [[ -f "$ios_app_dir/Podfile.lock" ]]; then
  rm -f "$ios_app_dir/Podfile.lock"
fi

npm run build:native
npx cap sync ios
if command -v pod >/dev/null 2>&1; then
  (cd ios/App && pod install --repo-update)
else
  echo "warn: CocoaPods not installed; skipping pod install." >&2
fi

pbxproj_path="$repo_root/ios/App/App.xcodeproj/project.pbxproj"

node scripts/assert-no-native-firebase-auth.mjs

absolute_path_pattern='/(Users|Applications|Volumes|private/var|var/folders|tmp|opt/homebrew|usr/local)/'
if grep -nE "$absolute_path_pattern" "$pbxproj_path" >/dev/null; then
  echo "error: Xcode project contains absolute paths. Remove machine-specific paths from project.pbxproj." >&2
  exit 1
fi

public_file_ref_count=$(grep -c "public \\*/ = {isa = PBXFileReference;" "$pbxproj_path" || true)
public_build_file_count=$(grep -c "public in Resources \\*/ = {isa = PBXBuildFile;" "$pbxproj_path" || true)
public_build_phase_count=$(grep -c "public in Resources \\*/," "$pbxproj_path" || true)
if [[ "$public_file_ref_count" -ne 1 || "$public_build_file_count" -ne 1 || "$public_build_phase_count" -ne 1 ]]; then
  echo "error: Xcode project must reference ios/App/App/public exactly once in Copy Bundle Resources." >&2
  exit 1
fi

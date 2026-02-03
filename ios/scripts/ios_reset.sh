#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$repo_root"

npm run build:web
npx cap sync ios
(cd ios/App && pod install --repo-update)

app_delegate_path="$repo_root/ios/App/App/AppDelegate.swift"
pbxproj_path="$repo_root/ios/App/App.xcodeproj/project.pbxproj"

if ! rg -q "import Capacitor" "$app_delegate_path"; then
  echo "error: AppDelegate.swift must import Capacitor only." >&2
  exit 1
fi

if rg -n "FirebaseCore|FirebaseApp|import Firebase|FirebaseOptions|GoogleService-Info\\.plist" \
  "$app_delegate_path" "$pbxproj_path" >/dev/null; then
  echo "error: Native iOS shell contains Firebase references. Remove them before continuing." >&2
  exit 1
fi

open ios/App/App.xcworkspace

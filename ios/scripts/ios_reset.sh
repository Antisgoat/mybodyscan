#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$repo_root"

npm run build:web
npx cap sync ios
if command -v pod >/dev/null 2>&1; then
  (cd ios/App && pod install --repo-update)
else
  echo "warn: CocoaPods not installed; skipping pod install." >&2
fi

app_delegate_path="$repo_root/ios/App/App/AppDelegate.swift"
pbxproj_path="$repo_root/ios/App/App.xcodeproj/project.pbxproj"

expected_app_delegate=$'import UIKit\nimport Capacitor\n\n@UIApplicationMain\nclass AppDelegate: CAPAppDelegate {}'
app_delegate_contents=$(cat "$app_delegate_path")
app_delegate_contents="${app_delegate_contents%$'\n'}"
if [[ "$app_delegate_contents" != "$expected_app_delegate" ]]; then
  echo "error: AppDelegate.swift must be the minimal Capacitor-only implementation." >&2
  exit 1
fi

firebase_name="Firebase"
firebase_core="Core"
firebase_app="App"
google_service_prefix="GoogleService-Info"
google_service_suffix=".plist"
firebase_pattern="Firebase${firebase_core}|Firebase${firebase_app}|import ${firebase_name}|${google_service_prefix}${google_service_suffix}"
if rg -n "$firebase_pattern" "$app_delegate_path" "$pbxproj_path" >/dev/null; then
  echo "error: Native iOS shell contains Firebase references. Remove them before continuing." >&2
  exit 1
fi

if command -v open >/dev/null 2>&1; then
  open ios/App/App.xcworkspace
else
  echo "info: 'open' command not available; skipping workspace launch." >&2
fi

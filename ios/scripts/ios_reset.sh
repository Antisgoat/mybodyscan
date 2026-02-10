#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$repo_root"

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

app_delegate_path="$repo_root/ios/App/App/AppDelegate.swift"
pbxproj_path="$repo_root/ios/App/App.xcodeproj/project.pbxproj"

expected_app_delegate=$'import UIKit\nimport Capacitor\n\n@UIApplicationMain\nclass AppDelegate: UIResponder, UIApplicationDelegate {\n  func application(\n    _ application: UIApplication,\n    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?\n  ) -> Bool {\n    return true\n  }\n\n  func application(\n    _ app: UIApplication,\n    open url: URL,\n    options: [UIApplication.OpenURLOptionsKey: Any] = [:]\n  ) -> Bool {\n    return CAPBridge.handleOpenUrl(url, options)\n  }\n\n  func application(\n    _ application: UIApplication,\n    continue userActivity: NSUserActivity,\n    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void\n  ) -> Bool {\n    return CAPBridge.handleContinueActivity(userActivity, restorationHandler)\n  }\n}'
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
if grep -nE "$firebase_pattern" "$app_delegate_path" "$pbxproj_path" >/dev/null; then
  echo "error: Native iOS shell contains Firebase references. Remove them before continuing." >&2
  exit 1
fi

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

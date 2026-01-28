# App Store Release Checklist (iOS)

Use this checklist before submitting a build to App Store Connect. It focuses on the iOS shell (Capacitor WKWebView) and App Store compliance. Keep it short, practical, and repeatable.

## Toolchain + Upload Requirements

- Build with the current Xcode/iOS SDK required by Apple (see App Store Connect “Upload requirements” guidance).
- Confirm the deployment target still matches the supported minimum (currently iOS 14.0 per `ios/App/Podfile`).

## Privacy Manifest (PrivacyInfo.xcprivacy)

- Verify `ios/App/App/PrivacyInfo.xcprivacy` exists and reflects any required reason API declarations.
- If you add APIs that require reason strings, update the manifest with the approved reasons.

## Release Hygiene

- No debug-only routes or diagnostics in Release builds.
- No WebView inspector toggles or verbose logging in Release.
- No dev-only endpoints or flags in Release builds.

## Info.plist Usage Strings

- Confirm usage descriptions exist for any features used by the web app (e.g., camera, photos, microphone).
- Remove unused usage strings if features are removed.

## Versioning

- Update `MARKETING_VERSION` (user-visible version) and `CURRENT_PROJECT_VERSION` (build number) in Xcode.
- Ensure the version matches the release notes and App Store Connect metadata.

## Native Bundle + Plugins

- Run `npm run build && npx cap sync ios && npm run smoke:native` and confirm all checks pass.
- Ensure no native Firebase pods or plugins are present; Firebase must remain web-only.

## TestFlight Sanity

- Fresh install on a device (no previous data): login, core scans, subscription purchase/restore, and logout.
- Airplane/offline mode: verify the app fails gracefully and recovers when online.
- Confirm the home screen, scan flow, and purchase restore paths work end-to-end.

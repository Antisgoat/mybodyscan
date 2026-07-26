# App Store Release Checklist (iOS)

Use this checklist before submitting a build to App Store Connect. It focuses on the iOS shell (Capacitor WKWebView) and App Store compliance. Keep it short, practical, and repeatable.

## Toolchain + Upload Requirements

- Build with the current Xcode/iOS SDK required by Apple (see App Store Connect “Upload requirements” guidance).
- Confirm the deployment target still matches the supported minimum (currently iOS 14.0 per `ios/App/Podfile`).

## Clean Build Steps (before Release)

- From repo root: `npm run ios:reset` (rebuilds web bundle, syncs Capacitor, installs pods).
- Confirm `ios/App/App/public/index.html` is present and non-placeholder.
- Run `npm run smoke:native` to ensure no native Firebase usage/plugins.

## Archive Steps (Release)

- Open `ios/App/App.xcworkspace` (never `.xcodeproj`).
- Select scheme `App`, configuration Release.
- Product → Archive, then validate and upload to App Store Connect.

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

## Store and Brand Assets

- Store copy source of truth: `docs/STORE_METADATA_EN_US.md`.
- App icon master: `resources/icon.svg` and its 1024 × 1024 opaque PNG export at `resources/icon.png`.
- Light and dark launch-screen masters: `resources/splash.svg` and `resources/splash-dark.svg`.
- Regenerate native assets with `npm run ios:assets && npm run android:assets`, then inspect both light and dark launch screens before committing.
- Web/social share artwork: `public/marketing/mybodyscan-share.png` (1200 × 630).
- Google Play icon and feature graphic: `resources/marketing/google-play-icon-512.png` and `resources/marketing/google-play-feature.png`.
- Recapture current iPhone and iPad store screenshots after material UI changes:
  `node scripts/capture-app-store-screenshots.mjs http://127.0.0.1:4173`.
- A changed iOS app icon does not update the live App Store listing until a new binary containing that icon is uploaded and selected for the version.

## Native Bundle + Plugins

- Run `npm run build && npx cap sync ios && npm run smoke:native` and confirm all checks pass.
- Ensure no native Firebase pods or plugins are present; Firebase must remain web-only.

## TestFlight Sanity

- Fresh install on a device (no previous data): login, core scans, subscription purchase/restore, and logout.
- Airplane/offline mode: verify the app fails gracefully and recovers when online.
- Confirm the home screen, scan flow, and purchase restore paths work end-to-end.

## Common Rejection Pitfalls (avoid)

- Missing or inaccurate `NSCameraUsageDescription` / `NSPhotoLibraryUsageDescription` strings.
- Blank screen on launch (missing `ios/App/App/public` assets or broken Capacitor sync).
- Shipping debug-only routes/tools or dev server configuration in Release builds.

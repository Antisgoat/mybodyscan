# iOS Release Checklist (MyBodyScan)

## 1) Prep the native bundle

```sh
npm run ios:reset
npm run smoke:native
```

## 2) Xcode build & archive

1. Open the workspace: `npm run ios:open`
2. Select the **App** scheme and **Any iOS Device (arm64)**.
3. **Product → Archive**.
4. Verify the archive uses bundled assets (capacitor://localhost) and no dev server URL.

## 3) Manual verification (Release build)

- Launches without the “App failed to start” overlay.
- WebView loads from bundled assets (no live dev server).
- Stripe checkout is hidden in iOS; RevenueCat paywall and IAP flow work.
- Google/third-party sign-in buttons are hidden on iOS unless Apple Sign-In parity is ready.
- Diagnostics screen is gated (Debug only).
- Privacy policy & Terms open in-app (Settings/Support).
- Account deletion flow is accessible from Settings.

## 4) Asset & metadata checks

- AppIcon set is complete; no missing sizes in Xcode.
- Launch screen assets clean (no unassigned Splash children).
- Info.plist permission strings are present and correct.
- Bundle ID, version, and build number match the release plan.

## Root cause and proof

**Why the FirebaseCore build error happened**
- Native Swift files imported FirebaseCore and attempted `FirebaseApp.configure`, but the Firebase pods were not present. This caused “No such module FirebaseCore” and runtime warnings.

**What caused the masked “Script error 0/0”**
- Cross-origin scripts (analytics or remote tags) can emit masked `Script error` events in WKWebView, which previously triggered boot failure overlays without actionable diagnostics.

**What changed**
- Removed native Firebase files and build phases entirely.
- Added a native script guard to block external scripts in iOS builds unless explicitly allowlisted.
- Added debug-only script creation diagnostics and improved boot error capture.

**Proof points**
- Debug logs now show `script_create` entries and `window_error` details with filename/stack when available.
- `npm run smoke:native` fails if `server.url` is present or if any Swift file still imports FirebaseCore.
- iOS Release build boots without the “App failed to start / Script error 0 0 undefined” overlay.

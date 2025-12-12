# Mobile wrap checklist

This repository is ready to be wrapped with Capacitor for a native WebView shell. Follow the steps below when it is time to build the mobile binaries.

## 1. Prerequisites

- Node.js 20
- Capacitor CLI (`npm install -g @capacitor/cli` optional; local `npx` works)
- Apple Developer Program membership with an App ID that has Associated Domains enabled
- Xcode (latest stable) with command-line tools installed
- Android Studio (latest stable) with Android SDK Platform 34+, build tools, and an emulator or device
- Ensure the iOS App ID includes the associated domain `applinks:mybodyscanapp.com`
- Firebase + Stripe project access (existing web configuration is reused)
- Google Sign-In remains redirect-first inside WebViews (no popup dependencies)

## 2. Add Capacitor shell (run on a dev machine)

1. `npm install @capacitor/core @capacitor/cli`
2. `npx cap init MyBodyScan com.adlrlabs.mybodyscan`
3. `npx cap add ios`
4. `npx cap add android`
5. Build the web bundle before syncing: `npm run build`
6. Copy web assets to native projects: `npx cap copy`
7. On subsequent iterations run `npx cap sync` after web or native dependency changes

Platform specific launch/setup guidance lives in:

- [mobile/ios-setup.md](./ios-setup.md)
- [mobile/android-setup.md](./android-setup.md)

## 3. Auth & deep link notes

- WebViews and Capacitor shells now detect constrained environments and force Google sign-in to use `signInWithRedirect`
- `/oauth/return` is available as a stable fallback route; use `https://mybodyscanapp.com/oauth/return` as the redirect URI for Google providers when running inside native shells
- Deep links/universal links can later point to that same route until native handlers are introduced
- No popup flows are required for mobile; if native Google plugins are adopted later, add an exchange endpoint and update the documentation accordingly

## 4. External links & Stripe

- `openExternal()` routes Stripe Checkout/Customer Portal and other outbound links through `window.location.assign`, ensuring WebViews break out to the system browser when possible
- Stripe `success_url`/`cancel_url` already target in-app routes (`/plans`, `/settings`, `/scan/new`)
- Universal links can be layered on later; the current guardrails keep payments intact without additional plugins

## 5. Camera & uploads

- File pickers request `capture="environment"` and accept `image/*` with client-side validation (≤15&nbsp;MB)
- Each required scan angle has its own input so iOS Safari/WebView users can capture sequentially with the system camera

## 6. App Check & API surfaces

- App Check stays enabled for `/api/scan`, `/api/coach`, and `/api/nutrition`
- Stripe/Auth endpoints continue to run without App Check to avoid gating external returns
- For QA builds that cannot satisfy App Check in review, switch to the Debug provider temporarily (document and revert post-review)

## 7. Build & ship reminders

### iOS

1. Open `ios/App/App.xcworkspace` in Xcode after running `npx cap sync`
2. Update bundle version + build number
3. Confirm signing team, capabilities (Associated Domains), and push new universal link entitlements if/when enabled
4. Run on-device for sanity checks, then archive and upload via Xcode Organizer
5. Provide App Store Connect notes referencing redirect-based Google sign-in and external Stripe browser hand-off

### Android

1. Open the project in Android Studio via `android/`
2. Update versionCode/versionName in `android/app/build.gradle`
3. Configure the release keystore + signing config
4. Verify Play integrity requirements and WebView behavior on device/emulator
5. Build a release bundle (`Build > Build Bundle(s)/APK(s) > Build Bundle(s)`) and upload to Play Console

## 8. Assets & theming

- Native splash screens and icons should be placed under `public/` before running `npx cap sync`
- Required assets (provide once available):
  - App icons (foreground/background) at 1024×1024 and platform-specific sizes
  - Splash screens (portrait) at 2732×2732 with safe-area guidance
  - Optional adaptive icon masks (Android)
- Keep assets lightweight in git; store large binaries in design tooling and only export the final rasterized files into `public/`

---

For native-specific provisioning, signing, and platform toggles see the platform appendices linked above. Update this document if new native plugins or flows are introduced.

# Release Checklist (MyBodyScan)

## Pre-flight

- [ ] Run `npm run doctor` to ensure native prerequisites are present.
- [ ] Run `npm ci` in the repo root.
- [ ] Run `npm --prefix functions ci`.
- [ ] Verify `.env.production` is updated (see `.env.example`).
- [ ] Confirm Firebase secrets are configured (see README “Secrets & Deploy”).

## Versioning

- [ ] Update `version` in `package.json` (web).
- [ ] iOS: bump `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` in Xcode (App target).
- [ ] Android: bump `versionName` and `versionCode` in `android/app/build.gradle`.

## Web + Native assets

- [ ] `npm run build:web`
- [ ] `npm run sync:ios`
- [ ] `npm run sync:android`

## iOS release

- [ ] `npm run build:ios`
- [ ] Xcode → Archive → Distribute App.
- [ ] Confirm App Store Connect upload success and processing.

## Android release

- [ ] `npm run build:android`
- [ ] Generate bundle: `./gradlew bundleRelease` (from `android/`).
- [ ] Upload `app-release.aab` to Play Console.

## Firebase Functions

- [ ] `npm --prefix functions run build`
- [ ] `firebase deploy --only functions --project <projectId>`

## Post-deploy sanity

- [ ] Hosting smoke: visit `/systemHealth` and `/__diag`.
- [ ] Payments: run `npm run smoke` (requires `VITE_FIREBASE_API_KEY` + price IDs).
- [ ] Auth: verify Google + Apple sign-in flows on web and iOS.

# MyBodyScan iOS release runbook

This is the platform-specific build appendix. The authoritative release gates,
deployment order, external-state checklist, smoke tests, and rollback procedure
are in `docs/PRODUCTION_RELEASE.md`; if the files differ, follow that runbook.

## Fixed identifiers

- App name: `MyBodyScan`
- Bundle ID: `com.mybodyscan.app`
- Apple team: ADLR LABS LLC (`LSSBW4456K`)
- Firebase project: `mybodyscan-f3daf`
- RevenueCat entitlement identifier: `pro`
- Monthly product: `com.mybodyscan.pro.monthly` (3 credits per renewal)
- Yearly product: `com.mybodyscan.pro.yearly` (36 credits per annual renewal)
- Consumable product: `com.mybodyscan.scan.single` (1 credit, no Pro access)

The approved US launch prices are $9.99/month, $79.99/year with 36 credits
granted per annual renewal, and $4.99 for the consumable. There is no
introductory offer. Store localization must match the plan UI and disclose that
scan estimates are wellness information.

Do not substitute the Firebase project, Apple team, bundle ID, or RevenueCat
entitlement. The Xcode project uses automatic signing for the ADLR Labs team.

## Required local files and public build values

Never commit private keys, API secrets, passwords, or provisioning exports.

1. Put the Firebase iOS configuration at
   `ios/App/App/GoogleService-Info.plist`. It must be the Firebase iOS app for
   `com.mybodyscan.app` in `mybodyscan-f3daf`.
2. Put the RevenueCat **public iOS SDK key** in the ignored
   `.env.production.local` file as `VITE_RC_API_KEY_IOS=...`.
3. Set `VITE_RC_ENTITLEMENT_ID=pro` (or omit it; `pro` is the default).

The archive command rejects a missing RevenueCat key, a `test_` Test Store
key, any key without RevenueCat's `appl_` Apple public-key prefix, any
`sk_`/`atk_` private credential, and any entitlement other than `pro`.
RevenueCat public SDK keys are intended to be embedded in the app; RevenueCat
secret API keys are not.

For a no-charge development purchase test, temporarily put the Test Store
public key in `.env.production.local`, run `npm run ios:sync`, and install a
Debug build. Replace it with the real `appl_` key before archiving. The
release command fails closed if a Test Store key remains. The pinned
Capacitor 7 / RevenueCat Capacitor 11.2.6 stack is the minimum version used by
this project for RevenueCat Test Store support.

## Apple and RevenueCat console setup

Before archiving:

1. The App Store Connect account holder accepts all pending Apple agreements.
2. App Store Connect contains an app record for `com.mybodyscan.app`.
3. Users and Access → Integrations → In-App Purchase contains an active key.
   Save the one-time-download `.p8`, Key ID, and Issuer ID securely.
4. RevenueCat Apps contains a real Apple App Store configuration for
   `com.mybodyscan.app` with that in-app-purchase key and valid credentials.
5. App Store Connect contains the three exact products above. Import them into
   RevenueCat, attach only monthly/yearly to `pro`, and attach all three to the
   default offering. Unknown product IDs are intentionally rejected by the app
   and webhook.
6. The app uses the real RevenueCat iOS public key, never the Test Store key.
7. RevenueCat's `MyBodyScanApp` webhook points to
   `https://mybodyscanapp.com/api/revenuecat/webhook`, includes the matching
   authorization value, sends production and sandbox events, and returns 200
   for a test event.
8. Upload the APNs authentication key in Firebase Console → Project settings →
   Cloud Messaging for the MyBodyScan iOS app. The app keeps FCM auto-init off,
   asks permission only after the user enables plateau alerts, and registers
   the resulting iOS FCM token with the authenticated backend.

## Build, install, and archive

From the repository root:

```sh
npm ci --no-audit --no-fund
npm run ios:doctor
npm run typecheck
npm test
npm --prefix functions test
npm run build:prod
npm run smoke:native:ios
npm run ios:archive
```

`npm run ios:archive` builds a fresh native release bundle, synchronizes
Capacitor and CocoaPods, runs native bundle guards, and creates:

```text
ios/build/MyBodyScan.xcarchive
```

For a development build on the connected iPhone, select the `App` scheme,
the physical iPhone, and press Run in Xcode. Developer Mode and trust must be
enabled on the device.

## Validation and upload

1. Open `ios/build/MyBodyScan.xcarchive` in Xcode Organizer.
2. Run **Validate App** and resolve every error.
3. Generate the privacy report and compare it with the App Store Connect
   privacy answers and `src/content/legal/privacy.md`.
4. Choose **Distribute App → App Store Connect → Upload**.
5. Distribute first through internal TestFlight. Do not submit for review
   until the device and purchase checklist below passes.

Current release snapshot (2026-07-23):

- Build 6 (`1.0.0`) is the final replacement candidate containing the
  corrected RevenueCat paywall routing, idempotent SDK initialization, and
  hardened same-origin auth/paywall redirects. It passed the release archive
  and App Store validation/export gates and was accepted by Apple's upload
  service for TestFlight processing.
- The paired iPhone was unavailable after upload, so build 6 has not yet been
  installed or launched on the physical device.
- Build 5 passed the release archive and App Store validation/export gates and
  was accepted by Apple's upload service, but it was superseded before device
  testing by the redirect-hardening fix and must not be submitted.
- Build 4 was accepted by Apple's upload service and installed on the paired
  iPhone, but it must not be submitted because its native plan route bypassed
  the purchase paywall.
- The monthly, yearly, and single-scan App Store products exist at the approved
  prices. RevenueCat's `pro` entitlement and current/default offering are
  wired to the exact products described above.
- RevenueCat production and sandbox App Store server-notification URLs are set.
- APNs key `9R5X23CQQ9` is uploaded to the MyBodyScan Firebase iOS app for both
  development and production.
- Store metadata, age rating, categories, and App Privacy answers are
  configured. Publishing the privacy declaration and the remaining Content
  Rights, API-access, and DSA/trader attestations require the Account Holder.
- Four exact 1242 × 2688 screenshot candidates are generated in
  `release-artifacts/app-store-screenshots/` and still require manual upload.
- Build selection, review contact/demo credentials, the checklist below, and
  final submission remain incomplete.

## Required TestFlight/device smoke test

- Fresh install launches without a blank screen or debug tools.
- Email sign-up, email sign-in, password reset, sign-out, and account deletion
  work.
- Google and Apple sign-in work if shown in the iOS UI.
- A real four-photo scan uploads and completes.
- Exactly one credit is consumed and a matching ledger entry exists.
- A failed/retried scan does not consume or double-consume a credit.
- Scan results distinguish user input, photo estimates, visual observations,
  and calculated values and make no diagnostic/medical claims.
- With Monthly and Yearly active, workout tracking, meal planning/logging,
  barcode fallback, food scoring/alternatives, Momentum, plateau coaching,
  and Transformation Preview work.
- HealthKit and Health Connect imports remain explicitly **coming soon** in
  version 1.0; the app must not request health-data permissions.
- With only One Scan active, the complete purchased scan report and generated
  plan remain available while every recurring subscriber feature above stays
  locked in both the UI and backend.
- The RevenueCat sandbox monthly, annual, and one-scan purchase, cancellation
  state, restore, reinstall/restore, webhook-to-`pro`, and idempotent credit
  ledger flows work. The one-scan consumable never grants Pro.
- Optional push permission is requested only after the user opts in, and a
  plateau test notification reaches the device when native push is enabled.
- Privacy Policy, Terms, Refund Policy, Support, and account-deletion routes
  open from the app.
- Firebase Functions logs contain no unexpected errors.

## Release and rollback

Use manual App Store release for the first version. Apple controls the binary
rollback path: pause a phased/manual release or remove the affected version
from sale in App Store Connect, correct the issue, increment
`CURRENT_PROJECT_VERSION`, archive, validate, and upload a replacement build.
An uploaded App Store binary cannot be overwritten with the same build number.

For a Firebase/web rollback, use the exact Hosting and Functions procedures in
`docs/PRODUCTION_RELEASE.md`; an iOS rollback does not roll back the backend.

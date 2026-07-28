# App Store release checklist (iOS)

`docs/PRODUCTION_RELEASE.md` is the authoritative release runbook. This page is
the short iOS operator checklist; if the two disagree, stop and update the
runbook before shipping.

## Build and archive

- Use Node.js 20 or 22 for the web workspace, Node.js 22 for Functions, the
  current Xcode/iOS SDK accepted by App Store Connect, and the `App` workspace
  scheme.
- Confirm `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` are the intended
  App Store version and a new build number.
- Run the repository gates from the production runbook, including
  `check:ios-release-config`, `check:ios-release-guard`, `build:native:release`,
  `verify:native`, `smoke:native:ios`, and `smoke:ios`.
- Archive only with `npm run ios:archive`. It rebuilds the release web bundle,
  synchronizes Capacitor/CocoaPods, and archives
  `ios/App/App.xcworkspace`; never archive the `.xcodeproj`.
- Inspect the archive before upload: bundle ID `com.mybodyscan.app`, expected
  version/build, App Store signing, app icon, privacy manifest, and non-empty
  web bundle.

## Native security and permissions

- The release must include the intentional native Firebase Authentication,
  App Check, and Messaging bridges plus RevenueCat. It must not contain
  Capacitor plugin web fallbacks, browser OAuth, reCAPTCHA App Check, Firebase
  Auth compat, or development endpoints.
- Confirm camera and photo-library usage descriptions match the scan flow.
  Microphone access is optional and should be requested only when the user
  chooses speech input.
- Keep HealthKit disabled and described as **coming soon** for version 1.0.
  Do not add Health permissions or advertise Apple Watch sync in this release.

## Store record

- Store copy source: `docs/STORE_METADATA_EN_US.md`.
- App icon master: `resources/icon.svg`; opaque 1024 × 1024 export:
  `resources/icon.png`.
- Store screenshots must be generated from the final production build with
  `scripts/capture-app-store-screenshots.mjs`, visually reviewed, and uploaded
  at the exact iPhone and iPad dimensions described in the runbook.
- Select only the freshly uploaded candidate build. Superseded TestFlight
  builds are not release evidence.
- Complete truthful App Review contact details and a dedicated reviewer
  account. An Account Holder/Admin must publish App Privacy, declare Content
  Rights, and complete Digital Services Act/trader status; do not guess those
  answers.

## Physical-device acceptance

Install the candidate from TestFlight on a clean physical iPhone and verify:

- email, Google, and Apple sign-in; sign-out; account switching; token refresh;
  cold launch;
- one real four-photo scan; one credit debit and matching ledger entry;
  duplicate submission safety; failed-scan refund;
- nutrition text search, barcode camera/manual entry, serving-unit conversion,
  meal logging/edit/removal, meal plans, and product insight;
- Coach response and an accepted date-scoped workout adjustment;
- monthly, yearly, and one-scan sandbox purchases, restore, RevenueCat webhook,
  and correct Pro/credit boundaries;
- opt-in push delivery and deep link;
- offline failure/recovery, legal/support routes, data export, and account
  deletion.

Do not add the app version for review until every physical-device gate passes
and the owner-only App Store declarations are complete.

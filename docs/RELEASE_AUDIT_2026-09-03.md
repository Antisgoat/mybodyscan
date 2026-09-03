# Release audit — September 3, 2026

## Decision

Prepare an internal-test candidate, not a public production-store release.
Passing automated checks is not a substitute for actual device, provider,
purchase/restore, and store-review acceptance. No paid live transaction is
authorized by this audit. No customer data migration is required.

## Scoped changes

- Kitchen photos and manual ingredients lead to personalized meal ideas after
  explicit processing consent and ingredient confirmation. Camera and photo
  library are separate actions. Missing/unreadable allergy preferences block
  generation; changing preferences invalidates stale suggestions.
- Kitchen ingredients are preserved on failure, inputs are locked during
  processing, and unconfirmed inventory names are rejected server-side.
- Barcode search uses the newly detected code rather than stale search text.
- Embedded food search logs to the selected diary day; standalone logging uses
  the member's local date, not UTC. Retry identity is preserved.
- Existing eight-result progressive food search and original MyBodyScan visual
  identity remain intact. No competitor code, artwork, or screen layout was copied.
- The production `qs` dependency is updated to 6.16.0 in both workspaces.
- Local verification no longer overwrites/deletes an operator-owned environment
  file or retrieves live secrets for its mock scan/deletion flow.
- Production smoke checks no longer count Coach 501/502 or missing-provider
  configuration as successful service responses.
- Desktop, Android-sized Chromium, and iPhone WebKit checks are added to CI.

## Verified external state

- GitHub main was `293454d`; its verify/deploy workflows succeeded. The new
  kitchen feature and this audit's fixes were not part of that release.
- Google Play: **MyBodyScan: Body Progress**, `com.mybodyscan.app`, build 4
  available to internal testers, full rollout. Production is inactive/draft.
- Google Play setup is **4 of 11 complete**. Remaining: Sign in details,
  Content rating, Target audience, Data safety, Health, App category/contact,
  and Store listing.
- Apple: **MyBodyScan: Body Progress**, App Store ID `6793707279`, latest
  uploaded version 1.0.0 build 20, upload complete. The builds overview shows
  no assigned group or installs for build 20. This does not establish that the
  owner's phone is on that build.
- Apple's version-1.0 submission draft still selects **build 16**. Review login,
  review contact details, and review notes are blank. Replace the selected build
  only after the new candidate passes acceptance; do not submit this stale draft.
  Release is correctly set to manual.
- Live Firebase `/health` succeeds. An unauthenticated nutrition request is
  correctly rejected. This verifies health/access control, not provider results
  or authenticated scan completion.

## Automated verification

- TypeScript checks: passed for web and Functions.
- Web/component/regression suite: 382 tests passed across 126 files.
- ESLint: zero errors; existing repository warnings remain (not a warning-free
  codebase and not grounds for a broad rewrite in this candidate).
- Functions: 115 tests passed, including kitchen consent and inventory validation.
- Firestore rules: 11 local-emulator tests passed.
- Scan integration: local upload, successful result, duplicate-submit identity,
  failure refund, final credit balance, and account deletion all passed using a
  local model stub. This is deliberately not a real-image accuracy test.
- Browser checks: 15 passed across desktop Chromium, Pixel-sized Chromium, and
  iPhone WebKit. Checks cover boot, App Check initialization (not token validity),
  read-only demo, Storage URL guard, and no horizontal overflow on diary/search/
  kitchen pages. Only Google's optional reCAPTCHA telemetry CORS error is excluded
  from the layout test's page-error assertion; application errors remain failures.
- Production npm audits: zero known vulnerabilities in web and Functions
  production dependencies after the scoped `qs` update.
- Web production build and asset/size/Storage guards passed.
- Android signed release bundle, Android lint, and native unit-test build passed.
- iOS release archive passed with existing team signing.
- Public web, iOS and Android release-configuration guards passed.

These checks do not certify provider nutrition accuracy, visual transformation
quality, live payment settlement, or physical-device permissions and behavior.

## Remaining acceptance gates

1. Merge only after CI passes and verify the corresponding Firebase deployment.
   Distribute the matching build 21 / Android version-code-5 internal candidates.
2. Install the new builds and test cold launch, Apple/Google login, camera
   permission denial/recovery, library selection, and network loss/recovery.
3. Complete one four-photo scan through report, workout and nutrition plans;
   verify one credit consumed, no duplicate debit, and goal preview behavior.
4. Test food search, known barcode, supported unit conversions, past-date logging,
   Coach adjustment, gym capture, and kitchen capture with actual provider output.
   Kitchen meals must respect the confirmed inventory and show saved restrictions;
   labels/freshness/cross-contact still require the member's review.
5. Verify monthly/yearly/one-scan sandbox purchases and restore on iOS. Verify
   Google Play license-tester purchases/restore and RevenueCat entitlement sync
   after the Play merchant/catalog/service-account/RTDN setup is confirmed.
6. Complete push opt-in and delivery and account deletion on dedicated test users.
7. Finish store declarations and provide a dedicated review account with access
   to paid features, without reviewer purchases or personal third-party login.
8. Review current screenshots, support/privacy/deletion links and actual feature
   claims. Obtain qualified legal/privacy review; product disclaimers cannot
   guarantee immunity from claims or substitute for accurate behavior.

WHOOP remains out of launch scope. Apple Health/Health Connect are not to be
advertised as verified launch integrations.

## Design and provider references

The inspiration is fast, understandable logging and editable results, not a
reproduction of a competitor: [MacroFactor food logger](https://macrofactor.com/new-food-logger/).
Photo understanding has known accuracy and small-text limitations; ingredient
confirmation is required: [OpenAI vision limitations](https://developers.openai.com/api/docs/guides/images-vision#limitations).
Provider retention is distinct from MyBodyScan account storage:
[OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data).
Store declarations must match the final build:
[Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/),
[Google health declaration](https://support.google.com/googleplay/android-developer/answer/13996367?hl=en).

# MyBodyScan production release runbook

This is the single authoritative production runbook for the web app, Firebase
backend, and Capacitor iOS app. `docs/GO-LIVE.md`, `docs/DEPLOY.md`,
`ios/RELEASE_IOS.md`, and README deployment notes defer to this file; older
audit reports are historical and must not be used as deployment instructions.

## Scope and release policy

- Firebase project: `mybodyscan-f3daf`
- Primary site: `https://mybodyscanapp.com`
- Canonical alias: Firebase Hosting permanently redirects
  `https://www.mybodyscanapp.com` to the apex domain after its managed
  certificate becomes active.
- Secondary domain: `https://mybodyscan.app` is currently hosted outside
  Firebase (Cloudflare/Hercules) and is not a Firebase Hosting release target.
  Treat it as an allowed origin only until the product owner deliberately moves
  it to Firebase.
- Firebase Hosting sites: `mybodyscan-f3daf.web.app` and
  `mybodyscan-f3daf.firebaseapp.com`
- Functions region/runtime: `us-central1`, Node.js 22
- iOS app: `MyBodyScan: Body Progress`, App Store ID `6793707279`, bundle ID
  `com.mybodyscan.app`, Apple team `LSSBW4456K`
- RevenueCat project/app: `ADLR LABS` / `MyBodyScan`; entitlement `pro`
- Production deploys come from reviewed `main`. Never deploy a dirty tree.
- The `main` workflow verifies and deploys indexes, Functions, rules, Storage,
  and Hosting through keyless Google Workload Identity Federation.

## Required configuration

### Public web build values

Provide these through `.env.production.local` for an operator build and through
the GitHub `production` environment for CI. They are public configuration, but
values still must not be pasted into tickets or logs.

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_VAPID_KEY` (public Web Push certificate key from this Firebase
  project's Cloud Messaging settings)
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID` (optional; required only for Analytics)
- `VITE_STRIPE_PUBLISHABLE_KEY` (must be a live-mode `pk_live_…` key)
- `VITE_APPCHECK_SITE_KEY` (reCAPTCHA Enterprise site key created in Google
  Cloud project `mybodyscan-f3daf`)
- the `VITE_PRICE_*` IDs represented in `.env.production.example`
- for an iOS release, `VITE_RC_API_KEY_IOS` must be RevenueCat's public Apple
  SDK key (`appl_…`) and `VITE_RC_ENTITLEMENT_ID` must be `pro`

The generated production bundle fails if any required Firebase Web field is
empty. Run this status-only check; it never prints values:

```bash
npm run check:production-config
```

### Functions secrets

The following Secret Manager entries are bound by Functions code or
`firebase.json`. Use
`functions:secrets:get`, which returns metadata, to confirm that each has an
enabled version. Do not use `functions:secrets:access` during an audit because
that prints the secret value.

```bash
npx firebase-tools functions:secrets:get ADMIN_EMAIL_ALLOWLIST --project mybodyscan-f3daf
npx firebase-tools functions:secrets:get OPENAI_API_KEY --project mybodyscan-f3daf
npx firebase-tools functions:secrets:get REVENUECAT_WEBHOOK_SIGNING_SECRET --project mybodyscan-f3daf
npx firebase-tools functions:secrets:get STRIPE_SECRET --project mybodyscan-f3daf
npx firebase-tools functions:secrets:get STRIPE_SECRET_KEY --project mybodyscan-f3daf
npx firebase-tools functions:secrets:get STRIPE_WEBHOOK_SECRET --project mybodyscan-f3daf
npx firebase-tools functions:secrets:get USDA_FDC_API_KEY --project mybodyscan-f3daf
```

Set or rotate a missing value interactively, one at a time:

```bash
npx firebase-tools functions:secrets:set SECRET_NAME --project mybodyscan-f3daf
```

`OPENAI_API_KEY`, one live Stripe API-key alias, `STRIPE_WEBHOOK_SECRET`, and
`USDA_FDC_API_KEY` are required for the complete web feature set. Both Stripe
API-key aliases are currently bound for compatibility and therefore both must
exist before Functions deployment. RevenueCat is required when mobile purchase
events are enabled. `ADMIN_EMAIL_ALLOWLIST` is a fail-closed binding for the
admin credit-grant function and must exist before Functions deployment.

Non-secret runtime configuration is committed in
`functions/.env.mybodyscan-f3daf`, the Firebase-supported project-specific
Functions env file. It includes `APP_CHECK_MODE=soft`, the canonical host, auth
feature flags, and the effective Coach and nutrition rate limits.
New scan credits expire after 12 months by default, matching the purchase and
legal pages. `CREDIT_EXP_MONTHS` may override that period only after the same
change is approved and published in every customer-facing purchase and policy
surface.
The fail-closed iOS product IDs are committed in both client and Functions
configuration: `com.mybodyscan.pro.monthly` (3 credits per renewal),
`com.mybodyscan.pro.yearly` (36 credits per annual renewal), and
`com.mybodyscan.scan.single` (one consumable credit). RevenueCat events for any
other product are recorded as ignored and cannot grant Pro or credits.

### Product access boundary

The canonical entitlement is the server-authored
`users/{uid}/entitlements/current` document. A credit balance is never a
subscription signal, and native builds do not bypass this check.

- One Scan (`$4.99`) grants one consumable scan credit. The purchaser keeps the
  complete source-labeled report, generated workout plan, nutrition targets,
  adjustment guidance, and sample-day meal outline for that scan.
- Monthly (`$9.99`) and Yearly (`$79.99`) are the only customer purchases that
  grant `pro`. They unlock Coach, recurring workout programs and tracking,
  interactive seven-day meal planning, nutrition logging/search/barcodes and
  MBS Product Insight, Momentum, plateau coaching and opt-in alerts, and adult
  Transformation Preview.
- Client route guards, callable/HTTP Functions, scheduled plateau delivery, and
  Firestore rules all enforce the same boundary. A one-time scan credit must
  never unlock a subscriber endpoint.

### Adaptive coaching and nutrition behavior

- A Pro user’s soreness, fatigue, or extra-activity message can create a
  date-scoped workout adjustment. The base program remains intact; the affected
  day is overlaid with conservative set and intensity/RPE guidance and is
  returned by the normal workout APIs. If today is a rest day, the adjustment
  is scheduled for the next programmed day.
- Serious symptom language (for example chest pain, sharp pain, numbness,
  dizziness, or shortness of breath) never mutates a plan. The Coach tells the
  user to stop the affected exercise and seek appropriate medical guidance.
- Extra activities entered in Coach are recorded as activity events. The app
  does not automatically add or subtract calories without duration, intensity,
  or trusted device data; the Coach may provide clearly labeled estimates.
- Food search combines USDA FoodData Central and Open Food Facts. The client
  retains branded serving data and only offers grams, ounces, milliliters,
  cups, slices, or pieces when the upstream record supports that conversion.
  Volume is never converted to mass without product-specific density data.

Apple HealthKit and Android Health Connect imports are not part of version 1.0.
The existing Health screens must remain labeled **coming soon** and must not
request health-data permissions. Do not advertise health sync until native
connectors, privacy disclosures, least-privilege permissions, and physical
device tests have passed a separate release review.

The OpenAI scan pipeline defaults to `gpt-4o-mini`; do not
override `OPENAI_MODEL`, `OPENAI_PROVIDER`, or `OPENAI_BASE_URL` unless the
replacement has passed the scan reliability suite.

The optional adult-only Transformation Preview uses the same
`OPENAI_API_KEY` with the fixed `gpt-image-2` image-edit model. The OpenAI
organization must be verified for GPT Image access and have appropriate spend
limits. The feature sends only the user's front scan photo after explicit,
versioned consent, stores the result privately under
`transformation-previews/{uid}/{scanId}/`, and never exposes a public image
URL. It is a motivational illustration, not a forecast or guarantee.

The production Storage bucket CORS allowlist is canonical in
`scripts/cors.json` and mirrored in `infra/storage-cors.json`. The deployment
workflow applies it through Application Default Credentials and verifies the
result without reading Storage objects. Operators can use the same path:

```bash
npm run storage:cors:check
npm run storage:cors:apply
```

### Console and vendor settings

These are external to the repository. Verify each item before release even when
the current-state notes below say it was configured:

1. Firebase Console → Authentication → Sign-in method:
   - Email/password enabled.
   - Google enabled with a support email.
   - Apple enabled with the active Apple Team ID, Key ID, Services ID, and key.
     As of 2026-07-22 Firebase has replacement key `Z83358MB2U`, the Apple Team
     ID, and Services ID `com.mybodyscan.web` configured. The Services ID is
     associated with the MyBodyScan App ID and its registered production
     domains/return URLs. Keep prior key `JL88547YFM` active until a real Apple
     web sign-in succeeds in a normal browser on the apex domain. Revoke the old
     key only after that test; the in-app automation browser cannot establish a
     reliable Apple popup session and is not an acceptable sign-in gate.
2. Firebase Console → Authentication → Settings → Authorized domains:
   `mybodyscanapp.com`, `www.mybodyscanapp.com`, `mybodyscan.app`,
   `www.mybodyscan.app`,
   `mybodyscan-f3daf.web.app`, and `mybodyscan-f3daf.firebaseapp.com`.
   As of 2026-07-21 all six are present. Google Auth Platform branding is
   `MyBodyScan`, is published for an external audience, and has the production
   home/privacy/terms URLs plus both custom parent domains.
3. Apple Developer → Services ID: Firebase's `__/auth/handler` URL is an allowed
   return URL and the custom web domains are associated.
4. Google Cloud Console → reCAPTCHA Enterprise: the production web key belongs
   to project `mybodyscan-f3daf` and allows all four custom hostnames and both
   Firebase Hosting domains. Firebase Console → App Check → Web app must show
   reCAPTCHA Enterprise as registered. A legacy provider may remain registered
   during migration, but the deployed client must use Enterprise.
5. Stripe Dashboard in live mode:
   - all committed production price IDs exist and are active;
   - Customer Portal is configured;
   - the active webhook destination targets the deployed `stripeWebhook`
     Function (the direct Cloud Run URL or
     `https://mybodyscanapp.com/stripeWebhook` are both valid);
   - subscribed events include `checkout.session.completed`,
     `invoice.payment_succeeded`, `customer.subscription.updated`, and
     `customer.subscription.deleted`.
     As of 2026-07-22 the current destination is active and listens to all four
     required events; its Function has a webhook secret bound and rejects an
     intentionally invalid signature with HTTP 400. On 2026-07-23 the product
     owner approved the launch catalog: $4.99 for one scan, $9.99/month, and
     $79.99/year. New immutable live prices were created on the existing
     MyBodyScan products, made the product defaults, and installed in the web
     and Functions allowlists. Verify all three live Checkouts before archiving
     superseded prices. Old price IDs remain recognized temporarily for delayed
     pre-cutover webhook events. A stale zero-activity
     `stripeWebhook2` destination also remains; disable it
     only after a successful signed delivery to the current destination.
     Customer Portal subscription cancellation, payment-method updates, and
     invoice history are enabled. Its account-wide legal links are blank;
     because this Stripe account is branded ADLR LABS, do not replace those
     links with MyBodyScan URLs without an account-owner/legal decision.
6. Firebase Hosting → Custom domains: `mybodyscanapp.com` is the canonical
   Firebase custom domain. On 2026-07-22, the `www` custom domain was explicitly
   configured in Firebase as a redirect to `mybodyscanapp.com`, and Firebase
   accepted the existing Namecheap CNAME `www` →
   `mybodyscan-f3daf.web.app`. Firebase minted the replacement managed TLS
   certificate the same day. A normal TLS request to
   `/legal/privacy?source=smoke` returned a permanent redirect to the same
   path/query on the apex and completed successfully. Recheck this behavior
   after every Hosting or DNS change.
   `mybodyscan.app` is not currently attached to Firebase Hosting. To attach it,
   first make an explicit product/domain migration decision and then replace its
   current external DNS/hosting configuration.
7. GitHub → Settings → Environments → `production`: enabled versions of
   `VITE_APPCHECK_SITE_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`, and the public
   `VITE_FIREBASE_VAPID_KEY` exist. The manual
   production probe reads the committed public Firebase Web API key and does not
   require a duplicate GitHub secret. The production deploy does not use a JSON key: workflow
   `id-token: write` authenticates through
   `projects/157018993008/locations/global/workloadIdentityPools/github-actions/providers/mybodyscan`
   as `github-mybodyscan-deploy@mybodyscan-f3daf.iam.gserviceaccount.com`.
   The provider condition must remain restricted to repository
   `Antisgoat/mybodyscan` and `refs/heads/main`, and the service account must have
   zero user-managed keys. Its project roles are Firebase Admin, Cloud Functions
   Admin, Cloud Scheduler Admin (required to create and update Firebase scheduled
   Function jobs), Cloud Build Editor, Service Account User, and Secret Manager
   Viewer.
   Secret Manager Viewer exposes metadata, not secret payloads. Every declared
   Function secret must separately grant `roles/secretmanager.secretAccessor`
   to the Function runtime account
   `157018993008-compute@developer.gserviceaccount.com`.
   Set **Deployment branches and tags** to **Selected branches and tags** with
   only `main`. The Google workload-identity provider already rejects every
   other repository/ref, but the matching GitHub environment restriction is a
   second independent guard.
8. The product owner approved the customer-facing brand `MyBodyScan`, operator
   name `ADLR Labs`, a July 22, 2026 effective date, and a no-refund policy
   subject to mandatory consumer law. Static and in-app Privacy, Terms, Refund,
   and Health Disclaimer copy use those decisions, explain AI/media processing,
   opt-in notifications, deletion, wellness estimates, and transformation
   previews, and align new-credit expiry at 12 months. Before broad commercial
   launch, qualified counsel should still confirm the operator's registered
   legal identity and notice address, Florida governing-law language, age and
   parental-consent approach, international privacy disclosures, and mobile
   app-store purchase terms. Do not invent an LLC/Inc. suffix in the meantime.
9. Firebase Console → Project settings → Cloud Messaging:
   - Web Push certificates contains an active key pair for project
     `mybodyscan-f3daf`; copy only its public key to
     `VITE_FIREBASE_VAPID_KEY`.
   - The scheduled `sendPlateauNotifications` Function exists after deployment.
   - For native iPhone push, upload an active APNs authentication key associated
     with the correct Apple Team and bundle ID. Web push does not substitute for
     APNs.
     As of 2026-07-23, APNs key `9R5X23CQQ9` is uploaded for both development
     and production on the Firebase iOS app. An older unusable key can remain
     during validation; revoke it only after a real TestFlight push succeeds.
     Verify with an opted-in non-admin browser: permission is requested only after
     the user enables the setting, a token document is created under that user,
     and a targeted test notification opens `/history`. Never log a registration
     token.
10. Apple, App Store Connect, and RevenueCat:
    - App Store Connect must contain `MyBodyScan: Body Progress` for bundle
      `com.mybodyscan.app`.
    - Create the three exact product IDs listed above. Put monthly and yearly in
      one auto-renewable subscription group; the single-scan item is a
      consumable and must never be attached to `pro`. Use $9.99/month,
      $79.99/year with 36 credits granted per annual renewal, and $4.99 for the
      single-scan consumable. Do not configure an introductory offer. App Store
      copy must match the committed plan UI.
    - Import the products into RevenueCat. Attach only monthly and yearly to
      entitlement `pro`; place all three in the current/default offering using
      monthly, annual, and custom/single-scan packages.
    - RevenueCat App Store credentials must remain valid. As of 2026-07-23 the
      replacement in-app-purchase key `9Z23GBB5M7` is accepted by RevenueCat.
      Keep the downloaded `.p8` outside Git and never paste it into logs or
      tickets.
    - Configure App Store server notifications using RevenueCat's production
      and sandbox URLs, then send a dashboard test event and confirm HTTP 200.
    - Upload an APNs authentication key to Firebase Cloud Messaging for the
      MyBodyScan iOS app. Do not guess between downloaded Apple keys; confirm
      the key has APNs service enabled and belongs to team `LSSBW4456K` first.
    - Complete App Privacy, age rating, review contact, support/privacy URLs,
      pricing/localization, and required iPhone and iPad screenshots before
      submission. The Account Holder or an Admin must publish the App Privacy
      answers and make the Content Rights declaration; an operator must also
      provide truthful App Review contact details and working reviewer
      credentials. Do not invent any of those values.
    - Native builds currently expose email/password authentication only;
      Google and Apple buttons are deliberately hidden because the retired
      native Firebase Auth integration caused startup failures. Web Google and
      Apple sign-in remain enabled. Do not advertise native social sign-in or
      add its buttons until a replacement native flow passes device tests.

Current iOS external state on 2026-07-23: the App Store app record exists;
Xcode is signed into the ADLR Labs team; the physical iPhone is paired with
Developer Mode. Build 6 is the final replacement candidate with the RevenueCat
paywall and redirect-hardening fixes. It was archived, validated,
distribution-signed, accepted by Apple's upload service for TestFlight
processing, installed on the paired iPhone 14 Pro Max, and launched
successfully. Fresh iPhone and iPad simulator builds also install, launch, and
render the reviewed responsive layouts. Build 5 was accepted by Apple's upload
service but was superseded before device testing by the redirect-hardening fix.
Build 4 must not be submitted because its native plan route bypassed the
RevenueCat paywall. The real photo, purchase, restore, notification, and
offline device checklist remains mandatory.

Build 6 is selected for App Store version 1.0. Six ordered 1242 × 2688 iPhone
screenshots and six ordered 2064 × 2752 iPad screenshots are uploaded: body
results, training, nutrition progress, meal planning, four-photo scanning, and
AI coaching. The app download price is $0.00 and the app is scheduled to be
available in all 175 countries or regions on release. The three exact purchase
products have their required review screenshot and are in one App Review draft
with status **Ready for Review**:

- `com.mybodyscan.scan.single`: consumable, $4.99, available in all 175
  countries or regions;
- `com.mybodyscan.pro.monthly`: $9.99/month, available in all countries or
  regions, with no introductory offer;
- `com.mybodyscan.pro.yearly`: $79.99/year, available in all countries or
  regions.

RevenueCat accepts in-app-purchase key `9Z23GBB5M7`; monthly and yearly are
attached to `pro`; all three products are in the current/default offering.
The RevenueCat webhook Authorization header is synchronized with the deployed
Firebase secret. A dashboard test on 2026-07-23 returned HTTP 200 with `[ok]`,
and the corresponding Function invocation completed without an unexpected
error. This verifies provider-to-Function connectivity but does not replace a
real App Store sandbox purchase and renewal event. Native plan links open the
RevenueCat purchase/restore paywall, while Settings opens Apple's
subscription-management screen; native builds never open Stripe checkout.
APNs key `9R5X23CQQ9` is uploaded to Firebase for development and production.

App Store metadata, age rating, categories, and the App Privacy answers are
configured. App Store Connect will not add version 1.0 to the review draft
until all of the following are completed truthfully:

1. App Review **Contact Information** (first name, last name, phone, and email)
   and working reviewer sign-in credentials for the gated experience.
2. An Admin publishes the configured **App Privacy** answers; the Account
   Holder must personally accept any legal attestation Apple presents.
3. The Account Holder or an authorized Admin completes **Content Rights** in
   App Information based on the actual third-party content and licenses.

Digital Services Act/trader status and any other agreement or legal
attestations remain owner-only. The final submission is intentionally not
sent. A successful archive, upload, or provider test does not prove the
remaining physical-device, purchase, restore, notification, or store flows.

Purchase restoration is verified only when the customer returns to the same
Firebase account. Deleting that account and then creating a different Firebase
identity does not yet provide a secure automatic entitlement reassignment path;
handle that case through support until a server-verified RevenueCat identity
resync is implemented. Do not advertise cross-account restoration.

## App Check behavior

The web client initializes Firebase App Check only when
`VITE_APPCHECK_SITE_KEY` is present. It uses the reCAPTCHA Enterprise provider
and sends tokens through Firebase callable requests and the
`X-Firebase-AppCheck` header.

`APP_CHECK_MODE=soft` in `functions/.env.mybodyscan-f3daf` is the production
bootstrap setting:

- missing or invalid tokens are logged by HTTP handlers but do not block;
- callable `enforceAppCheck` is disabled;
- Firestore and Storage access continues to rely on Auth plus deployed rules.

Public health probes and best-effort telemetry remain non-blocking so operators
can observe and roll back an App Check incident. Stripe and RevenueCat webhooks
use their provider signature secrets instead of App Check. All authenticated
scan, nutrition, workout, coach, billing, account, admin, and bootstrap paths
become mode-aware; in `strict` they reject a missing or invalid token.

Keep Firebase Console enforcement for Functions, Firestore, and Storage off
until the site key is deployed and real sessions on every production domain
show valid tokens. Then observe App Check metrics for at least one normal usage
window. To harden Functions, change `APP_CHECK_MODE` to `strict` in that file,
redeploy Functions, and repeat auth, scan, nutrition, billing, account
deletion, and mobile checks. Enable Firebase product enforcement one product at
a time. Roll back to `soft` immediately if legitimate clients receive
permission failures.

Current verified console state on 2026-07-22: the web app is registered with
reCAPTCHA Enterprise; Cloud Firestore and Authentication are in **Monitoring**
and Storage is **Unenforced**. None of those Firebase products is rejecting
unverified users. Functions use the repository-controlled soft mode described
above. Do not enable console enforcement as part of this release.

## Local release gates

Use Node.js 20 or 22 for the web workspace and Node.js 22 for `functions/`.
Run from the repository root:

```bash
npm ci --no-audit --no-fund
npm --prefix functions ci --no-audit --no-fund
npm ci --prefix tests/rules --no-audit --no-fund
npx --yes npm@11 audit --omit=dev --audit-level=high
(cd functions && npx --yes npm@11 audit --omit=dev --audit-level=high)
npm ls --depth=0
npm --prefix functions ls --depth=0
npm --prefix tests/rules ls --depth=0
npm run check:production-config
npm run check:ios-release-config
npm run check:ios-release-guard
npm run lint
npm run typecheck
npm test
npm --prefix functions test
npm run build:prod
npm run rules:check
npx firebase-tools emulators:exec --only firestore --project demo-mbs "npm run test:rules"
npm run verify:scan
npm run build:native:release
npx cap sync ios
npm run smoke:native:ios
npm run smoke:ios
npm run storage:cors:check
npx firebase-tools deploy --only firestore:indexes,functions,firestore:rules,storage,hosting --project mybodyscan-f3daf --non-interactive --dry-run
```

After `build:prod`, start the local production preview in a second terminal:

```bash
npm run preview -- --host 127.0.0.1 --port 4173
```

Generate the App Store screenshot candidates from that reviewed preview. The
default `all` profile writes exact 1242 × 2688 iPhone PNGs and 2064 × 2752 iPad
PNGs into device-specific subdirectories:

```bash
node scripts/capture-app-store-screenshots.mjs http://127.0.0.1:4173
```

To regenerate only one size, set `MBS_SCREENSHOT_PROFILE` to `iphone-6.5` or
`ipad-13`. Every file's PNG dimensions are checked before the command succeeds.

Then run the public/local browser gates from the first terminal. Authenticated
specs in the broader suite run only when `PLAYWRIGHT_STORAGE_STATE` points to a
real test-account state file.

```bash
E2E_BASE_URL=http://127.0.0.1:4173 npm run test:e2e
BASE_URL=http://127.0.0.1:4173 npx playwright test --config e2e/playwright.config.ts
```

`build:prod` includes program validation, bundle-size safeguards, forbidden
Storage REST URL checks, and build metadata. Historical lint warnings may be
reported; lint must exit zero and any new correctness/security warning must be
reviewed. The audit commands intentionally use npm 11's supported bulk advisory
API; npm 10 may fall back to the retired quick-audit endpoint and report a
registry error instead of an audit result. `verify:scan` uses local Auth,
Firestore, Storage, and Functions
emulators plus a local OpenAI-compatible mock. It verifies successful analysis,
one atomic debit and ledger entry, duplicate-submit idempotency, one refund with
a matching ledger entry on analysis failure, and complete account deletion
across Auth, Firestore, scan uploads, user uploads, and private transformation
previews. CI repeats the same release-critical gates.

The iOS archive gate additionally requires the ignored
`ios/App/App/GoogleService-Info.plist` for project `mybodyscan-f3daf` and the
real public RevenueCat Apple SDK key in `.env.production.local`. After every
RevenueCat or native-config change, install the freshly signed build from Xcode
on the paired iPhone; an older installed build is not evidence for the current
bundle.

## Deployment order

Record the reviewed commit and preserve the current live Hosting release first.
Replace `RELEASE_ID` with a short, unique identifier such as the UTC date and
commit prefix.

```bash
git status --short
git rev-parse HEAD
npx firebase-tools hosting:clone mybodyscan-f3daf:live mybodyscan-f3daf:rollback-RELEASE_ID --project mybodyscan-f3daf
npm run storage:cors:apply
npx firebase-tools deploy --only firestore:indexes --project mybodyscan-f3daf --non-interactive
npx firebase-tools deploy --only functions --project mybodyscan-f3daf --non-interactive
npx firebase-tools deploy --only firestore:rules,storage --project mybodyscan-f3daf --non-interactive
npx firebase-tools deploy --only hosting --project mybodyscan-f3daf --non-interactive
```

Indexes are submitted first because they may build asynchronously. Backend code
is deployed before the web bundle. Rules and Storage policy are updated before
the new client becomes live. Do not continue to Hosting if any earlier command
fails.

After the Firebase smoke test passes, prepare the iOS binary from the same
reviewed commit. The command creates `ios/build/MyBodyScan.xcarchive`:

```bash
npm run ios:archive
open ios/build/MyBodyScan.xcarchive
```

In Xcode Organizer choose **Validate App**, then **Distribute App → App Store
Connect → Upload**. Release only to internal TestFlight first. Apple submission
is not authorized by a Firebase deploy and must wait for the device/purchase
checklist below.

## Mandatory post-deploy smoke test

Run all items with a non-admin production test account and inspect data/logs
without recording photo, health, token, or payment details in tickets.

`npm run smoke` is a safe preliminary probe: it creates and deletes a
disposable anonymous account and confirms that Coach, nutrition search, and
barcode lookup reject the account without a subscription while Checkout
rejects the account without an email. It does not exercise upstream nutrition
providers and does not replace the subscribed real-account checks below.

- `GET /api/system/health`, `/system/health`, and the public health endpoint
  return success and report scan/OpenAI/Stripe/USDA wiring as configured.
- Email, Google, and Apple sign-in work on the apex domain, `www`, and Firebase
  Hosting as configured; redirects return to the intended origin.
- A real four-photo scan uploads and reaches `complete` with a non-fallback
  estimate.
- Exactly one credit is consumed, with one matching `credits_ledger` entry.
- A forced failed scan is refunded; retries do not consume or refund twice.
- Live Stripe checkout completes; the webhook returns 2xx and grants the
  expected credits/entitlement once in `users/{uid}/private/credits` with one
  matching `credits_ledger` entry; Customer Portal opens for that customer.
- With only a One Scan purchase, the scan can be completed and the generated
  report/plan remains readable, but Coach, workout tracking, meal
  planning/logging/search/barcodes, Momentum, plateau coaching, and
  Transformation Preview all redirect or return permission denied.
- With Monthly and then Yearly active, every subscriber feature above opens and
  its backend request succeeds. Expiry/cancellation removes access after the
  paid period without deleting prior scan reports.
- Nutrition text search returns USDA data and a known barcode exercises the
  Open Food Facts/USDA fallback path. A product with sufficient category and
  nutrient data shows at most three alternatives that share a declared
  category and score strictly higher under the published MBS Product Insight
  formula; incomplete or unrelated candidates are withheld.
- An eligible adult explicitly consents to a Transformation Preview, one real
  front-photo edit completes, the image remains owner-only in Storage, and the
  UI presents it as a motivational illustration rather than a prediction.
- Plateau progress check-ins are off by default. Enabling them requests browser
  permission only after the user action, creates one token, and a targeted test
  opens `/history`. No alert is sent for fewer than three valid scans, a span
  under 21 days, failed/fallback scans, or an already-notified plateau window.
- Account deletion removes the Auth user, the complete Firestore user subtree,
  `scans/{uid}/`, `user_uploads/{uid}/`, and
  `transformation-previews/{uid}/`, plus that user's global hashed push-token
  ownership records.
- `/legal/privacy`, `/legal/terms`, `/legal/refund`, `/legal/disclaimer`, and
  the compatibility `/medical` route work on the custom and Firebase domains;
  SPA deep links refresh successfully.
- Function logs show no unexpected errors, repeated webhook failures, App Check
  lockouts, or scan-worker retry storms.
- Verify `index.html` is `no-store`, hashed assets are immutable, and the
  security headers in `firebase.json` are present.
- On TestFlight, purchase monthly, yearly, and one scan in sandbox. Each
  purchase produces one RevenueCat event and one matching `credits_ledger`
  grant; subscription renewal does not double-grant on webhook retries, the
  consumable never grants Pro, cancellation retains access only through the
  paid period, and restore on the same Firebase account recovers `pro` without
  adding duplicate credits. Test account deletion separately and confirm the
  support path for a customer who later returns with a different account.
- On the physical iPhone, opt into plateau alerts, accept the system prompt,
  receive one visible APNs notification, and confirm tapping it opens History.

Useful status-only commands:

```bash
curl -fsS https://mybodyscanapp.com/api/system/health
curl -fsSI https://mybodyscanapp.com/
curl -fsSI 'https://www.mybodyscanapp.com/legal/privacy?source=smoke'
npx firebase-tools functions:log --project mybodyscan-f3daf --only systemHealth,stripeWebhook,processQueuedScan,deleteAccount
```

Hosting custom-domain state is also available without exposing credentials:

```bash
dig www.mybodyscanapp.com CNAME +noall +answer
```

The expected record is `www.mybodyscanapp.com CNAME
mybodyscan-f3daf.web.app`. Do not mark the alias complete until Firebase reports
the redirect connected, a normal `curl` succeeds without bypassing TLS
validation, and the response permanently redirects to
`https://mybodyscanapp.com/legal/privacy?source=smoke`.

## Rollback

Hosting rollback is immediate and does not require rebuilding:

```bash
npx firebase-tools hosting:clone mybodyscan-f3daf:rollback-RELEASE_ID mybodyscan-f3daf:live --project mybodyscan-f3daf
```

To roll back Functions, indexes, and rules, deploy the previously approved
commit from an isolated worktree; never reset the operator's working tree:

```bash
git worktree add /private/tmp/mybodyscan-rollback PREVIOUS_GOOD_COMMIT
cd /private/tmp/mybodyscan-rollback
npm ci --no-audit --no-fund
npm --prefix functions ci --no-audit --no-fund
npm run build:prod
npm --prefix functions test
npm run storage:cors:apply
npx firebase-tools deploy --only firestore:indexes --project mybodyscan-f3daf --non-interactive
npx firebase-tools deploy --only functions --project mybodyscan-f3daf --non-interactive
npx firebase-tools deploy --only firestore:rules,storage --project mybodyscan-f3daf --non-interactive
```

Then repeat the full smoke test. Firestore documents and Stripe/vendor state are
not rolled back by code deployment. This release performs no destructive data
migration; if a future release does, it must add a separately tested data
rollback before approval.

An uploaded iOS binary cannot be replaced with the same build number. For an
iOS rollback, pause the manual/phased release or remove the affected version
from sale in App Store Connect, restore the previous backend if compatibility
requires it, fix the app, increment `CURRENT_PROJECT_VERSION`, and archive,
validate, and upload a replacement. Do not disable the existing RevenueCat
products or delete purchase history during rollback.

# MyBodyScan production release runbook

This is the authoritative web/Firebase release runbook. `docs/GO-LIVE.md`,
`docs/DEPLOY.md`, and README deployment notes point here; older audit reports are
historical and must not be used as deployment instructions.

## Scope and release policy

- Firebase project: `mybodyscan-f3daf`
- Primary site: `https://mybodyscanapp.com`
- Secondary domain: `https://mybodyscan.app` is currently hosted outside
  Firebase (Cloudflare/Hercules) and is not a Firebase Hosting release target.
  Treat it as an allowed origin only until the product owner deliberately moves
  it to Firebase.
- Firebase Hosting sites: `mybodyscan-f3daf.web.app` and
  `mybodyscan-f3daf.firebaseapp.com`
- Functions region/runtime: `us-central1`, Node.js 20
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
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID` (optional; required only for Analytics)
- `VITE_STRIPE_PUBLISHABLE_KEY` (must be a live-mode `pk_live_…` key)
- `VITE_APPCHECK_SITE_KEY` (reCAPTCHA Enterprise site key created in Google
  Cloud project `mybodyscan-f3daf`)
- the `VITE_PRICE_*` IDs represented in `.env.production.example`

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

Non-secret runtime configuration is committed in `firebase.json`, including
`APP_CHECK_MODE=soft`, the canonical host, auth feature flags, and rate limits.
The OpenAI scan pipeline defaults to `gpt-4o-mini`; do not
override `OPENAI_MODEL`, `OPENAI_PROVIDER`, or `OPENAI_BASE_URL` unless the
replacement has passed the scan reliability suite.

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
     As of 2026-07-21 Firebase has the Team ID, Key ID, Services ID
     `com.mybodyscan.web`, and private key configured. The Services ID is
     associated with the MyBodyScan App ID and its eight registered production
     domains/return URLs. Rotate the Apple key before release because its stored
     material was rendered during the configuration audit; install the new key
     in Firebase, verify a real web sign-in, and only then revoke the old key.
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
   - the webhook endpoint is `https://mybodyscanapp.com/stripeWebhook`;
   - subscribed events include `checkout.session.completed`,
     `invoice.payment_succeeded`, `customer.subscription.updated`, and
     `customer.subscription.deleted`.
     As of 2026-07-21 the repository allowlist and live-key wiring pass locally,
     but the live prices, portal, and webhook remain dashboard-only release gates.
6. Firebase Hosting → Custom domains: `mybodyscanapp.com` is the canonical
   Firebase custom domain. Its `www` alias must have the DNS record Firebase
   requests and show `HOST_ACTIVE`; confirm the canonical redirect behavior.
   As of 2026-07-21 `www.mybodyscanapp.com` is `HOST_UNHOSTED`. In Namecheap,
   add a CNAME with host `www` and value `mybodyscan-f3daf.web.app`, then wait
   for Firebase Hosting to report both ownership and host status active.
   `mybodyscan.app` is not currently attached to Firebase Hosting. To attach it,
   first make an explicit product/domain migration decision and then replace its
   current external DNS/hosting configuration.
7. GitHub → Settings → Environments → `production`: enabled versions of
   `VITE_APPCHECK_SITE_KEY` and `VITE_STRIPE_PUBLISHABLE_KEY` exist. The manual
   production probe reads the committed public Firebase Web API key and does not
   require a duplicate GitHub secret. The production deploy does not use a JSON key: workflow
   `id-token: write` authenticates through
   `projects/157018993008/locations/global/workloadIdentityPools/github-actions/providers/mybodyscan`
   as `github-mybodyscan-deploy@mybodyscan-f3daf.iam.gserviceaccount.com`.
   The provider condition must remain restricted to repository
   `Antisgoat/mybodyscan` and `refs/heads/main`, and the service account must have
   zero user-managed keys. Its project roles are Firebase Admin, Cloud Functions
   Admin, Cloud Build Editor, Service Account User, and Secret Manager Viewer.
   Secret Manager Viewer exposes metadata, not secret payloads. Every declared
   Function secret must separately grant `roles/secretmanager.secretAccessor`
   to the Function runtime account
   `157018993008-compute@developer.gserviceaccount.com`.
8. Product/legal owner approves the exact static Privacy, Terms, and Refund
   content and replaces the pages' dynamic “Last updated” date with that
   approved effective date. In particular, reconcile the Terms' 12-month credit
   expiry with the runtime's configurable/default expiry and confirm age,
   retention, refund, governing-law, vendor, and international-rights language.

## App Check behavior

The web client initializes Firebase App Check only when
`VITE_APPCHECK_SITE_KEY` is present. It uses the reCAPTCHA Enterprise provider
and sends tokens through Firebase callable requests and the
`X-Firebase-AppCheck` header.

`APP_CHECK_MODE=soft` is the production bootstrap setting:

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
window. To harden Functions, change `APP_CHECK_MODE` to `strict`, redeploy
Functions, and repeat auth, scan, nutrition, billing, account deletion, and
mobile checks. Enable Firebase product enforcement one product at a time. Roll
back to `soft` immediately if legitimate clients receive permission failures.

## Local release gates

Use Node.js 20 and run from the repository root:

```bash
npm ci --no-audit --no-fund
npm --prefix functions ci --no-audit --no-fund
npm run check:production-config
npm run lint
npm run typecheck
npm test
npm --prefix functions test
npm run build:prod
npm run rules:check
npm ci --prefix tests/rules --no-audit --no-fund
npx firebase-tools emulators:exec --only firestore --project demo-mbs "npm run test:rules"
npm run verify:scan
```

After `build:prod`, start the local production preview in a second terminal:

```bash
npm run preview -- --host 127.0.0.1 --port 4173
```

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
reviewed. `verify:scan` uses local Auth, Firestore, Storage, and Functions
emulators plus a local OpenAI-compatible mock. It verifies successful analysis,
one atomic debit and ledger entry, duplicate-submit idempotency, one refund with
a matching ledger entry on analysis failure, and complete account deletion
across Auth, Firestore, and both Storage prefixes. CI repeats the same
release-critical gates.

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

## Mandatory post-deploy smoke test

Run all items with a non-admin production test account and inspect data/logs
without recording photo, health, token, or payment details in tickets.

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
- Nutrition text search returns USDA data and a known barcode exercises the
  Open Food Facts/USDA fallback path.
- Account deletion removes the Auth user, the complete Firestore user subtree,
  `scans/{uid}/`, and `user_uploads/{uid}/`.
- `/legal/privacy`, `/legal/terms`, `/legal/refund`, `/legal/disclaimer`, and
  the compatibility `/medical` route work on the custom and Firebase domains;
  SPA deep links refresh successfully.
- Function logs show no unexpected errors, repeated webhook failures, App Check
  lockouts, or scan-worker retry storms.
- Verify `index.html` is `no-store`, hashed assets are immutable, and the
  security headers in `firebase.json` are present.

Useful status-only commands:

```bash
curl -fsS https://mybodyscanapp.com/api/system/health
curl -fsSI https://mybodyscanapp.com/
npx firebase-tools functions:log --project mybodyscan-f3daf --only systemHealth,stripeWebhook,processQueuedScan,deleteAccount
```

Hosting custom-domain state is also available without exposing credentials:

```bash
dig www.mybodyscanapp.com CNAME +noall +answer
```

The expected record is `www.mybodyscanapp.com CNAME
mybodyscan-f3daf.web.app`. Do not proceed while Firebase reports
`HOST_UNHOSTED`.

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

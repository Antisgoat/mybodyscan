# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/cf8140ba-edcc-4236-9166-fb030db04005

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/cf8140ba-edcc-4236-9166-fb030db04005) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

### If npm EINTEGRITY occurs

Run `npm cache clean --force && rm -rf node_modules && npm install --prefer-online` to refresh the cache and reinstall.

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Deploy via Firebase Hosting and Cloud Functions (Node 20). Ensure Stripe secrets are set for payments.

## Mobile readiness

The web app now includes WebView guardrails so it can be wrapped with Capacitor. See [mobile/WRAP.md](mobile/WRAP.md) for the complete step-by-step plan covering Capacitor setup, platform provisioning, and build handoff.

Highlights:

- Google sign-in auto-detects iOS/Android WebViews and uses redirect flows (no popup requirements)
- External payment links route through `openExternal()` so Stripe opens in the system browser
- File capture inputs request the environment camera with size/type validation, keeping scan uploads mobile-friendly
- `/oauth/return` handles OAuth and deep-link callbacks as a stable fallback route for native shells
- Android back navigation prompts before leaving critical flows (scan upload/processing, Stripe return pages)

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/tips-tricks/custom-domain#step-by-step-guide)

## Runbook (envs, demo, App Check, rewrites)

### Required web environment variables

- `VITE_FIREBASE_API_KEY` – Firebase Web API key consumed by `src/lib/firebase.ts`.
- `VITE_FIREBASE_AUTH_DOMAIN` – Firebase Auth domain (e.g., `mybodyscan-f3daf.firebaseapp.com`).
- `VITE_FIREBASE_PROJECT_ID` – Firebase project ID shared across web and Cloud Functions.
- `VITE_FIREBASE_APP_ID` – Firebase App ID for the deployed web app.
- `VITE_FIREBASE_STORAGE_BUCKET` – Required for scan uploads and storage access.
- `VITE_FIREBASE_MESSAGING_SENDER_ID` – Required for Firebase Auth session handling.
- `VITE_PRICE_STARTER` – Stripe price ID for the one-time starter plan.
- `VITE_PRICE_YEARLY` – Stripe price ID for the yearly subscription.

### Optional web toggles & helpers

- `VITE_ENABLE_APPLE` – Set to `true` to force-render Apple sign-in alongside provider autodetect.
- `VITE_ENABLE_DEMO` – Set to `true` to expose the hosted demo sign-in on any origin.
- `VITE_APPCHECK_SITE_KEY` – reCAPTCHA v3 site key used by Firebase App Check (soft enforcement when unset).
- `VITE_FUNCTIONS_BASE_URL` – Override Cloud Functions origin (defaults to `https://${region}-${project}.cloudfunctions.net`).
- `VITE_STRIPE_PK` / `VITE_STRIPE_PUBLISHABLE_KEY` – Stripe publishable key; drives test/live banners and diagnostics.

### Cloud Functions secrets (attach via `firebase functions:secrets:set`)

| Function                                 | Secret name(s)                              | Purpose                                                           |
| ---------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------- |
| `createCheckout`, `createCustomerPortal` | `STRIPE_SECRET` (alias `STRIPE_SECRET_KEY`) | Stripe API key for hosted checkout + portal.                      |
| `stripeWebhook`                          | `STRIPE_SECRET`, `STRIPE_WEBHOOK`           | Stripe API key and webhook signing secret.                        |
| `coachChat`                              | `OPENAI_API_KEY`                            | Grants access to OpenAI chat models.                              |
| `nutritionSearch`, `nutritionBarcode`    | `USDA_FDC_API_KEY`                          | USDA FoodData Central lookups (Open Food Facts handles fallback). |

### Scan engine configuration (Firebase Functions)

- Required: `OPENAI_API_KEY` in Secret Manager (attach with `firebase functions:secrets:set OPENAI_API_KEY --project <projectId>`). Optional: `OPENAI_MODEL`, `OPENAI_BASE_URL`, and `OPENAI_PROVIDER` via `firebase-functions/params` or environment variables.
- Deploy after setting the secret: `npm --prefix functions run build && firebase deploy --only functions --project <projectId>`.
- Verify: call `/systemHealth` and confirm `engineConfigured=true`, `engineMissingConfig=[]`, and `storageBucket/projectId` are populated. Missing entries surface as a safe list so production UIs show “scan engine not configured” until the secret is present.

### Operational notes

- CSP `connect-src` in `firebase.json` already includes Identity Toolkit, Secure Token, Firestore, Storage, Stripe, Apple ID, Cloud Functions, and Cloud Run endpoints; extend here first before hitting new SaaS APIs.
- Hosting rewrites send `/systemHealth` to the health-check function and `/api/nutrition/*` to authenticated nutrition handlers. Keep these rules ahead of the SPA catch-all.
- `scripts/smoke.sh` is idempotent and requires `VITE_FIREBASE_API_KEY` plus configured `VITE_PRICE_*` envs. It creates a throwaway Firebase user, fetches an ID token, and probes `/systemHealth`, `/nutritionSearch`, `/coachChat`, and `/createCheckout` (accepts `200`, `501`, or `502` based on config).
- Nutrition and barcode features now require a signed-in Firebase user; signed-out visitors see "Sign in to search foods and scan barcodes."
- IdentityToolkit `clientConfig` probes may log a single warning (404/403) if the current origin is not in Firebase Auth authorized domains; sign-in still works, but add the domain in Console for production.

## Prod Diagnostics & Probes

- `npm run smoke` invokes `scripts/smoke.sh`, generating a temporary Firebase user to call critical endpoints. Set `VITE_FIREBASE_API_KEY` (and optional `BASE_URL`) before running.
- Visit `/diagnostics` while signed in (or set `VITE_SHOW_DIAGNOSTICS=true`) to review system status from Cloud Functions.

## Prod Smoke

- `npm run probe` mints an anonymous Firebase ID token with `FIREBASE_WEB_API_KEY` and probes production HTTPS endpoints via Cloud Functions/Run bases.
- Required env: `FIREBASE_WEB_API_KEY`, `PROJECT_ID`; optional: `REGION` (defaults to `us-central1`), `BASES` (comma/space-separated host templates), `TEST_PRICE_ID` (overrides `price_xxx`).
- Example (default bases):

```sh
FIREBASE_WEB_API_KEY=your_web_api_key PROJECT_ID=mybodyscan-f3daf npm run probe
```

- Example overriding bases explicitly:

```sh
FIREBASE_WEB_API_KEY=your_web_api_key \
PROJECT_ID=mybodyscan-f3daf \
BASES="https://us-central1-mybodyscan-f3daf.cloudfunctions.net https://mybodyscan-f3daf-us-central1.a.run.app" \
npm run probe
```

## Environment variables

Create a `.env.local` for development based on `.env.example` and a `.env.production` for production builds.

**Required**

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_PRICE_STARTER`
- `VITE_PRICE_YEARLY`

**Optional / toggles**

- `VITE_ENABLE_APPLE`
- `VITE_ENABLE_DEMO`
- `VITE_APPCHECK_SITE_KEY`
- `VITE_FUNCTIONS_BASE_URL`
- `VITE_STRIPE_PK` or `VITE_STRIPE_PUBLISHABLE_KEY`

### Enable Sign in with Apple (Web)

1. Firebase Console → **Auth** → **Apple** → Enable. Provide your Team ID, Key ID, Services ID, and upload the `.p8` key.
2. Add authorized domains: `mybodyscan.app`, `mybodyscan-f3daf.web.app`, `mybodyscan-f3daf.firebaseapp.com`.
3. Copy the redirect handler URL(s) from Firebase (e.g., `https://<auth-domain>/__/auth/handler`) and add them to Apple Developer → **Identifiers** → your Services ID → **Return URLs**.
4. Optional: place Apple's association file at `/.well-known/apple-developer-domain-association.txt` on Firebase Hosting (replace the placeholder committed in `public/.well-known/`).

Cloud Functions read Stripe credentials from Firebase Secrets Manager entries named `STRIPE_SECRET` (Stripe API key) and `STRIPE_WEBHOOK` (signing secret). Configure them with `firebase functions:secrets:set` (see Deployment).

### Functions environment and secrets

Set these secrets or environment variables via Firebase (preferred) or your deployment environment:

- `OPENAI_API_KEY` _(HTTPS chat + nutrition features; mock mode activates if unset)_
- `STRIPE_SECRET_KEY` or `STRIPE_SECRET` _(required for live payments; missing causes Stripe HTTPS endpoints to respond with 501)_
- `HOST_BASE_URL` _(used for Stripe return URLs; defaults to `https://mybodyscanapp.com`)_
- `APP_CHECK_ALLOWED_ORIGINS` _(comma-delimited allowlist for strict App Check enforcement; optional)_
- `APP_CHECK_ENFORCE_SOFT` _(defaults to `true`; set to `false` to enforce App Check for allowed origins)_

## Secrets & Deploy

### Build & deploy Firebase Functions (Node 20)

1. `npm --prefix functions run build` – compiles TypeScript with Node 20 targets and verifies `functions/lib/index.js` exists.
2. `firebase deploy --only functions --project <projectId>` – uses the generated `lib/index.js` entrypoint exported from `functions/src/index.ts`.

The `functions/package.json` scripts keep the runtime on Node 20 and fail fast if the compiled bundle is missing, which prevents partial deploys.

### Inspect and manage Firebase secrets

- List all secrets: `firebase functions:secrets:list --project <projectId>`
- Describe a secret: `firebase functions:secrets:describe HOST_BASE_URL --project <projectId>`
- Set or update a secret: `firebase functions:secrets:set HOST_BASE_URL --project <projectId>`

### Runtime behavior without optional secrets

- `HOST_BASE_URL` is optional; HTTPS handlers fall back to each request's origin when it is not configured.
- `APP_CHECK_ALLOWED_ORIGINS` may be empty. Keeping `APP_CHECK_ENFORCE_SOFT=true` allows soft enforcement so missing tokens log warnings instead of failing the request.
- If `STRIPE_SECRET` is absent, Stripe-powered endpoints respond with HTTP 501 (`payments_disabled`) instead of crashing or blocking deploys.

### Payments config sources & troubleshooting

- Stripe HTTPS handlers resolve secrets in order: Firebase Secret Manager entry `STRIPE_SECRET` → `process.env.STRIPE_SECRET`/`STRIPE_API_KEY` → `functions.config().stripe.secret`. If none are present, handlers return `501 { error: "payments_disabled", code: "no_secret" }` and log `{ "svc":"checkout", ... , "ok":false }`.
- Webhook verification follows the same pattern for the `STRIPE_WEBHOOK` secret (Secret Manager first, then environment variables `STRIPE_WEBHOOK`/`STRIPE_SIGNING_SECRET`, followed by `functions.config().stripe.webhook_secret`).
- Allowlisted price IDs load from `stripe.prices.*` runtime config, matching plan keys `single`, `pack3`, `pack5`, `monthly`, `annual`, plus legacy keys (`one`, `extra`, `pro_monthly`, `elite_annual`). The default table includes:
  - `price_1RuOpKQQU5vuhlNjipfFBsR0` (`single` / `one`)
  - `price_1RuOr2QQU5vuhlNjcqTckCHL` (`pack3`)
  - `price_1RuOrkQQU5vuhlNj15ebWfNP` (`pack5`)
  - `price_1RuOtOQQU5vuhlNjmXnQSsYq` (`monthly`)
  - `price_1RuOw0QQU5vuhlNjA5NZ66qq` (`annual`)
  - Legacy extras remain allowlisted for existing subscriptions.
- Successful checkout/portal requests emit one-line JSON logs (`svc` = `checkout` or `portal`) with `uid`, `price`, `mode`, `customer`, and `ok:true`. Failures log the same shape with `ok:false` and a `code` value for triage.
- Run `npm --prefix functions test` to confirm the active secret source resolves in your environment before deploying.

### Example production secret values

- `HOST_BASE_URL = https://mybodyscanapp.com`
- `APP_CHECK_ALLOWED_ORIGINS = https://mybodyscanapp.com,https://www.mybodyscanapp.com,https://mybodyscan-f3daf.web.app,https://mybodyscan-f3daf.firebaseapp.com`
- `APP_CHECK_ENFORCE_SOFT = true`

## Firebase Web config (Lovable without env vars)

We first try Vite env vars (VITE*FIREBASE*\*). If they are absent (e.g., Lovable has no Environment panel), we fall back to `src/config/firebase.public.ts` which contains your **public** Web config.

Authorized domains (Firebase Console → Auth → Settings):

- localhost
- 127.0.0.1
- mybodyscan-f3daf.web.app
- mybodyscan-f3daf.firebaseapp.com
- your Lovable preview domain (copy from the preview URL)
- your custom domain(s)

Notes:

- The Storage bucket must be `mybodyscan-f3daf.appspot.com` (the canonical bucket), not `...firebasestorage.app` which is a download host.

## Firestore & Storage rules quick reference

Production deploys ship the compiled security rules from `database.rules.json` and `storage.rules`.

```text
// Firestore
match /users/{uid}/scans/{scanId} {
  allow read: if request.auth.uid == uid || request.auth.token.staff == true;
  allow write: if false; // writes come through Cloud Functions
}

match /events/telemetry/{eventId} {
  allow create: if request.auth != null;
  allow read: if request.auth.token.staff == true;
}

// Storage
match /user_uploads/{uid}/{scanId}/{filename} {
  allow read: if request.auth.uid == uid;
  allow create, update: if request.auth.uid == uid &&
    request.resource.size <= 15 * 1024 * 1024 &&
    request.resource.contentType.matches('image/jpeg|image/pjpeg');
}
```

## Smoke test checklist

Run this sequence before shipping a release (desktop Chrome and iOS WebView/Safari):

1. Sign in with Google (redirect flow) and verify return to `/home`.
2. From `/plans`, start checkout for the One Scan plan and ensure Stripe test checkout loads.
3. From Settings, open the Billing Portal (after completing a purchase) and verify it loads; confirm the `no_customer` message appears without purchases.
4. Complete a full scan: upload four photos, confirm retries succeed on flaky network, and wait for the processing toast.
5. Visit Coach and send a prompt; confirm reply renders.
6. Search for a meal in Nutrition, add it, and see the log update.
7. Visit `/__diag` or `/__smoke` (SmokeKit) and run the Stripe, App Check, and nutrition probes.

## UAT harness

- Route: `https://<host>/__uat` (also available at the Vite dev URL). Access requires a staff claim, the allowlisted `developer@adlrlabs.com`, or development mode.
- Probes cover runtime config, auth redirect capability, Stripe dry-runs (`X-UAT: 1`), App Check enforcement for coach/nutrition, scan start/upload/submit idempotency, coach reply, nutrition search, barcode lookup, and diagnostics.
- Expected PASS: init.json exposes `projectId`/`apiKey`/`authDomain`; checkout dry-run returns `{ url }`; portal dry-run returns `{ url }` or `{ error:"no_customer" }`; `/api/coach` rejects without App Check and passes with it (or returns a structured empty message error); duplicate scan submit yields `code: "duplicate_submit"`; nutrition probes return items; diagnostics clear caches and emit telemetry.
- The "Recent Logs" panel lists the last five runs and mirrors `[uat]` entries in the browser console for deeper triage.

## Final smoke checklist

- Delete account removes Auth user, Firestore subtree, and Storage folder; subsequent login creates a new clean user.
- Export returns JSON with signed URLs and latest results.
- Firestore/Storage rules compile and block writes where expected (private paths).
- TEST badge appears when pk*test* is in use; Settings shows Support, Terms, Privacy, and Refresh Claims works (∞ on developer@).
- `/__smoke` probes show: rules write-deny, export JSON preview OK.
- CI green; no regressions to sign-in, payments/portal, scans, coach, nutrition.

## Legal pages

- Terms of Service: `/legal/terms`
- Privacy Policy: `/legal/privacy`

## Testing rules

Run Firestore security rules tests using the emulator suite:

```sh
npm run test:rules
```

## Scan Processing

### Option A: HTTP fallback (no Eventarc)

Deploy `processQueuedScanHttp` and the client will call this HTTPS endpoint after each upload. No additional Google Cloud services are required.

### Option B: Firestore trigger via Eventarc

When ready to switch back to a Firestore trigger, grant the necessary Eventarc roles and redeploy:

```sh
scripts/setup-eventarc.sh
firebase deploy --only functions:processQueuedScan
```

## Fixing Storage uploads on custom domain

- Ensure the Storage bucket is **mybodyscan-f3daf.appspot.com** and apply the CORS policy in `scripts/cors.json`:
  - `npm run storage:cors:set`
  - Verify with `npm run storage:cors:get`
- Browser uploads must go through the Firebase Storage SDK (`uploadBytesResumable`) to `scans/{uid}/{scanId}/{pose}.jpg` only. If Safari blocks the SDK upload (CORS/preflight/no-bytes), the client automatically falls back to `/api/scan/uploadPhoto` which streams the same JPEG bytes via Cloud Functions.
- The upload runtime logs a one-time sanity line with the Storage bucket + current origin; if the bucket or auth uid is missing, the flow fails fast with a clear UI error instead of hanging at 0%.

**How to validate**
- Safari Private Window on https://mybodyscanapp.com
- Upload 4 photos (front/back/left/right)
- No preflight 404s; progress starts within 1s and reaches 100% per pose
- Scan transitions to queued/processing
- Results page renders metrics and a plan

## Deployment

Deploy Functions and Hosting after setting Stripe keys and webhook secret via `firebase functions:secrets:set`:

### Functions runtime

- Requires **Node.js 20** for the Cloud Functions workspace (`functions/`).
- Build locally before deploying with `npm --prefix functions run build`.
- Deploy to Firebase with `firebase deploy --only functions,hosting`.

> **Functions deploy note:** the Functions pipeline installs and builds from the `functions/` workspace only. A root `npm install` or web build is **not** required to deploy backend changes. Run `npm --prefix functions ci && npm --prefix functions run build` locally before `firebase deploy --only functions` to mirror production. Generate a `functions/package-lock.json` once with `npm --prefix functions install --package-lock-only` if it is missing (required for `npm ci`).

```sh
firebase functions:secrets:set STRIPE_SECRET
firebase functions:secrets:set STRIPE_WEBHOOK
firebase deploy --only functions,hosting
```

If the web build ever encounters local integrity cache issues, use `npm run ci:clean` (clears the cache, reinstalls in the root
app). This script is intended for web builds only and is decoupled from the Cloud Functions deploy flow.

Stripe webhook requests now require a valid signature. Invalid signatures return HTTP 400 and are not processed, so make sure the webhook endpoint in your Stripe dashboard uses the current signing secret. Webhook deliveries are de-duplicated via the `stripe_events/{eventId}` collection with a 30-day TTL on markers—enable TTL on the `expiresAt` field in the Firestore console to automatically purge old markers.

## Auth env setup (fix for `auth/api-key-not-valid`)

1. Fill **.env.development** and **.env.production** with your real Firebase Web App values (see `.env.example`).
2. In **Lovable → Project Settings → Environment**, add the same `VITE_FIREBASE_*` variables.
3. Firebase Console → **Authentication → Settings → Authorized domains**: add
   - localhost
   - 127.0.0.1
   - mybodyscan-f3daf.web.app
   - mybodyscan-f3daf.firebaseapp.com
   - your custom domain(s) (e.g., mybodyscan.app, www.mybodyscan.app)
   - your Lovable preview domain
4. Rebuild locally: `npm ci && npm run build && npm run preview`
5. Deploy: `npx firebase-tools deploy --only hosting --project mybodyscan-f3daf --force`

## Smoke test

After deploying this PR, validate end-to-end:

1. Auth

- Desktop Chrome: sign in with Email and Google
- iOS Safari (private tab): tap Google → redirect completes and signs in; no auth/internal-error
- Reload the app: redirect result is consumed once, no page loop

2. Scan

- Start a scan, upload 4 photos, Submit
- Inference completes; result appears on the results page and is saved under `users/{uid}/scans/{scanId}`
- If no credits and not whitelisted, a toast prompts to buy credits

3. Credits & Billing

- Plans: “Buy Now/Subscribe/Yearly” call Cloud Run `https://createcheckout-534gpapj7q-uc.a.run.app` (set `VITE_USE_HOSTING_SHIM=true` to force `/createCheckout` during testing)
- After successful payment and webhook, credits/subscription reflect on the account
- “Manage Billing” opens Stripe Customer Portal via `https://createcustomerportal-534gpapj7q-uc.a.run.app` with the same optional hosting shim fallback

4. Coach & Nutrition

- Coach chat responds for authed users; errors show friendly toasts
- Nutrition: search returns results (USDA first, OFF fallback); barcode works (OFF first)
- Add/edit/delete meal entries updates daily totals

5. Stability

- Visit `/__diag`: shows auth user, claims, App Check token present, Stripe key presence, build info
- “Unregister SW + Clear caches” succeeds (no SW by default)

6. CI

- GitHub Actions workflow green for Web and Functions

## Secrets & Deploy Quick Reference

- List secrets: `firebase functions:secrets:list --project <projectId>`
- Set secrets (one at a time):
  - `firebase functions:secrets:set HOST_BASE_URL --project <projectId>`
  - `firebase functions:secrets:set APP_CHECK_ALLOWED_ORIGINS --project <projectId>`
  - `firebase functions:secrets:set APP_CHECK_ENFORCE_SOFT --project <projectId>`
  - `firebase functions:secrets:set OPENAI_API_KEY --project <projectId>`
  - Optional: `firebase functions:secrets:set STRIPE_SECRET --project <projectId>`
- Run Playwright end-to-end tests locally: `BASE_URL=https://mybodyscanapp.com npm run test:e2e`
- Full go-live runbook: see [`docs/GO-LIVE.md`](docs/GO-LIVE.md)

## Reliable deploy (prod)

- Build with stamp: `VITE_BUILD_TIME` + `VITE_BUILD_SHA`.
- Deploy functions first (if changed), then hosting:

```
npm --prefix functions run build && firebase deploy --only functions --project mybodyscan-f3daf
VITE_BUILD_TIME=$(date -u +%FT%TZ) VITE_BUILD_SHA=$(git rev-parse --short HEAD) npm run build
firebase deploy --only hosting --project mybodyscan-f3daf
```

- `firebase.json` serves `index.html` with `Cache-Control: no-store` to prevent stale bundles.

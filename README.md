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

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/tips-tricks/custom-domain#step-by-step-guide)

## Runbook (envs, demo, App Check, rewrites)

- VITE_RECAPTCHA_V3_SITE_KEY: site key for Firebase App Check (reCAPTCHA v3). If unset in dev/demo, App Check runs in soft mode and does not block.
- VITE_DEMO_MODE: set to `true` to always enable demo. Demo also auto-enables on localhost/127.0.0.1/lovable hosts or with `?demo=1`.
- SPA rewrites: `firebase.json` places API rewrites (e.g., `/api/nutrition/*`) before the final catch-all to `/index.html` to avoid 404s on deep links.
- Nutrition endpoints: frontend uses only `/api/nutrition/search` and `/api/nutrition/barcode`.
- System smoke check: call the `health` HTTPS function (`GET https://us-central1-<project-id>.cloudfunctions.net/health`) to confirm env wiring, then sign in and visit `/system/check` to view the JSON payload and run the nutrition/coach/credits buttons.

## Environment variables

Create a `.env.local` for development based on `.env.example` and a `.env.production` for production builds. Required variables:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID`
- `VITE_FUNCTIONS_BASE_URL`
- `VITE_APPCHECK_SITE_KEY` *(App Check reCAPTCHA v3 site key; soft if missing in dev)*
- `VITE_DEMO_MODE` *(optional; demo auto-enables on localhost/lovable or with `?demo=1`)*

### Enable Sign in with Apple (Web)

1. Firebase Console → **Auth** → **Apple** → Enable. Provide your Team ID, Key ID, Services ID, and upload the `.p8` key.
2. Add authorized domains: `mybodyscan.app`, `mybodyscan-f3daf.web.app`, `mybodyscan-f3daf.firebaseapp.com`.
3. Copy the redirect handler URL(s) from Firebase (e.g., `https://<auth-domain>/__/auth/handler`) and add them to Apple Developer → **Identifiers** → your Services ID → **Return URLs**.
4. Optional: place Apple's association file at `/.well-known/apple-developer-domain-association.txt` on Firebase Hosting (replace the placeholder committed in `public/.well-known/`).

Cloud Functions read Stripe credentials from Firebase Secrets Manager entries named `STRIPE_SECRET` (Stripe API key) and `STRIPE_WEBHOOK` (signing secret). Configure them with `firebase functions:secrets:set` (see Deployment).

### Functions environment and secrets

Set these secrets or environment variables via Firebase (preferred) or your deployment environment:

- `OPENAI_API_KEY` *(HTTPS chat + nutrition features; mock mode activates if unset)*
- `STRIPE_SECRET` **and** `STRIPE_SECRET_KEY` *(both required for live payments; missing either causes Stripe HTTPS endpoints to respond with 501)*
- `HOST_BASE_URL` *(used for Stripe return URLs; defaults to `https://mybodyscanapp.com`)*
- `APP_CHECK_ALLOWED_ORIGINS` *(comma-delimited allowlist for strict App Check enforcement; optional)*
- `APP_CHECK_ENFORCE_SOFT` *(defaults to `true`; set to `false` to enforce App Check for allowed origins)*

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
- If `STRIPE_SECRET` and `STRIPE_SECRET_KEY` are absent, Stripe-powered endpoints respond with HTTP 501 (`payments_disabled`) instead of crashing or blocking deploys.

### Example production secret values

- `HOST_BASE_URL = https://mybodyscanapp.com`
- `APP_CHECK_ALLOWED_ORIGINS = https://mybodyscanapp.com,https://www.mybodyscanapp.com,https://mybodyscan-f3daf.web.app,https://mybodyscan-f3daf.firebaseapp.com`
- `APP_CHECK_ENFORCE_SOFT = true`

## Firebase Web config (Lovable without env vars)
We first try Vite env vars (VITE_FIREBASE_*). If they are absent (e.g., Lovable has no Environment panel), we fall back to `src/config/firebase.public.ts` which contains your **public** Web config.

Authorized domains (Firebase Console → Auth → Settings):
- localhost
- 127.0.0.1
- mybodyscan-f3daf.web.app
- mybodyscan-f3daf.firebaseapp.com
- your Lovable preview domain (copy from the preview URL)
- your custom domain(s)

Notes:
- The Storage bucket must be `mybodyscan-f3daf.appspot.com` (the canonical bucket), not `...firebasestorage.app` which is a download host.

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

## Deployment

Deploy Functions and Hosting after setting Stripe keys and webhook secret via `firebase functions:secrets:set`:

### Functions runtime

- Requires **Node.js 20** for the Cloud Functions workspace (`functions/`).
- Build locally before deploying with `npm --prefix functions run build`.
- Deploy to Firebase with `firebase deploy --only functions,hosting`.

> **Functions deploy note:** the Functions pipeline installs and builds from the `functions/` workspace only. A root `npm install` or web build is **not** required to deploy backend changes. Run `npm --prefix functions ci && npm --prefix functions run build` locally before `firebase deploy --only functions` to mirror production. Generate a `functions/package-lock.json` once with `npm --prefix functions install --package-lock-only` if it is missing (required for `npm ci`).

```sh
firebase functions:secrets:set STRIPE_SECRET
firebase functions:secrets:set STRIPE_SECRET_KEY
firebase functions:secrets:set STRIPE_WEBHOOK
firebase deploy --only functions,hosting
```

If the web build ever encounters local integrity cache issues, use `npm run ci:clean` (clears the cache, reinstalls in the root
app). This script is intended for web builds only and is decoupled from the Cloud Functions deploy flow.

Stripe webhook requests now require a valid signature. Invalid signatures return HTTP 400 and are not processed, so make sure the webhook endpoint in your Stripe dashboard uses the current signing secret. Webhook deliveries are de-duplicated via the `stripe_events/{eventId}` collection with a 30-day TTL on markers—enable TTL on the `expiresAt` field in the Firestore console to automatically purge old markers.

## Auth env setup (fix for `auth/api-key-not-valid`)
1) Fill **.env.development** and **.env.production** with your real Firebase Web App values (see `.env.example`).
2) In **Lovable → Project Settings → Environment**, add the same `VITE_FIREBASE_*` variables.
3) Firebase Console → **Authentication → Settings → Authorized domains**: add
   - localhost
   - 127.0.0.1
   - mybodyscan-f3daf.web.app
   - mybodyscan-f3daf.firebaseapp.com
   - your custom domain(s) (e.g., mybodyscan.app, www.mybodyscan.app)
   - your Lovable preview domain
4) Rebuild locally: `npm ci && npm run build && npm run preview`
5) Deploy: `npx firebase-tools deploy --only hosting --project mybodyscan-f3daf --force`

## Smoke test

After deploying this PR, validate end-to-end:

1) Auth
- Desktop Chrome: sign in with Email and Google
- iOS Safari (private tab): tap Google → redirect completes and signs in; no auth/internal-error
- Reload the app: redirect result is consumed once, no page loop

2) Scan
- Start a scan, upload 4 photos, Submit
- Inference completes; result appears on the results page and is saved under `users/{uid}/scans/{scanId}`
- If no credits and not whitelisted, a toast prompts to buy credits

3) Credits & Billing
- Plans: “Buy Now/Subscribe/Yearly” open Stripe Checkout via `/createCheckout`
- After successful payment and webhook, credits/subscription reflect on the account
- “Manage Billing” opens Stripe Customer Portal via `/createCustomerPortal`

4) Coach & Nutrition
- Coach chat responds for authed users; errors show friendly toasts
- Nutrition: search returns results (USDA first, OFF fallback); barcode works (OFF first)
- Add/edit/delete meal entries updates daily totals

5) Stability
- Visit `/__diag`: shows auth user, claims, App Check token present, Stripe key presence, build info
- “Unregister SW + Clear caches” succeeds (no SW by default)

6) CI
- GitHub Actions workflow green for Web and Functions

## Secrets & Deploy Quick Reference

- List secrets: `firebase functions:secrets:list --project <projectId>`
- Set secrets (one at a time):
  - `firebase functions:secrets:set HOST_BASE_URL --project <projectId>`
  - `firebase functions:secrets:set APP_CHECK_ALLOWED_ORIGINS --project <projectId>`
  - `firebase functions:secrets:set APP_CHECK_ENFORCE_SOFT --project <projectId>`
  - `firebase functions:secrets:set OPENAI_API_KEY --project <projectId>`
  - Optional: `firebase functions:secrets:set STRIPE_SECRET --project <projectId>`
  - Optional: `firebase functions:secrets:set STRIPE_SECRET_KEY --project <projectId>`
- Run Playwright end-to-end tests locally: `BASE_URL=https://mybodyscanapp.com npm run test:e2e`
- Full go-live runbook: see [`docs/GO-LIVE.md`](docs/GO-LIVE.md)

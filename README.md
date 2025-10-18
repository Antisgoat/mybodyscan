# MyBodyScan Production Readiness Guide

This repository contains the production build for [mybodyscanapp.com](https://mybodyscanapp.com) and the Firebase Functions that power nutrition search, barcode lookup, workouts, credits, and coach chat. The project is wired for end-to-end verification with automated tests, observability, and operational tooling so you can safely deploy to both `mybodyscanapp.com` and `mybodyscan-f3daf.web.app`.

## Quick start

```bash
# Install dependencies (Node 20)
npm ci

# Launch the Vite development server
npm run dev:web

# Start the Firebase emulators (Auth, Firestore, Functions)
npm run dev:emulators

# Seed the developer account (developer@adlrlabs.com)
npm run seed:dev

# Build the production bundle (+ writes /system/health)
npm run build

# Compile Cloud Functions
npm --prefix functions run build
```

Copy `.env.example` to `.env.local` when configuring Firebase keys locally.

Visit `/ops` after signing in as `developer@adlrlabs.com` to view environment metadata, run health checks, refresh claims, or request demo seeding. The console is protected by custom claims on both the client and server.

## Environment configuration

Create `.env.local` (web) and configure Firebase secrets/parameters (functions). Required keys:

### Frontend (`.env.local`)

| Key | Purpose |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | Firebase web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID (defaults to `mybodyscan-f3daf`) |
| `VITE_FIREBASE_STORAGE_BUCKET` | Cloud Storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Messaging sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase app ID |
| `VITE_FIREBASE_MEASUREMENT_ID` | Analytics measurement ID |
| `VITE_FUNCTIONS_BASE_URL` | Custom domain for callable HTTPS endpoints |
| `VITE_RECAPTCHA_KEY` | reCAPTCHA v3 site key for App Check (falls back to debug tokens when missing) |
| `VITE_AUTH_ALLOWED_HOSTS` | Comma-separated auth/hosting allowlist (include localhost + deployed hosts) |
| `VITE_USDA_API_KEY` | Optional USDA FoodData Central API key |
| `APPLE_OAUTH_ENABLED` | `true` to show Sign in with Apple when configured |
| `VITE_SENTRY_DSN` | Optional client DSN – enables Sentry in production builds |

### Firebase Web config

The web bundle reads Firebase credentials from `.env.local`. When keys are omitted, the runtime falls back to the production project values so local development still boots.

| Firebase console field | `.env` key |
| --- | --- |
| Web API Key | `VITE_FIREBASE_API_KEY` |
| Auth domain | `VITE_FIREBASE_AUTH_DOMAIN` |
| Project ID | `VITE_FIREBASE_PROJECT_ID` |
| Storage bucket (`<projectId>.appspot.com`) | `VITE_FIREBASE_STORAGE_BUCKET` |
| Messaging sender ID | `VITE_FIREBASE_MESSAGING_SENDER_ID` |
| App ID | `VITE_FIREBASE_APP_ID` |
| Measurement ID | `VITE_FIREBASE_MEASUREMENT_ID` |

> **Storage bucket note:** Firebase SDKs expect the bucket name (for example `mybodyscan-f3daf.appspot.com`). If a `firebasestorage.app` hostname is supplied, the app normalizes it to `${projectId}.appspot.com` before initializing.

### Firebase authorized domains

Add every host in `VITE_AUTH_ALLOWED_HOSTS` (plus `localhost`) to **Firebase Console → Auth → Settings → Authorized domains**. The web app logs a warning when the current `location.host` is missing so you can spot misconfigurations before attempting OAuth.

### Functions (Firebase environment / secrets)

| Key | Purpose |
| --- | --- |
| `HOST_BASE_URL` | Primary hosting origin used in transactional links |
| `USDA_FDC_API_KEY` | USDA API key (barcode/search) |
| `OPENAI_API_KEY` | Coach chat + nutrition fallback completions |
| `STRIPE_SECRET` & `STRIPE_WEBHOOK_SECRET` | Stripe payments (optional – functions fall back to 501 when absent) |
| `APP_CHECK_ALLOWED_ORIGINS` | Optional strict App Check allowlist |
| `APP_CHECK_ENFORCE_SOFT` | Defaults to `true` (soft enforcement) |
| `VITE_AUTH_ALLOWED_HOSTS` / `AUTH_ALLOWED_HOSTS` | Shared allowlist for web + CORS |
| `SENTRY_DSN` | Optional Sentry DSN for Cloud Functions |

> **Apple Sign-in:** configure the Apple provider in Firebase Auth, register redirect URLs in Apple Developer, and deploy the domain association file in `public/.well-known/apple-developer-domain-association.txt`.

> **Google Sign-in:** ensure the Firebase Auth domain and custom hosts from `VITE_AUTH_ALLOWED_HOSTS` appear in the authorized domain list.

## Enable Apple in Firebase Auth

1. In **Firebase Console → Auth → Sign-in method**, enable the Apple provider and paste the Service ID from Apple Developer.
2. In the Apple Developer portal, create a Service ID with return URLs for:
   - `https://mybodyscanapp.com/__/auth/handler`
   - `https://www.mybodyscanapp.com/__/auth/handler`
   - `https://mybodyscan-f3daf.web.app/__/auth/handler`
3. Generate a private key (Key ID + Team ID) and upload it to Firebase. Keep the `.p8` secret outside the repo.
4. Deploy `public/.well-known/apple-developer-domain-association.txt` so Apple verifies the custom domains.
5. Flip `APPLE_OAUTH_ENABLED=true` in `.env.local` (and hosting config) only after Firebase confirms the provider is fully configured—the button stays hidden otherwise.

## Developer tooling & scripts

| Script | Description |
| --- | --- |
| `npm run dev:web` | Vite development server (localhost:5173) |
| `npm run dev:emulators` | Firebase emulators (Auth, Firestore, Functions) with import/export |
| `npm run dev:e2e` | Build, launch `vite preview`, and execute the Playwright suite locally |
| `npm run seed:dev` | Idempotent provisioning of `developer@adlrlabs.com` with developer/tester claims |
| `npm run build` | Production build with Rollup manual chunks (firebase/auth split preserved) |
| `npm run build:all` | Builds web + functions bundles |
| `npm run lint` / `npm run typecheck` | ESLint + project TS builds |
| `npm run rules:verify` | Compiles Firestore & Storage security rules |

## Testing matrix

| Command | What it covers |
| --- | --- |
| `npm run test` | Vitest unit suite |
| `npm run emulators:test` | Integration tests that hit local HTTPS functions via the emulator (`tests/integration/*.int.test.ts`) |
| `npm run test:e2e` | Playwright end-to-end regression suite (auth, demo, calories, nutrition, barcode, workouts, coach chat, system health) |
| `npm run smoke` | CLI smoke probe for `/system/health` and a static landing page |

CI (`.github/workflows/ci.yml`) runs lint → typecheck → web/functions build → rules verification → unit + integration tests → Playwright against a preview server, uploading the HTML report on failure. A manual smoke workflow (`smoke.yml`) can verify deployed hosts after releases.

### End-to-end scenarios

Playwright specs live in `e2e/specs` and default to `https://mybodyscan-f3daf.web.app`. Override with `BASE_URL` when testing previews:

```bash
BASE_URL=http://127.0.0.1:4173 npm run test:e2e
```

Key flows include:

- `auth.demo.spec.ts` – demo onboarding without crashes and developer ∞ credits badge
- `auth.google.spec.ts` / `auth.apple.spec.ts` – popup stubs ensure the Today dashboard renders and profile menu shows the signed-in email
- `calories.spec.ts` – verifies the Today dashboard exposes a computed calorie target and persists edits across reloads
- `nutrition.search.spec.ts` – USDA vs OFF fallback behavior with normalized fields and empty states
- `barcode.spec.ts` – barcode lookup success, not-found, and rate-limit UX
- `workouts.spec.ts` – workout adjustments trigger backend updates and surface errors
- `coach.chat.spec.ts` – mocked coach reply populates the conversation and errors surface retry toasts
- `system.health.spec.ts` – `/system/health` returns `{ ok: true, appCheckSoft: true, ts }`

## Firebase emulators & integration tests

1. `npm run dev:emulators` to start Auth, Firestore, and Functions locally (App Check debug tokens auto-enable).
2. In another shell: `npm run emulators:test` to run the Vitest integration suite. Tests use the emulator’s `owner` token and automatically seed developer claims.
3. Integration specs cover nutrition search, barcode lookup, workout adjustments, scan sessions, and coach chat responses via HTTP functions.

## Observability & guardrails

- **Request logging:** every HTTPS function is wrapped in JSON logging middleware emitting `{fn, uid, path, method, status, durationMs, code}` (sampled at 50%). Tokens/PII are redacted.
- **Sentry:** the web app lazy-loads Sentry only when `VITE_SENTRY_DSN` is present, capturing React errors and unhandled rejections with release tags. Functions load `@sentry/node` when `SENTRY_DSN` is set.
- **App Check:** `AppCheckProvider` initializes App Check before using Auth, Firestore, Functions, or Storage. Missing keys fall back to debug tokens so demo flows never break.
- **Nutrition model:** USDA and OpenFoodFacts responses normalize into a single schema—UI never branches on the source.
- **Credits:** `CreditsBadge` shows `∞` for developer accounts seeded via `scripts/test-seed.ts`; server functions still enforce claims.

## Operational tooling

- `/ops` – developer-only console listing environment metadata, feature flags, USDA status, function health, and quick actions (seed demo, refresh claims, purge storage, ping `/system/health`).
- `/system/health` – static Hosting JSON `{ ok: true, appCheckSoft: true, ts: <iso> }` generated during `npm run build`.
- Structured logging + Sentry + Playwright reports provide full traceability during incidents.

## Sanity checklist (7 steps)

1. `npm run build` – verifies the Vite bundle and writes `dist/system/health.json`.
2. `npm --prefix functions run build` – ensures Cloud Functions compile with Node 20.
3. `npm run smoke` (or `curl https://<host>/system/health`) – expect `{ ok: true, appCheckSoft: true, ts: ... }`.
4. `npm run dev:web`, sign in as `developer@adlrlabs.com`, confirm the Credits badge renders `∞`.
5. Trigger Google sign-in (when configured) or confirm the browser console shows no `VITE_AUTH_ALLOWED_HOSTS` warnings.
6. Open `/ops` and confirm App Check status reads “soft” with a recent token timestamp.
7. `npm run test` (optionally `npm run emulators:test`) – quick regression of the unit/integration suites.

## Deployment checklist

1. Ensure all required secrets are set in Firebase (`firebase functions:secrets:set ...`).
2. Run the full verification pipeline locally:
   ```bash
   npm run build
   npm --prefix functions run build
   npm run test
   npm run emulators:test
   npm run test:e2e
   ```
3. Create a PR. CI must be green (lint, typecheck, builds, integration, Playwright) before merging.
4. Use Firebase Hosting previews or `npm run dev:e2e` for preflight verification.
5. Trigger deployment via your preferred workflow (`firebase deploy`, GitHub Actions, or Lovable tooling). Follow with `npm run smoke` or the `Smoke Test` workflow.

## Troubleshooting

- **App Check errors:** confirm `VITE_RECAPTCHA_KEY` is configured. In development the debug provider activates automatically; use `/ops` → “Call /system/health” to confirm backend acceptance.
- **CORS/auth issues:** update `VITE_AUTH_ALLOWED_HOSTS` (web) and `AUTH_ALLOWED_HOSTS` / `APP_CHECK_ALLOWED_ORIGINS` (functions). Both layers use the same source of truth.
- **Popup blockers:** Google/Apple sign-in relies on popups. Allow popups for the host or use a password flow for testing.
- **Nutrition fallbacks:** without USDA keys the UI automatically uses OpenFoodFacts (`primarySource: "OFF"`)—the Playwright suite asserts both code paths.

With the guardrails above, you can verify that authentication, demo mode, nutrition search/barcode, workouts, credits, and coach chat stay healthy across releases.

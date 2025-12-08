# Go-Live Runbook

This guide explains how to prepare configuration, secrets, and documentation so a non-technical deployer can ship MyBodyScan safely.

## 1. Environment + secrets

### Frontend (.env.production.local)
The Vite build reads `.env.production.local` at the repo root. Copy `.env.example`, populate the placeholders, and keep the file out of git.

| Key | Purpose |
| --- | --- |
| `VITE_FIREBASE_API_KEY` + companion Firebase keys | Web SDK config for Hosting (`authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`, `measurementId`). |
| `VITE_APPCHECK_SITE_KEY` (ReCaptcha v3) | Required for App Check; production keys must list `mybodyscanapp.com`, `www.mybodyscanapp.com`, and the Firebase Hosting domains as allowed origins. |
| `VITE_FUNCTIONS_URL` *or* `VITE_FUNCTIONS_ORIGIN` / `VITE_FUNCTIONS_BASE_URL` | Base URL for callable + REST Cloud Functions (workouts, nutrition, scans, system health). |
| `VITE_SCAN_START_URL`, `VITE_SCAN_SUBMIT_URL` (optional) | Overrides for dedicated scan capture endpoints when fronting Functions via another origin. |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Publishable key used by Stripe.js and Settings → Support. |
| `VITE_ENABLE_GOOGLE`, `VITE_ENABLE_APPLE`, `VITE_ENABLE_EMAIL`, `VITE_ENABLE_DEMO` | Feature flags for auth buttons; keep them `true` in production. |
| `VITE_HEALTH_CONNECT` | Set to `"true"` only when health connectors are ready to ship. |
| `VITE_COACH_RPM`, `VITE_PRICE_*` entries, etc. | Optional tuning knobs surfaced in Plans/Coach diagnostics; omit when defaults are acceptable. |

The build will fall back to baked-in Firebase config if the env file is missing, but Stripe, scans, and nutrition will show “Missing” badges in `/settings` and `/system/check`.

### Cloud Functions runtime configuration
`firebase.json` already pins `runtime: nodejs20`, `source: functions`, and default environment variables (`APPCHECK_MODE=soft`, auth provider flags, etc.). All sensitive values must flow through **Firebase Functions secrets**:

```bash
cd functions

# App + host
firebase functions:secrets:set HOST_BASE_URL --project mybodyscan-f3daf         # e.g. https://mybodyscanapp.com
firebase functions:secrets:set APP_CHECK_ALLOWED_ORIGINS --project mybodyscan-f3daf

# Third-party services
firebase functions:secrets:set OPENAI_API_KEY --project mybodyscan-f3daf
firebase functions:secrets:set USDA_FDC_API_KEY --project mybodyscan-f3daf
firebase functions:secrets:set STRIPE_SECRET --project mybodyscan-f3daf
firebase functions:secrets:set STRIPE_SECRET_KEY --project mybodyscan-f3daf
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET --project mybodyscan-f3daf

# Optional throttles / feature gates
firebase functions:secrets:set COACH_RPM --project mybodyscan-f3daf             # e.g. 10 requests/min
firebase functions:secrets:set NUTRITION_RPM --project mybodyscan-f3daf         # e.g. 30 requests/min
```

Guidance:
- Never paste real keys in docs or code. Use the CLI above (or Firebase Console → Build → Functions → Secrets) and store values in Secret Manager.
- Leave `APPCHECK_MODE=soft` until App Check hard enforcement is green for all clients. To harden, change the env var in `firebase.json` and redeploy Functions.
- `HOST_BASE_URL` controls Stripe redirect URLs; update it before switching domains.

### Rules parity
We ship the same Firestore logic in both `database.rules.json` (used by tests) and `firestore.rules` (used by deploys). Run `npm run rules:check` before go-live; it fails if the files diverge.

## 2. No-mock policy

- Scans, coach chat, and workouts will refuse to run without `OPENAI_API_KEY`. `/system/check` and `/settings` surface the missing-secret detail; `/api/scan/submit` returns `503 openai_not_configured`.
- Nutrition search requires either `USDA_FDC_API_KEY` or a `NUTRITION_RPM` override. Without them the UI shows “Meals search: Keys missing”.
- Stripe requires *both* the publishable key (Vite env) and the three backend secrets. Missing pieces disable checkout, customer portal, and webhooks.

## 3. Deploy

### Preferred (GitHub Actions)
Use `.github/workflows/firebase-deploy.yml`:
1. GitHub → **Actions → Firebase Deploy → Run workflow**.
2. Choose the branch to deploy (default `main`).
3. Click **Run workflow**. The workflow runs `npm run verify:local`, `npm --prefix functions run build`, then `firebase deploy --only hosting,functions --project mybodyscan-f3daf`.

### Fallback (CLI)

```bash
git checkout main
git pull --rebase origin main

npm install
npm run build
npm --prefix functions run build
npm run rules:check

npx firebase-tools deploy --only hosting,functions --project mybodyscan-f3daf
```

Hosting serves the contents of `dist`, and rewrites route `/api/*`, `/workouts/*`, `/system/*`, `/admin/*`, etc. to the deployed Functions.

## 4. Post-deploy checks

Perform these immediately after Hosting + Functions finish:

- `https://mybodyscanapp.com/` loads without console errors; Google/Apple buttons render.
- `/scan`, `/coach`, `/meals`, and `/workouts` all show their feature cards instead of “Missing URL” banners.
- `/settings` → Feature availability shows green for Firebase, scans, nutrition, workouts, Stripe, and health (if intentionally enabled). Missing pieces should include actionable text (e.g. “Add USDA_FDC_API_KEY secret”).
- `/system/check` and `/settings/system-check` display App Check = soft, OpenAI/Stripe = Configured, and show real API responses from `/api/system/health`.
- Trigger a scan in production; status transitions should reach `completed`, and credits decrement appropriately.
- Hit the customer portal from `/settings` → “Open billing portal”; expect Stripe to open with a valid session. Missing secrets should return `501 payments_disabled`.

## 5. Smoke tests

For automated coverage:

```bash
BASE_URL=https://mybodyscanapp.com npm run test:e2e
```

Run selectively after major UI or auth changes to catch regressions in scan, coach, nutrition, and settings flows.

# Deploying MyBodyScan

## Configuration to verify

1. **Frontend env (`.env.production.local`)**  
   Populate the same keys described in `docs/GO-LIVE.md` (`VITE_FIREBASE_*`, `VITE_APPCHECK_SITE_KEY`, `VITE_FUNCTIONS_URL`, `VITE_STRIPE_PUBLISHABLE_KEY`, etc.). Keep the file untracked.

2. **Rules parity**  
   Run `npm run rules:check`. It fails if `database.rules.json` and `firestore.rules` drift, which would otherwise break `firebase deploy`.

3. **Functions secrets**  
   All runtime secrets live in Firebase (project `mybodyscan-f3daf`). Run once per rotation:
   ```bash
   cd functions
   firebase functions:secrets:set HOST_BASE_URL --project mybodyscan-f3daf
   firebase functions:secrets:set APP_CHECK_ALLOWED_ORIGINS --project mybodyscan-f3daf
   firebase functions:secrets:set OPENAI_API_KEY --project mybodyscan-f3daf
   firebase functions:secrets:set USDA_FDC_API_KEY --project mybodyscan-f3daf
   firebase functions:secrets:set STRIPE_SECRET --project mybodyscan-f3daf
   firebase functions:secrets:set STRIPE_SECRET_KEY --project mybodyscan-f3daf
   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET --project mybodyscan-f3daf
   # optional throttles / feature gates
   firebase functions:secrets:set COACH_RPM --project mybodyscan-f3daf
   firebase functions:secrets:set NUTRITION_RPM --project mybodyscan-f3daf
   ```
   - `HOST_BASE_URL` should match the primary domain (e.g. `https://mybodyscanapp.com`).
   - `APP_CHECK_ALLOWED_ORIGINS` is a comma-delimited list of HTTPS origins permitted when App Check strict mode is enabled later.
   - Stripe requires **all three** secrets above; OpenAI scans/coaching and USDA nutrition rely on their respective keys.

## Build & deploy

The repo is wired for Node 18+/Bun, but production deploys should use the same steps as CI:

```bash
git checkout main
git pull --rebase origin main

npm ci
npm run build                      # outputs dist/ for Hosting
npm --prefix functions run ci-or-install
npm --prefix functions run build   # compiles Functions to lib/

npm run rules:check

npx firebase-tools deploy --only hosting,functions --project mybodyscan-f3daf
```

Notes:
- Hosting serves the `dist` directory and rewrites every SPA route plus `/api/*`, `/system/*`, `/workouts/*`, `/telemetry/log`, `/admin/*`, etc. to Cloud Functions.
- `firebase.json` already attaches the required predeploy scripts, so `firebase deploy` from CI will also run dependency install + build steps.

## Post-deploy checklist

1. **Headers + caching**
   - `curl -I https://mybodyscanapp.com` → `Cache-Control: no-store` on `index.html`.
   - `curl -I https://mybodyscanapp.com/assets/<bundle>.js` → `Cache-Control: public, max-age=31536000, immutable`.
2. **Runtime health**
   - Visit `/settings` → Feature availability and `/system/check`; expect all rows to read “Ready/Configured”. Missing rows should include actionable hints (“Add USDA_FDC_API_KEY secret”, etc.).
   - Trigger `/api/system/health` via the button in `/system/check`; expect HTTP 200 with OpenAI/Stripe/USDA flags = `true`.
3. **Critical flows**
   - Sign in, start a scan, and confirm status transitions `queued → processing → completed` and credits decrement.
   - Run a Meals search (“chicken”); expect USDA results. If not, confirm `USDA_FDC_API_KEY` secret is correct.
   - Open Coach chat; prompts should respond within policy limits. Missing OpenAI or `COACH_RPM` causes the UI to show “Configure OpenAI backend”.
   - From `/settings`, open the Stripe customer portal; it should redirect through `HOST_BASE_URL`.
4. **Demo mode sanity**
   - Browse `https://mybodyscanapp.com/welcome?demo=1`; ensure write actions remain blocked and diagnostics show “Demo ON”.

Document any failing step (include console/log snippets) before retrying the deploy. The runbook in `docs/GO-LIVE.md` should be updated whenever a new env key or secret is introduced.

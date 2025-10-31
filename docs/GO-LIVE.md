# Go-Live Runbook

This guide lets an operator ship production updates without touching a local terminal.

## 1. Configure secrets
Create or verify the following secrets in GitHub Actions or Firebase Functions. Keep only the names—never paste real values in documentation.

```
HOST_BASE_URL=https://mybodyscanapp.com
APP_CHECK_ALLOWED_ORIGINS=https://mybodyscanapp.com,https://www.mybodyscanapp.com,https://mybodyscan-f3daf.web.app,https://mybodyscan-f3daf.firebaseapp.com
APP_CHECK_ENFORCE_SOFT=true
OPENAI_API_KEY=*****
# Optional
STRIPE_SECRET=*****
```

## No-Mock Policy

- `OPENAI_API_KEY` must be set as a **Functions variable** via the Firebase Console or CLI before running any scans.
- If `OPENAI_API_KEY` is missing, `POST /api/scan/submit` returns HTTP `503` with `openai_not_configured` and no mock data is generated.
- Visit `/system/check` in production to verify OpenAI, Stripe, and App Check status before go-live.

## 2. Deploy
Preferred: trigger **Firebase Deploy** workflow in GitHub Actions (`.github/workflows/firebase-deploy.yml`).

1. Navigate to **Actions → Firebase Deploy → Run workflow**.
2. Ensure the desired branch is selected (default: `work`).
3. Press **Run workflow** for a one-click deploy.

Fallback: run `firebase deploy --only functions,hosting` via the Firebase CLI with the same secrets configured locally.

## 3. Post-deploy checks
Perform these immediately after the deployment finishes:

- Load `https://mybodyscanapp.com/` — login or home screen should render.
- Confirm Google and Apple authentication buttons are visible.
- Navigate to **Scan**, **Nutrition**, **Coach**, and **Settings** pages and watch the console for errors (should be clean).
- Visit `/system/check` to confirm OpenAI shows **Configured** and App Check mode is expected.
- Trigger a scan; if `OPENAI_API_KEY` is misconfigured the endpoint should return HTTP `503 openai_not_configured` by design.
- Call payments endpoints; when Stripe secrets are absent the API should respond with HTTP `501 Not Implemented`.

## 4. Smoke tests
For automated coverage, run the Playwright E2E suite locally when needed:

```bash
BASE_URL=https://mybodyscanapp.com npm run test:e2e
```

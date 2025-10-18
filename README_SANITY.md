# Sanity Runner (CI + optional preview)

This repo includes:
- `tools/sanity-check.mjs`: hits `/system/health`, `/`, and `/demo` (if present) on a target base URL and reports status.
- GitHub Action `Sanity Check`: builds web + functions, can deploy a Firebase Hosting preview channel, then runs the sanity script and comments results on the PR.

## Setup
- In GitHub → Settings → Secrets and variables → Actions:
  - `FIREBASE_TOKEN`: create via `firebase login:ci` (optional, only for preview deploy).
  - `FIREBASE_PROJECT`: set to `mybodyscan-f3daf`.
  - `SANITY_BASE_URL`: e.g. `mybodyscan-f3daf.web.app` or `www.mybodyscanapp.com`.
  - `SANITY_RUN_DEPLOY`: set to `true` if you want CI to deploy a preview channel.

## Run locally
npm ci --prefer-online --no-audit --no-fund
npm run build
npm --prefix functions run build
SANITY_BASE_URL=mybodyscan-f3daf.web.app node tools/sanity-check.mjs

## In CI
- Trigger **Actions → Sanity Check → Run workflow**. Toggle "Deploy a Firebase Hosting preview channel?" to true if you set secrets.

Notes:
- The script does not perform authenticated flows. It verifies site health without altering data.
- Auth, Google/Apple, credits, and Stripe flows should be verified with the existing manual 7-step checklist after deploy.
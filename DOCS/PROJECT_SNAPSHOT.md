# Project Snapshot

## What the app is

MyBodyScan is a Vite + React TypeScript SPA with Firebase backend (Auth, Firestore, Storage, Cloud Functions). It powers:
- Authentication (email/social) with App Check and demo mode
- Nutrition search and barcode lookup (USDA + OpenFoodFacts fallback)
- Meal logging with daily totals and history
- Workout plans, progress tracking, and adjustments
- AI Coach chat and weekly plan generation (OpenAI-backed when configured)
- Credit-based scan workflow (uploads, processing, refunds)
- Ops console (`/ops`) and `/system/health` probe for diagnostics

### Tech stack
- Frontend: React 18, Vite, TypeScript, React Router, React Query, Tailwind, Radix UI, shadcn/ui, Playwright, Vitest
- Backend: Firebase Hosting, Functions (Node 20, TypeScript), Firestore, Storage; Sentry for observability
- Tooling: ESLint, Prettier, Lighthouse CI, Capacitor config present for future native packaging

## What works now
- End-to-end auth flows with demo gating and claims
- Nutrition search + barcode, normalized schema across sources
- Meals logging and summaries; favorites/templates
- Workouts generation and progress updates
- Coach chat responses and plan refresh (OpenAI optional)
- Scan session lifecycle with credit checks, refunds on failures
- `/system/health` returns `{ ok: true, projectId, timestamp }`
- `/ops` developer console surfaces env, health, and quick actions
- CI-ready scripts and emulator-backed integration tests

## Known issues / risks
- Temporary scan uploads cleanup helper exists but is not invoked (possible storage bloat)
- Plans page lacks full subscriber awareness in filtering
- Unit preference persistence is pending (currently US units)
- Stripe endpoints return 501 when secrets absent (by design); payments disabled until configured
- Secret defaults exist in helpers pending production verification

## Environment variables

### Frontend (`.env.local`, `VITE_*`)
- `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MEASUREMENT_ID`
- `VITE_FUNCTIONS_BASE_URL` (custom domain for HTTPS endpoints)
- `VITE_RECAPTCHA_SITE_KEY` (App Check v3)
- `VITE_AUTH_ALLOWED_HOSTS` (comma-separated allowlist)
- `VITE_USDA_API_KEY` (optional)
- `VITE_APPLE_OAUTH_ENABLED` (optional)
- `VITE_SENTRY_DSN` (optional)

### Functions (Firebase secrets / runtime)
- `HOST_BASE_URL`
- `USDA_FDC_API_KEY`
- `OPENAI_API_KEY`
- `STRIPE_SECRET`, `STRIPE_WEBHOOK_SECRET`
- `APP_CHECK_ALLOWED_ORIGINS`, `APP_CHECK_ENFORCE_SOFT`
- `AUTH_ALLOWED_HOSTS` / `VITE_AUTH_ALLOWED_HOSTS`
- `SENTRY_DSN`

## Sanity checklist (7 steps)
1) Install & verify locally
```bash
npm ci
npm run verify:local   # build web + functions
npm run test           # unit
npm run emulators:test # integration (emulator)
```

2) Configure env
- Create `.env.local` with required `VITE_*` keys
- Set Firebase secrets:
```bash
firebase functions:secrets:set USDA_FDC_API_KEY
firebase functions:secrets:set OPENAI_API_KEY
firebase functions:secrets:set STRIPE_SECRET
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
```

3) Run dev stack
```bash
npm run dev:web
npm run dev:emulators
```
Visit `/ops` and `/system/check`.

4) Seed developer account
```bash
npm run seed:dev
```

5) E2E smoke and flows
```bash
npm run test:e2e
npm run smoke
```

6) Build for production
```bash
npm run build:prod
npm --prefix functions run build
```

7) Release verification (post-deploy)
- `https://<host>/build.txt` shows current commit tag
- `/system/health` returns ok
- Demo journey loads (no crashes), basic nutrition search works

## Deploy commands

Prefer separate deploys to control blast radius.

- Functions first:
```bash
npm run deploy:functions
```

- Then hosting:
```bash
npm run deploy:hosting
```

Alternatively, one-shot deploy with explicit project:
```bash
npx firebase-tools deploy --only functions,hosting --project mybodyscan-f3daf --force
```
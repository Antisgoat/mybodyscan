# App Store Release Guide

## Cloud Functions origin resolution (runtime)
The native/web client now derives Cloud Functions automatically in this order:

1. `VITE_FUNCTIONS_URL` (accepts full base URL)
2. `VITE_FUNCTIONS_ORIGIN` (or `VITE_FUNCTIONS_BASE_URL`)
3. Firebase fallback: `https://<region>-<projectId>.cloudfunctions.net`
   - `region` comes from `VITE_FUNCTIONS_REGION` (defaults to `us-central1`)
   - `projectId` comes from the loaded Firebase app config.

The app probes `${origin}/health` with a short timeout during startup.

## Required server-side secrets (Cloud Functions only)
Set secrets in Firebase Functions / Secret Manager (never in the client app):

- `OPENAI_API_KEY` (scan + workout AI)
- `USDA_FDC_API_KEY` (nutrition premium provider, optional)
- `STRIPE_SECRET`, `STRIPE_WEBHOOK_SECRET` (web billing only)
- Any additional scan/workout provider keys used by your deployment.

Nutrition search remains available without USDA by falling back to OpenFoodFacts.

## Deploy commands

```bash
firebase use <project-id>
firebase deploy --only functions
firebase deploy --only hosting
```

If needed, set/update secrets first:

```bash
firebase functions:secrets:set OPENAI_API_KEY
firebase functions:secrets:set USDA_FDC_API_KEY
firebase functions:secrets:set STRIPE_SECRET
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
```

## iOS release build

```bash
npm run build:native:release
npx cap sync ios
npx cap open ios
```

In Xcode:

1. Select **Any iOS Device (arm64)**
2. Product → Archive
3. Validate + Distribute to App Store Connect.

Release notes:
- Web Inspector is enabled in DEBUG only.
- Native builds hide web Stripe flows and route users away from web paywall/plans screens.

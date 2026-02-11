# App Store release runbook (iOS + Firebase Functions)

## 1) Deploy backend first

```bash
firebase deploy --only functions
```

Set required secrets in Firebase Secret Manager (all server-side; do **not** put secrets in the client bundle):

```bash
firebase functions:secrets:set REPLICATE_API_TOKEN
firebase functions:secrets:set LEANLENSE_API_KEY
firebase functions:secrets:set OPENAI_API_KEY
firebase functions:secrets:set USDA_API_KEY
firebase functions:secrets:set USDA_FDC_API_KEY
```

## 2) How Functions origin is resolved in the app

The app derives Cloud Functions origin in this order:

1. `VITE_FUNCTIONS_URL`
2. `VITE_FUNCTIONS_ORIGIN` (or `VITE_FUNCTIONS_BASE_URL`)
3. Derived default: `https://${VITE_FUNCTIONS_REGION || "us-central1"}-${firebaseProjectId}.cloudfunctions.net`

A health probe calls `GET {origin}/health` with a short timeout. Feature pages now report backend reachability instead of asking developers to set local env vars.

## 3) iOS-safe billing behavior

For native iOS builds, web Stripe checkout flows are disabled/hidden and routing stays coherent (no broken external Stripe.js flow in WKWebView).

## 4) Build iOS release artifacts

```bash
npm run build
npm run build:native:ios
npx cap sync ios
```

Then archive in Xcode:

1. Open `ios/App/App.xcworkspace`
2. Select `Any iOS Device (arm64)`
3. Product → Archive
4. Validate + distribute via App Store Connect

## 5) Smoke checks

Run the iOS smoke helper:

```bash
node scripts/ios-smoke.mjs
```

Optional authenticated checks:

```bash
IOS_SMOKE_ID_TOKEN="<firebase-id-token>" node scripts/ios-smoke.mjs
```

This script verifies:
- Derived functions origin
- `/health`
- `/nutrition/search` fallback path
- (with token) workouts generation
- (with token) scan endpoint returns either success or a provider-not-configured style error instead of a generic offline gate

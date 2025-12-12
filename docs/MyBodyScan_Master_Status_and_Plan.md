# MyBodyScan Master Status and Plan

## Product snapshot (non-technical)

- **What it does**: MyBodyScan lets members capture body photos, send them to our secure scanning service, and get composition estimates with history tracking. It also includes an AI coach chat, nutrition search/logging, workout plans, and subscription billing for premium access.
- **Core promise to users**: quick self-serve scans, guided coaching, and simple logging in one app. Health sync is explicitly marked as coming soon.

## Architecture in plain language

- **Frontend**: Vite + React single-page app. Authenticated areas are wrapped in `ProtectedRoute`, feature-level switches use `FeatureGate`, and data fetching is isolated with `DataBoundary`/`RouteBoundary` and React Query.
- **Backend**: Firebase Auth, Firestore, Storage, and Cloud Functions. Functions expose REST or callable handlers for scans, coach chat, nutrition, workouts, billing, account export/delete, and system health. Hosting serves the SPA and rewrites `/system/*`, `/workouts/*`, `/nutrition*`, and scan endpoints to Functions.
- **Security & safety**: App Check is initialized on the client and enforced server-side; Storage rules limit uploads to JPEGs; payments endpoints return 501 when Stripe keys are absent so the UI can degrade gracefully.

## Canonical user journeys

- **Auth & access**: `/auth` for sign-in. Logged-out visitors are redirected away from protected routes; logged-in users see `AuthedLayout` with navigation.
- **Scan flow (canonical)**: Home → **Scan** (`/scan`) → Start (`/scan/start`) → Capture (`/scan/capture`) → Processing (`/scan/result` or `/processing/:scanId`) → Results (`/scan/:scanId` or `/results/:scanId`) → History (`/scan/history` or `/history`). Uploads land in `user_uploads/{uid}/{scanId}`; final results persist under `users/{uid}/scans/{scanId}`.
- **Plans / billing**: `/plans` lists one-time and subscription plans. Non-subscribers see upgrade CTAs; active subscribers see “manage subscription.” Checkout uses the `createCheckout` callable; customer portal uses `createCustomerPortalSession`.
- **AI coach**: `/coach` → `/coach/chat` for threaded chat backed by the `coachChat` Function; `/coach/day` surfaces plan-of-day content.
- **Meals**: `/meals` hub → `/meals/search` for food lookup → log entries to `users/{uid}/nutritionLogs/{day}` and `entries` subcollections → `/meals/history` for history and trends. Barcode search lives at `/barcode`.
- **Workouts**: `/workouts` fetches/generates plans via Functions (`/generateWorkoutPlan`, `/getPlan`, `/markExerciseDone`). Progress is stored under `users/{uid}/workoutPlans/{planId}/progress/{iso}`.
- **Settings**: `/settings` for account/privacy; `/settings/units` persists unit preference on `users/{uid}.preferences.units`; `/settings/health` and `/health` clearly state health sync is coming soon.
- **Diagnostics**: `/system/check` reads the `system/health` endpoint and shows missing env/secrets; debug pages are behind auth or dev flags.

## High-level roadmap

- **V1 ready**: Core auth/routing, scan upload/result lifecycle, meals logging with USDA/OPEN FF proxies, AI coach chat + history pruning, workout plan generation/mark-complete, subscription checkout/portal (with graceful Stripe-off state), units preference persistence with metric-aware scan screens, and explicit health-sync gating.
- **Near-term (stabilization)**:
  - Deprecate legacy scan capture/processing routes in favor of the canonical `/scan/*` journey and wire automatic cleanup for temporary uploads.
  - Add automated coverage for logged-out redirects and disabled billing/nutrition states.
  - Expand workout streak/weekly stats visibility and add receipts/history surfacing once Stripe portal exposes it.
- **Coming soon / larger lifts**:
  - Real HealthKit/Health Connect connectors and Today dashboard backed by real data.
  - Rich coach/workout personalization and streaks with analytics parity.
  - Broader internationalization and unit conversions across all displays.

# MyBodyScan Gap Analysis

Feature-by-feature status, gaps, and priorities.

## Auth, routing, and guards
- **Status**: Auth routes (`/auth`, `/login`) are public; all app surfaces use `ProtectedRoute` + `FeatureGate` + `RouteBoundary`. App Check is initialized globally.
- **Gaps/Risks**: Need periodic verification that marketing flag routing (`ENABLE_PUBLIC_MARKETING_PAGE`) doesn’t bypass auth. Onboarding redirects rely on claims refresh timing.
- **Tasks**:
  - **P0**: DONE — bootstrap watcher now toasts on repeat failures.
  - **P1**: Add automated tests for logged-out redirects across `/scan`, `/meals`, `/workouts`, `/plans`.

## Body scans
- **Status**: Canonical flow lives at `/scan` with start → capture → result → history backed by Functions (`startScanSession`, `submitScan`, `beginPaidScan`). Firestore writes to `users/{uid}/scans/{scanId}` with credit tracking and OpenAI output.
- **Gaps/Risks**: Legacy capture routes remain; temporary Storage uploads are not auto-cleaned. Need stronger loading/error states when Functions URL/envs are missing.
- **Tasks**:
  - **P0**: DONE — capture/result pages block interaction with clear App Check/Functions messaging.
  - **P1**: Deprecate legacy capture/processing routes and reroute to the canonical `/scan/*` flow.
  - **P1**: Wire `deleteUploads` helper to purge `user_uploads/{uid}/{scanId}` after results are saved.
  - **P2**: Add analytics for scan failures by error code.

## Plans / Stripe billing
- **Status**: Plans page shows one-time and subscription products. Checkout uses `createCheckout` callable; portal uses `createCustomerPortalSession`. Missing price IDs and missing publishable keys now render friendly warnings and disable purchase buttons.
- **Gaps/Risks**: Firestore subscription status (`users/{uid}.subscription`) must stay in sync with Stripe webhooks. Past-due/canceled messaging is minimal.
- **Tasks**:
  - **P0**: DONE — plan cards and banners reflect active, past_due, and canceled with portal CTA.
  - **P1**: Add automated e2e for checkout disabled state when Stripe secrets are absent.
  - **P2**: Offer receipts/history download once Stripe customer portal URL is available.

## AI coach chat
- **Status**: `/coach` and `/coach/chat` are feature-gated and call the `coachChat` Function with App Check + auth. Replies persist under `users/{uid}/coachChat` with pruning after 10 docs.
- **Gaps/Risks**: Rate-limit and error states rely on toasts; no retry/backoff UX. Day view depends on coach plans that may be absent.
- **Tasks**:
  - **P0**: DONE — inline errors plus COACH_RPM gating and hydrate placeholders.
  - **P1**: Add loading placeholders for historical messages while snapshots hydrate.
  - **P2**: Add context from the active workout/nutrition plan into prompts when available.

## Meals / calorie tracking
- **Status**: Search and barcode lookup call nutrition Functions; logs write to `users/{uid}/nutritionLogs/{day}` with per-entry subcollections and aggregated totals. Demo mode blocks writes with explicit messaging.
- **Gaps/Risks**: If USDA/OpenFoodFacts keys are missing, search quietly returns empty; UI should flag “search unavailable.”
- **Tasks**:
  - **P0**: DONE — search/barcode disable with inline warning when keys missing.
  - **P1**: Add optimistic UI for entry edits with rollback on failure.
  - **P2**: Extend history charts for weekly/monthly rollups.

## Workouts
- **Status**: `/workouts` uses real Functions (`/getPlan`, `/generateWorkoutPlan`, `/markExerciseDone`) with App Check; progress stored in Firestore. Missing `VITE_FUNCTIONS_URL` now surfaces friendly messaging and blocks generation instead of throwing.
- **Gaps/Risks**: No streak badge UI; adjust endpoint lacks granular error display. Weekly completion falls back silently when data missing.
- **Tasks**:
  - **P0**: DONE — empty state clarifies missing env vs retry actions.
  - **P1**: Show streak/weekly stats even when today has no plan for visibility.
  - **P2**: Cache plan data locally to reduce cold-start latency.

## Health / Today
- **Status**: Health sync is intentionally disabled; `/health` and `/settings/health` display “coming soon” and throw friendly errors via `healthShim`.
- **Gaps/Risks**: Today dashboard still references health metrics; ensure it never pretends to sync data until connectors ship.
- **Tasks**:
  - **P0**: DONE — Today shows health unavailable banner until connectors ship.
  - **P1**: Plan permissions/consent flow for HealthKit/Health Connect before enabling connectors.
  - **P2**: Add background sync scheduling once native integrations exist.

## Units / settings
- **Status**: Unit preference stored on user doc (`preferences.units`) via `useUnits`; Settings UI lets users toggle US/metric.
- **Gaps/Risks**: Only select screens consume the unit hook; metrics may display without conversion.
- **Tasks**:
  - **P0**: DONE — scan refine/start/settings honor saved units for labels and conversions.
  - **P1**: Add conversion helpers for common measures (weight/height/waist).
  - **P2**: Persist last-updated timestamp for preferences to aid support/debugging.

## Environment / diagnostics
- **Status**: `/system/check` shows env health; functions return 501 for missing Stripe/OpenAI keys. Workouts now warn when `VITE_FUNCTIONS_URL` is absent; Plans warn when Stripe publishable key is missing.
- **Gaps/Risks**: Nutrition/search env gaps are silent; OpenAI key absence for scans/chat needs clear UI hooks.
- **Tasks**:
  - **P0**: DONE — feature availability panel summarizes env readiness.
  - **P1**: Emit console warnings in dev when `VITE_FUNCTIONS_URL`, nutrition keys, or OpenAI keys are empty.
  - **P2**: Add uptime pings for callable functions tied to alerts.

# Full Functional Pass – December 2025

This pass re-validated the core surfaces (auth/onboarding, scan, meals, workouts, coach) and tightened the units experience so user preferences propagate consistently. Summary per area with touched/inspected files plus manual QA guidance:

## Auth & Onboarding

- Reviewed `src/pages/Auth.tsx`, `src/lib/auth.ts`, `src/lib/auth/providers.ts`, `src/lib/authRedirect.ts`, `src/components/ProtectedRoute.tsx`, and `src/hooks/useOnboardingStatus.ts`.
- Confirmed email/password, Google, and Apple flows all funnel through Firebase Auth with redirect error handling and `handleAuthRedirectOnce()` so callbacks land on the intended route instead of looping back to `/auth`.
- Onboarding autosaves to `users/{uid}/meta/onboarding` with diff-safe payloads (`draft`, `step`, `completed`) and guards navigation via `PersonalizationGate`.
- **QA**: Sign in with each provider (email/pw, Google, Apple), verify first-time users are routed to `/onboarding` once, and subsequent reloads land on `/home` without flashes back to `/auth`.

## Scan Pipeline

- Touched `src/lib/api/scan.ts`, `src/pages/Scan.tsx`, `src/pages/Scan/Result.tsx`, `functions/src/scan/start.ts`, and `functions/src/scan/submit.ts`.
- Verified the Flow: start session → upload 4 poses with byte-accurate progress → OpenAI vision inference → Firestore doc transitions (`pending` → `processing` → `complete`/`error` with `completedAt`). Error paths now stamp `status: "error"` + `completedAt` so history never shows “pending forever”.
- **QA**: Capture 4 poses, watch upload progress hit 100%, ensure toast fires when analysis begins, and confirm `/scan/{id}` updates through pending → processing → final metrics. Force a failure (e.g., kill a photo upload) and confirm the doc shows `Failed to complete – Rescan` with error helper text.

## Meals / Nutrition

- Audited `functions/src/nutrition.ts`, `src/lib/nutritionBackend.ts`, `src/pages/Meals.tsx`, `src/pages/MealsSearch.tsx`, and barcode search. All write paths run through the callable (`/addMeal`, `/deleteMeal`) with `scrubUndefined` before Firestore transactions to avoid undefined-field rejects.
- Client refreshes daily log + history immediately after adds/deletes so rings update in-place; nutrition feature flags and system health banners prevent false success when backends are offline.
- **QA**: Search for a food, tap Add, verify toast + daily totals update. Delete the entry and confirm totals decrement. Toggle `systemHealth.nutritionConfigured=false` and ensure CTA buttons disable with banner messaging.

## Units (US ↔ Metric)

- **Files changed**: `src/lib/units.ts`, `src/lib/scanDisplay.ts`, `src/pages/Home.tsx`, `src/pages/Results.tsx`, `src/components/ScanResultCard.tsx`, `src/pages/History.tsx`, `src/pages/ScanCompare.tsx`.
- Added unit-aware formatting helpers so canonical metric data stays in kg/cm while displays honor the user’s `useUnits()` preference. Home cards, Results, History, Compare, and scan cards now convert weights/badges between lb/kg consistently, including deltas on Compare.
- **QA**: In Settings → Units, switch to Metric. Check Home summary, Results cards, History list, and Scan Compare all show `kg` labels and converted values. Flip back to US units and ensure everything returns to pounds without double conversions.

## Workouts & Programs

- Reviewed `functions/src/workouts.ts`, `src/lib/workouts.ts`, `src/pages/Programs/Detail.tsx`, and `src/pages/Workouts.tsx`.
- Confirmed catalog activation calls `/applyCatalogPlan` with App Check + auth, Workouts page listens for `?plan=...&started=1` to show “Activating…” state, retries hydration, then shows “Plan ready” toast and clears query params. Exercise checkboxes call `markExerciseDone` and update progress.
- **QA**: Start a catalog program, land on `/workouts?plan=...&started=1`, observe activation banner, verify plan loads within ~3 retries, toast appears, and query params disappear. Mark an exercise done and refresh to confirm persistence.

## AI Coach

- Verified gating in `functions/src/coachChat.ts` (App Check, rate limits, OpenAI key checks) and `src/pages/Coach/Chat.tsx` (`computeFeatureStatuses`, banners, demo fallbacks). Input disables when `openaiConfigured` or RPM secrets are missing, surfacing actionable messaging instead of silent failures.
- **QA**: With OpenAI configured, send a prompt and confirm Firestore transcript + UI updates. Remove the secret (or set system health flag) and ensure the textarea disables with “Coach chat requires the OpenAI key…” banner.

## System Health & Buttons

- Spot-checked navigation CTAs (Home, Scan, Meals, Workouts, Programs, Coach, Settings) to ensure every primary button routes somewhere meaningful, shows loading where appropriate, and uses toast alerts for errors instead of console-only logs.

## Builds / Tooling

- Root + functions dependencies reinstalled (`npm install`, `npm --prefix functions install`).
- Fixed functions TypeScript config (`functions/tsconfig.json`) so Node types resolve without requiring `allowImportingTsExtensions`.
- Verified builds: `npm --prefix functions run build`, `npm run build`.

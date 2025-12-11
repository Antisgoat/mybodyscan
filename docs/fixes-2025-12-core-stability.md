# Core stability fixes – December 2025

## React boot crash (Minified React error #185)
- **Root cause:** `subscribeDemo` invoked every subscriber immediately, which violates the expectations of `useSyncExternalStore`. Each mount of `DemoModeProvider` triggered a synchronous update loop that React surfaces as error #185 (“Maximum update depth exceeded”).
- **Fix:** Stop the eager callback in `subscribeDemo` and document the reasoning so the helper is not “optimized” back to the bad pattern.
- **Verification:** Load `/auth` and `/home` with demo mode toggled on/off. Confirm that the crash banner no longer appears and that telemetry logs only the original error (if any) rather than React’s depth error.

## Auth + routing sanity
- **Files touched/reviewed:** `src/pages/Auth.tsx`, `src/components/ProtectedRoute.tsx`, `src/hooks/useAuthBootstrap.ts`, `src/lib/auth.ts`, `src/lib/authRedirect.ts`.
- Email/password and both OAuth providers run through Firebase’s SDK helpers, bubble friendly errors, and redirect via `defaultTarget` or `next` query parameters. Protected routes gate on `authReady` to avoid loops, and demo mode only bypasses auth on the explicit allowlist.
- Claims refresh and onboarding bootstrap (`useAuthBootstrap`, `refreshClaimsAndAdminBoost`) are idempotent per UID and emit toasts only on repeated failure.

## Scan capture → analysis → history
- **Client state:** `src/pages/Scan/scanCaptureStore.ts` persists weights, session IDs, and file handles across the Start → Capture → Review screens. Reset paths clear stale uploads while preserving weights when requested.
- **Backend:** `functions/src/scan/start.ts` initializes the scan doc with `status: "pending"` and storage paths. `functions/src/scan/submit.ts` now confidently transitions through `processing → complete|error`, clamps body-fat/BMI outputs, and always stamps `completedAt` even for failures. Helper `scanStatusLabel` drives consistent badges on Home/History/Results.
- **UI checks:** Pages `ScanFlowPage`, `History`, and `Results` all block metrics display until `statusMeta.showMetrics` is true. Failed scans surface `errorMessage` plus a “Try Again” CTA rather than lingering in `pending`.

## Nutrition logging
- **Scrubbing:** `functions/src/nutrition.ts` and `functions/src/nutritionSearch.ts` sanitize payloads with `scrubUndefined` before writing to Firestore (fixing the historic `originalUnit === undefined` crashes).
- **Search input:** `sanitizeSearchQuery` now coalesces control characters via a `String.raw`-backed pattern to satisfy eslint’s safety rules without losing coverage.
- **Client paths:** `/meals`, `/meals/search`, and the barcode page only write via the callable endpoints, so totals updates stay transactional and multi-device safe.

## Workouts, Programs, and Coach
- **Functions reviewed:** `functions/src/workouts.ts` (generate/apply plan pipeline), `functions/src/coachChat.ts`, `functions/src/coachPlan.ts`.
- **Client checks:** `/programs` routes call `applyCatalogPlan` and then rely on `/workouts?plan=...&started=1` query processing already in `Workouts.tsx` (`activatePlanFromQuery`). Pages gate on feature flags so catalog/program interactions never reach unauthenticated users.
- **AI robustness:** Both coach chat and workout adjustment wrap OpenAI errors in friendly toasts and respect credits through `grantUnlimitedCredits`/`refreshClaims`.

## Manual QA to run on a full environment
1. **Auth:** Email, Google, and Apple sign-in/out from `/auth`, verifying redirects land on `/home` and `/onboarding` as expected.
2. **Scan:** Start a scan, upload 4 photos, observe progress >0%, wait for completion, then delete from History. Force an error (missing photo) to confirm the status becomes “Failed” with a rescan button.
3. **Nutrition:** Add meals via search + barcode + manual entry; ensure daily totals refresh and no Firestore errors about undefined values. Toggle unit preferences in `/settings/units` and re-add an item.
4. **Workouts/Programs:** Start a catalog plan, observe the activation toast on `/workouts`, and mark an exercise complete to ensure persistence.
5. **Coach:** Send a chat prompt and request a workout adjustment, confirming success or friendly retry messaging.

## Automated checks
- `npm run lint`
- `npm run build`
- `npm --prefix functions run build`

Add any new issues you uncover to this document so we keep the stability trail fresh.

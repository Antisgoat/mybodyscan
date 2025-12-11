# Final review – 2025-12-11

## Summary
- **Auth / Onboarding** – Replaced the legacy anonymous auth hook inside `OnboardingMBS`, added Firestore-safe scrubbing for all writes, and redirect users with completed onboarding straight into the app so they cannot get stuck on the legacy page. Removed the unused `useAuthUserMBS`, `ProtectedRouteMBS`, and `mbs.routes` helpers to avoid future divergence.
- **Scan** – Reviewed `startScanSession`, `submitScan`, client upload progress, and delete APIs. All status transitions already map to the canonical `pending → processing → complete/error` flow, and UI helpers (`scanStatusLabel`) align with those states. No code changes required.
- **Meals / Nutrition** – Audited Cloud Functions (`addMeal`, `deleteMeal`, history/log readers) plus UI entry points (search, barcode, dashboard). All client paths use the callable endpoints and scrub macros via `computeCalories`, so no corrective code changes were needed.
- **Workouts / Programs** – Verified catalog activation flow (`applyCatalogPlan`) and the `/workouts` page retry/activation UX. Existing logic already retries pending plans, surfaces health gate errors, and clears query params once the plan becomes active.
- **Coach / AI flows** – Checked OpenAI gateways for scans, workout adjustments, coach chat, and nutrition plans. Each path reads keys from backend env/secret storage and already wraps failures with user-friendly fallback toasts; no further edits made.
- **Settings / Units** – Confirmed `useUnits` listens to `users/{uid}` preferences and that scan start, meals, and onboarding forms respect the helper conversions everywhere. No changes were necessary.

## Manual QA checklist
1. **Auth + Onboarding**
   - Sign up via email/Google, complete the modern onboarding wizard, and reload to confirm you land on `/home`.
   - Visit `/onboarding-mbs` after finishing onboarding to confirm it immediately redirects to `/home`.
2. **Scan pipeline**
   - Start a scan with valid weights, upload all four photos, watch progress climb from >0% to 100%, and see the processing/result screen resolve.
   - Trigger an error (e.g., delete one photo before submit) and confirm the UI shows “Failed to complete” with the rescan affordance.
   - Delete a completed scan from History and verify the entry disappears and storage objects are gone.
3. **Meals / Nutrition**
   - Add a meal via search, barcode, and manual entry; verify daily totals and 7-day charts update instantly without console errors.
   - Delete a meal and confirm the totals recalc.
4. **Workouts / Programs**
   - Start a catalog program, wait on `/workouts?plan=…&started=1`, observe the “Activating…” banner, and confirm the plan auto-loads with a toast and clears the query params.
   - Mark an exercise complete and refresh to ensure the completion state persists.
5. **Coach / AI**
   - Run a coach chat prompt plus a body-feel adjustment; verify loading states show and errors surface friendly toasts if OpenAI is unreachable.
6. **Settings / Units**
   - Switch between US and metric units in Settings, then open Scan Start and Meals entry screens to confirm inputs/labels reflect the new unit system.

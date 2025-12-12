# Fixes – Scan, Meals, Workouts (2025-12-10)

## Scan pipeline

- `submitScan` now parses payload and locates the Firestore doc before checking OpenAI availability so every failure path updates the same canonical scan document with `status`, `completedAt`, and `errorMessage`.
- The Home "Last scan" card reads a small window of recent scans, prefers the most recent completed scan, and surfaces banners for failed or stale attempts. A lightweight heartbeat re-runs the status helper so stale scans flip to "Failed" without a manual refresh.

## Meals search / add

- The embedded `NutritionSearch` component already routes every "Add" action through the `addMeal` Cloud Function, refreshes todays log & 7-day history, and surfaces toasts for both success and failure. Verified the flow end-to-end and documented that the existing implementation matches the desired behavior.

## Workouts & programs

- Added App Check enforcement on all workout-related HTTPS functions (`generateWorkoutPlan`, `applyCatalogPlan`, `getPlan`, `getWorkouts`, `markExerciseDone`).
- The client workout API wrapper now attaches App Check tokens so catalog-program starts and plan fetches continue to work after the stricter backend validation.
- Program start still mirrors the catalog metadata into the coach profile and redirects to `/workouts?started=1`, so the Workouts tab immediately reflects the active plan.

## Firestore rules & security

- Tightened `users/{uid}/nutritionLogs/{day}` writes so clients can only touch per-day macro summaries (`calories`, `protein_g`, `carbs_g`, `fat_g`, `updatedAt`) with bounded numeric ranges. Server-owned fields like `meals`/`totals` continue to be populated via Cloud Functions.
- Left existing onboarding meta validation intact and re-verified that other sensitive subcollections (scans, workout plans, coach logs) remain owner-only.

## Manual QA

1. **Scan flow:** start a scan, upload, and complete it; confirm the Home card switches from "Processing" to "Complete" without reloading. Repeat with a forced failure (e.g., break OpenAI); Home should show the error banner and History should list the errored scan.
2. **Meals:** from Home Meals search, add a food. The daily progress ring and 7-day chart should update immediately. Verify delete + error toasts still behave.
3. **Workouts:** start any catalog program and ensure you land on `/workouts?started=1` with the new plan visible. Toggle a few exercises to confirm progress persists. If App Check is disabled the requests should now fail fast.

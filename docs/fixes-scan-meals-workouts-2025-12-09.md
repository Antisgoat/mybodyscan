## Summary
- Hardened scan lifecycle: back-end now writes canonical `pending → processing → complete/error` states with `completedAt` timestamps, client surfaces stale/failed scans with rescan CTAs, and we clean up abandoned uploads plus use the correct `/scans/:id` results route.
- Meal search/log flows now call the unified `addMeal` Cloud Function so logging immediately updates today's totals on Meals & Nutrition pages, with the Nutrition page re-fetching daily data after each add.
- Program start now routes users straight into Workouts, which re-hydrates when coming from the catalog and surfaces a confirmation toast; legacy pending/completed statuses were normalized throughout Processing/Results views.

## QA
1. **Scan lifecycle**
   - Start a scan, finish uploads, and verify Firestore `users/{uid}/scans/{scanId}` moves `pending → processing → complete` with `completedAt`.
   - Kill the tab during upload; confirm the pending doc is deleted (or marked error) and no stuck “pending” entry shows in History/Home.
   - Open `/scans/{scanId}` mid-processing and after completion to confirm the new status badges/toasts render plus the History card mirrors the final state and offers “Rescan” on failures.
2. **Meals daily log**
   - From `/meals` search for a food, tap **Add**, and confirm the Daily Progress donut + 7-day chart update immediately.
   - From `/meals/search` add an item; verify Firestore `nutritionLogs/{today}` gains the entry via Cloud Function (no direct writes) and the Nutrition tab shows the new totals without manual refresh.
3. **Workout programs**
   - From `/programs/:id` click **Start program**; expect a success toast and automatic navigation to `/workouts` with the new plan loaded.
   - Reload `/workouts` and ensure the active plan persists plus the “Plan ready” toast appears only once (URL params cleared).

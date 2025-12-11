# React error #185 fix & core flow verification

## Crash recap
- **Symptom:** Every load hit the global error boundary with "Minified React error #185" (maximum update depth exceeded) on both `/` and `/home`.
- **Root cause:** `useAuthUser`'s `getAuthSnapshot()` always returned a brand-new object, so every `onAuthStateChanged` notification convinced React that the store kept mutating during the commit phase. React responded by re-rendering indefinitely until it tripped the depth guard.
- **Fix:** The auth store now caches `{ user, authReady }` and only returns a new object when either value truly changes. The global error boundary was also updated to log both the normalized error (message + stack) and the component stack so production crashes are diagnosable instead of silent. Demo-mode listeners already coalesce nested updates, so no additional synchronous notifications fire while React is mounting.

## Code highlights
- **Auth & routing:** `useAuthUser` exposes stable snapshots, ProtectedRoute waits on `authReady`, and `useAuthBootstrap` keeps demo mode disabled once a real user signs in.
- **Scan:** `startScanSession` + `submitScan` transition docs through `pending → processing → complete|error`, cleanup failures trigger `deleteScan`, and the UI shows progress using real `File.size` values so bars never stall at 0%. `scanStatusLabel` is shared by Home, History, and Scan pages for consistent badges + “Rescan” CTAs.
- **Nutrition:** All callable writes (`addMeal`, `deleteMeal`) sanitize payloads via `scrubUndefined`, search/barcode routes only hit the backend, and Meals/Nutrition pages refresh daily totals immediately without poking Firestore directly.
- **Workouts & coach:** Applying a catalog/AI plan writes `workoutPlans/{planId}` plus `workoutPlans_meta.activePlanId`, the Workouts screen watches for `?plan=...&started=1` and clears it once the plan loads, and AI coach chat catches OpenAI failures before they reach the global boundary.
- **Error boundary:** Production logs now show the full error + component stack any time the boundary trips, making future regressions far easier to diagnose.

## Manual QA checklist
1. Load `/` while signed out → landing/auth routes render, no error boundary.
2. Complete email login, hit `/home`, then navigate across Scan, Meals, Workouts, Programs, Coach, and History → no crash, auth state persists.
3. Start a scan with four test photos → upload progress advances >0%, status flips to “Processing…”, and History/Home show badges (Failed scans expose “Rescan” button).
4. Add a meal via search and confirm Today / Meals dashboards update calories + macros immediately.
5. Start a catalog plan → Workouts page shows “Activating…” state, then “Plan ready” toast once the plan loads.
6. Send an AI coach prompt → success response or friendly retry toast; no boundary errors.

## Verification
- `npm run build`
- `npm --prefix functions run build`

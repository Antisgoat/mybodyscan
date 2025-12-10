# Scan, Meals, Workouts Hardening – Dec 2025

## Summary of changes
- **Meals / Nutrition:** Added a reusable `scrubUndefined` helper (`functions/src/lib/scrub.ts`) and applied it to every nutrition log write so nested payloads never include Firestore-invalid `undefined` values. Added targeted unit tests to cover items missing `originalUnit` metadata and verify that complete payloads remain untouched. Every UI entry point already uses the `addMeal` Cloud Function and now immediately refreshes daily totals so the progress ring updates as soon as the function resolves.
- **Scan uploads:** Client progress reporting now tracks total uploaded bytes (instead of file counts) so the progress bar advances from 0% immediately. Capture flow retries surface better toasts, guarantee the App Check requirement is enforced, and clean up orphaned scan documents by calling `deleteScanApi` whenever uploads fail before the backend receives data. Errors reset the local session without dropping the selected photos so users can retry instantly.
- **Workouts / programs:** Catalog program activation already uses the `applyCatalogPlan` function; the Workouts page now treats `?plan=...&started=1` as a short-lived activation state. It retries fetching the new plan for a few seconds before showing an error and displays a neutral "Activating your new program…" status instead of a destructive alert, preventing the race where a freshly-started plan showed "No workout plan yet." The page continues to show the one-time "Plan ready" toast and clears the query parameters once steady.

## Helpers & tests
- New helper: `functions/src/lib/scrub.ts` (imported as `scrubUndefined`) is safe for nested arrays/objects and leaves `Timestamp`/sentinel values untouched.
- New tests: `functions/test/nutrition.test.ts` ensures the helper strips undefined nutrition metadata and keeps valid payloads unchanged.

## Firestore indexes / config
- No new indexes or Firebase config changes are required for these fixes.

## QA checklist
1. **Meals logging**
   - From Today’s Meals, log a search result that lacks an original serving unit. Verify the log saves, no console errors appear, and the daily ring updates immediately.
   - Log foods via the barcode modal and the standalone Food Search page; confirm each call succeeds (or errors with toasts) and that today’s totals refresh without reloading the page.
2. **Scan capture**
   - Start a scan session with four poses and observe the progress bar—the “Uploading … 0% complete” message should begin climbing within the first second.
   - Force an upload failure (e.g., disable network before the second photo). You should see a destructive toast, the state should reset to “Finalize with AI,” the photos should remain selected, and no orphaned pending scan appears in history.
   - Complete a full upload and verify navigation to the scan detail page plus the history/status chips reflect the correct state.
3. **Workout program activation**
   - From a catalog detail page, press “Start program.” After the success toast you should land on `/workouts?plan=…&started=1`, see the one-time “Plan ready” toast, and the workouts list should populate without showing the “No workout plan yet” error.
   - Repeat while throttling the network: the Workouts page should show “Activating your new program…” instead of an error until the plan appears.
4. **System health flags**
   - Toggle nutrition/scan/workout system health flags off via Firestore or the admin panel and confirm each UI surfaces the existing offline alerts and blocks actions as before.

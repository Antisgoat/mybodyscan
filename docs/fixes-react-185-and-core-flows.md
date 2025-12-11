# React error #185 fix & core flow verification

## Crash recap
- **Symptom:** Every load hit the global error boundary with "Minified React error #185" (maximum update depth exceeded) on both `/` and `/home`.
- **Root cause:** The demo mode store (`src/state/demo.ts`) would re-notify subscribers while React was still mounting. Earlier the store also re-fired listeners immediately upon subscribe, which is unsupported by `useSyncExternalStore` and recreates the same error.
- **Fix:** Demo updates now coalesce via `notifyListeners` so nested `setDemo` calls cannot re-enter the notification loop, and we added regression tests (`src/state/demo.test.ts`) that guarantee subscribers are not pinged synchronously when mounting. Together this prevents `useSyncExternalStore` from spamming rerenders and keeps the `AppErrorBoundary` reserved for unexpected issues only.

## Flow spot-checks
- **Auth:** `ProtectedRoute`, `useAuthBootstrap`, and `useAuthUser` all gate on `authReady` before touching `user.uid`, remember the intended redirect (`rememberAuthRedirect`), and surface friendly copy for demo visitors.
- **Scan:** `functions/src/scan/start.ts` + `submit.ts` emit `pending → processing → complete|error`, `scanCaptureStore` persists weights/files between steps, and `history`/`home` components only render metrics when `statusMeta.showMetrics` is true.
- **Nutrition:** All meal writes funnel through `functions/src/nutrition.ts`, which sanitizes serving + nutrient payloads with `scrubUndefined` before committing so no `undefined` values reach Firestore. Client pages (`/meals`, `/meals/search`, `/barcode`) rely on those callables, keeping totals transactional.
- **Workouts & programs:** `/programs` still calls `applyCatalogPlan` and redirects to `/workouts?plan=...&started=1`; `src/pages/Workouts.tsx` retries `getPlan()` three times, clears the activation query params, and gracefully handles backend outages.
- **Coach:** Chat + adjustments wrap `callWithHttpFallback`, fail closed for missing user credits, and toast friendly retry messaging so exceptions never bubble to the global boundary.

## Verification
- `npm run test -- src/state/demo.test.ts`
- `npm run build`
- `npm --prefix functions run build`

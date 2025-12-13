## Production runtime fixes (v1)

### Meals crash: `TypeError: undefined is not an object (evaluating 'r.kcal')`

- **Repro (prod symptom)**: Open `/meals` and/or open a serving selector modal; route boundary catches a render crash and Meals fails to load.
- **Root cause**: A render-path macro calculation assumed `basePer100g` (aka the “macro row/result” object behind `r`) was always an object and directly dereferenced `.kcal`.
- **Exact code path**:
  - `ServingChooser` calls `calcMacrosFromGrams(food.basePer100g, grams)` and renders `macros.kcal`.
  - `calcMacrosFromGrams` previously did `base.kcal` without guarding `base`.
- **Fix**:
  - Hardened `calcMacrosFromGrams` to accept `null/undefined` base and always return numeric macros (defaults to `0`).
- **Regression tests added**:
  - `src/lib/nutrition/measureMap.test.ts`: `calcMacrosFromGrams(undefined, …)` must not throw and returns numeric zeros.

### Coach gating: “setup incomplete … disabled until COACH_RPM is configured”

- **Repro (prod symptom)**: Coach tab shows “setup incomplete” and disables chat even when OpenAI is configured.
- **Root cause**: UI readiness was treated as “false” when system health was unknown/unavailable, causing an overly strict hard-disable (even though COACH_RPM is only an optional tuning flag).
- **Exact code path**:
  - `computeFeatureStatuses()` computed `coachConfigured` as `Boolean(openaiConfigured)`; when health wasn’t available, `openaiConfigured` became `undefined` → `false`.
  - `Coach/Chat.tsx` disables input when `coachAvailable` is false.
- **Fix**:
  - `computeFeatureStatuses()` now treats “unknown health” as “optimistically enabled when Functions look reachable”, while still respecting explicit `coachConfigured === false` from the server.
- **Regression tests**:
  - Existing: `src/lib/envStatus.test.ts` asserts Coach is not gated on `COACH_RPM`.

### Timestamp crash: `TypeError: undefined is not an object (evaluating 'x.updatedAt')`

- **Repro (prod symptom)**: Navigating to a scan result screen can crash when a timestamp is missing.
- **Root cause**: A render path used `.toLocaleString()` on a timestamp without normalizing/guarding.
- **Exact code path**:
  - `src/pages/ScanResult.tsx` rendered `scan.updatedAt.toLocaleString()` directly.
- **Fix**:
  - Added timestamp normalization helper `src/lib/time.ts` and updated `ScanResult.tsx` to use `formatDateTime(...)` (safe “—” fallback).
- **Regression tests added**:
  - `src/lib/time.test.ts`: `formatDateTime(undefined/null)` returns `"—"`.

### Telemetry 400s: `/telemetry/log` returning 400 in console

- **Repro (prod symptom)**: Console shows `telemetry/log` requests failing with HTTP 400.
- **Root cause**: Hosting rewrote `/telemetry/log` to a **callable** function export, but the client uses `fetch` with a plain JSON body (not the callable envelope). This mismatch yields 400s and console noise.
- **Exact code path**:
  - Client: `src/lib/telemetry.ts` does `fetch("/telemetry/log")`.
  - Server: `functions/src/index.ts` exported `telemetryLog` from `functions/src/system/telemetryLog.ts` (callable).
- **Fix**:
  - Rewired the Cloud Functions export so `telemetryLog` points to the existing HTTP handler (`functions/src/http/telemetry.ts`) which accepts the client payload.
  - Hardened client telemetry payload building to strip `undefined` (stable JSON) and keep telemetry failures non-fatal.
  - Added CORS allow-header for `X-Firebase-AppCheck` because the client may attach it.
- **Regression tests added**:
  - `src/lib/telemetry.test.ts`: telemetry body sanitizer drops nested `undefined`.

### Scan upload reliability (iOS Safari “0% / stuck”)

- **Fixes already in place + verified by unit tests**:
  - Upload flow has a stall watchdog (cancels + returns `upload_stalled`) and supports AbortSignal cancellation.
  - Inputs validation rejects zero-byte photos up front (prevents “0% forever” when file objects are unreadable).
- **Regression tests added**:
  - `src/lib/api/scan.test.ts`: pure stall detection helper distinguishes `no_progress` vs `stalled`, and validates zero-byte rejection.

### QA notes (quick)

- **Meals**: Open `/meals`, open a serving chooser/editor with incomplete nutrition data; page should render and show `0`/`—` instead of crashing.
- **Coach**: Open `/coach/chat` when backend is reachable; chat UI should not hard-disable purely due to missing COACH_RPM.
- **Telemetry**: Trigger an error (e.g. offline devtools) and confirm no `/telemetry/log` 400 spam.
- **Scan**: On iOS Safari, start a scan upload; if progress never advances, after ~60s the upload should fail with a retryable error (and not remain pending forever).


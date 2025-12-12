## Production stability fixes (2025-12-12)

### Meals route crash: `TypeError: undefined is not an object (evaluating 'r.kcal')`
- **Repro (prod-like)**:
  - Open the app and navigate to `/meals`.
  - If localStorage contains older/partial nutrition items (or Firestore favorites/templates include older shapes), the Meals route can crash during render.
- **Root cause**:
  - Some persisted nutrition items (notably `mbs_nutrition_recents_v3` in localStorage) can be missing required nested macro objects (`basePer100g`, `per_serving`) expected by Meals/Serving flows.
  - In production-minified stacks this frequently surfaces as `r.kcal` where `r` is an assumed macro object.
- **Exact code path**:
  - LocalStorage recents are loaded in `src/pages/Meals.tsx` and `src/pages/MealsSearch.tsx` via `readRecents()`.
  - Persisted items are consumed downstream by meals/nutrition UI which assumes a fully-populated rich `FoodItem` shape.
- **Fix**:
  - Added `normalizeRichFoodItem()` (`src/lib/nutrition/toFoodItem.ts`) and applied it when reading recents from localStorage.
  - Added canonical numeric macro accessor helpers (`src/lib/nutrition/numbers.ts`) and a regression unit test.
- **Regression test**:
  - `src/lib/nutrition/toFoodItem.test.ts` ensures missing macros do not throw and macro accessors always return numbers.

### Coach gating: "Coach setup incomplete… disabled until COACH_RPM is configured"
- **Repro**:
  - Navigate to `/coach/chat` when OpenAI is configured but COACH_RPM is missing.
- **Root cause**:
  - COACH_RPM is an optional tuning knob and must not be treated as a hard prerequisite in the UI.
- **Status**:
  - Current UI gating derives from `src/lib/envStatus.ts` and `src/pages/Coach/Chat.tsx` and is based on OpenAI readiness (`openaiConfigured/openaiKeyPresent`), not COACH_RPM.
  - Unit coverage exists in `src/lib/envStatus.test.ts` ensuring coach is not gated on `coachRpmPresent`.

### Timestamp crash: `TypeError: undefined is not an object (evaluating 'x.updatedAt')`
- **Repro**:
  - Navigate to a scan result page with missing/malformed timestamps.
- **Root cause**:
  - Direct formatting of timestamps without guarding against null/undefined/non-Date values.
- **Exact code path**:
  - `src/pages/ScanResult.tsx` previously formatted `scan.updatedAt` directly.
- **Fix**:
  - Added `formatTimestamp()` helper (`src/lib/time.ts`) and used it in `src/pages/ScanResult.tsx`.
- **Regression test**:
  - `src/lib/time.test.ts` validates null/undefined handling.

### Telemetry: `/telemetry/log` returning 400
- **Repro**:
  - Load app; client-side telemetry uses `fetch('/telemetry/log')`.
  - Observe 400 responses and console spam.
- **Root cause**:
  - Hosting rewrite routes `/telemetry/log` to Cloud Function `telemetryLog`, but the handler was implemented as a Firebase Callable (expects body `{ data: ... }`).
- **Exact code path**:
  - Client: `src/lib/telemetry.ts` posts to `/telemetry/log`.
  - Server: `functions/src/system/telemetryLog.ts` (function id `telemetryLog`).
- **Fix**:
  - Updated `telemetryLog` handler to an `onRequest` HTTP function that accepts both:
    - callable protocol payloads (`{ data: {...} }`)
    - plain JSON fetch payloads (`{ kind, message, ... }`)
  - The handler always returns 200 (telemetry is best-effort) and no longer emits 400s.
  - Added client-side sanitizer `sanitizeTelemetryBody()` to strip `undefined` values.
- **Regression test**:
  - `src/lib/telemetry.test.ts` ensures sanitizer removes undefined values.

### Scan upload reliability (iOS Safari): "stuck at 0% / pending forever"
- **Repro (iOS Safari)**:
  - Start a scan, capture photos, tap finalize.
  - Observe upload progress staying at 0% with no completion.
- **Root cause**:
  - Firebase Storage can emit repeated progress events with `bytesTransferred = 0` on Safari; the previous stall watchdog treated any event as activity, so it never timed out.
- **Exact code path**:
  - Client upload stall watchdog: `src/lib/api/scan.ts` `uploadPhoto()`.
- **Fix**:
  - Stall watchdog now resets only when bytes increase (real progress).
  - Added explicit cancel control during upload and best-effort cleanup (`deleteScanApi`) to avoid leaving scans pending indefinitely.
- **Regression test**:
  - `src/lib/api/scan.stall.test.ts` validates stall detection logic.

### QA checklist (focused)
- **Meals**: Clear `localStorage` key `mbs_nutrition_recents_v3`, then re-test; also test with it populated by older shapes.
- **Coach**: Verify `/coach/chat` is usable when OpenAI is configured, regardless of COACH_RPM.
- **Telemetry**: Confirm `/telemetry/log` returns 200 for both fetch and callable-style payloads.
- **Scan (iOS Safari)**: Start upload on a slow network; confirm indeterminate UI until progress appears; confirm stall cancels with a retryable error; confirm Cancel cleans up pending scan.

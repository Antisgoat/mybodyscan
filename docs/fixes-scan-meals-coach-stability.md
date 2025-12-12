# Fixes — Scan upload, Meals crash, Coach gating (stability pass)

## Root causes

- **Scan upload stuck at “0% complete” (iOS Safari)**: Uploads use Firebase Storage resumables, but Safari can fail to emit progress events early (or at all), leaving the UI showing 0% indefinitely with no retry path.
- **Meals crash `undefined is not an object (evaluating 'r.kcal')`**: A render-time helper (`estimateServingWeight`) assumed `per_serving` is always present; some nutrition result shapes omit it, causing a hard crash in Safari’s minified stack (`r` → `per_serving`).
- **Coach disabled due to `COACH_RPM`**: Frontend gating incorrectly treated `COACH_RPM` as a required backend config, even though chat only requires OpenAI configuration (and auth/App Check policies).

## What changed

### Meals

- **Guardrails in `nutritionMath`**: `estimateServingWeight` and `calculateSelection` now tolerate missing `per_serving`/`per_100g` and never throw during render.
- **Canonical adapter for ServingEditor**: Added `toRichFoodItem()` (`src/lib/nutrition/toFoodItem.ts`) to convert the lightweight nutrition search shape into the rich `FoodItem` shape expected by the editor + calculations.
- **Nutrition search flow now uses the adapter** so the editor always receives a safe, complete object.
- **Regression test** added for the exact crash pattern (missing `per_serving`).

### Coach

- **Removed `COACH_RPM` gating in the UI**. Coach now only blocks when OpenAI is missing or backend is genuinely unavailable.
- **Feature diagnostics updated** (`src/lib/envStatus.ts`) so “Coach chat” is not marked incomplete due to missing throttle env.
- **Regression test** added to ensure coach is not gated by `COACH_RPM`.

### Scan upload (iOS robustness)

- **Upload watchdog + retry path**:
  - Client upload now supports `AbortSignal` and a stall watchdog (default 60s) in `submitScanClient`.
  - UI shows **indeterminate progress** until the first real byte progress is observed, preventing misleading “0% forever”.
  - UI surfaces a **Retry upload** action when uploads are taking too long.
- **Regression test** added to ensure zero-byte photos fail fast with a clear message (prevents “0% forever” when the File is invalid).

## QA checklist (production)

- **Login**
  - Email login works
  - Google login works
  - Apple login works

- **Meals**
  - Search a food → open serving editor → no crash
  - Add meal → totals update
  - Delete meal → totals update
  - Repeat for both provider sources (USDA / Open Food Facts) if available

- **Scan**
  - Select 4 photos → upload begins
  - On iOS Safari: progress may be indeterminate briefly, but must not remain stuck forever; retry is available on long stalls
  - Scan advances to processing and result view renders (even if some result fields are missing)

- **Coach**
  - Coach page loads and is not blocked by `COACH_RPM`
  - Sending a message returns a response OR shows a correct “missing OpenAI config” message

## Env vars

- **Required for Scan/Coach AI**: `OPENAI_API_KEY` (Cloud Functions secret or env)
- **Optional**: `COACH_RPM` (no longer required for coach to be enabled; only a tuning knob if implemented server-side)


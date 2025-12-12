# React error #185 follow-up & core flow checklist (Dec 2025)

## Root cause of the crash
- **Symptom:** Production boot immediately hit the global error boundary with “Minified React error #185 (Maximum update depth exceeded)”.
- **Root cause:** `useDemoWireup()` was being mounted **twice** when the public marketing page layout was enabled:
  - once in `AppProviders` (global)
  - again inside `src/components/PublicLayout.tsx`

  `useDemoWireup()` subscribes to Firebase Auth (`onAuthStateChanged`) and can perform synchronous demo-state updates + navigation. Doubling that wiring created a re-entrant update loop at the top of the tree during boot, which React surfaces as #185.

## Fix
- Removed the duplicate demo wireup from the public layout so demo wiring only happens once:
  - `src/components/PublicLayout.tsx`: removed `useDemoWireup()`

## Additional hardening (core flows)
- **Scan**: `src/pages/ScanResult.tsx` now guards against malformed/partial `estimate` payloads (avoids `toFixed()` crashes).
- **Meals**: `src/pages/Meals.tsx` wraps delete/copy actions in try/catch with toasts so network/permission errors can’t surface as unhandled rejections.

## Test & utility fixes
- Restored/added lightweight normalization helpers used by tests:
  - `src/lib/api/nutrition.ts`: export `normalizeFoodItem()` (tolerant mapping)
  - `src/lib/api/billing.ts`: export `buildCheckoutHeaders()` (pure helper)
- Expanded nutrition sanitization to accept more USDA/OFF field variants:
  - `src/lib/nutrition/sanitize.ts`
- Fixed jsdom test environments where needed:
  - `src/features/scan/ScanCapture.test.tsx`
  - `src/components/DemoBanner.test.tsx`

## Verification
- **Production build boots** without `React error #185` and without rendering `AppErrorBoundary`:
  - Added/ran a local Playwright boot test (`tests-e2e/boot-local.spec.ts`) against `vite preview`.
  - Verified the same with `VITE_ENABLE_PUBLIC_MARKETING_PAGE=true`.
- **Builds:**
  - `npm run build` ✅
  - `npm --prefix functions run build` ✅
  - `npm test` ✅

## Files changed
- `src/components/PublicLayout.tsx`
  - Remove duplicate `useDemoWireup()` subscription.
- `src/pages/ScanResult.tsx`
  - Harden scan result rendering against malformed numeric fields.
- `src/pages/Meals.tsx`
  - Catch/log delete/copy errors with non-crashing toasts.
- `src/pages/Workouts.tsx`
  - Guard against missing “today” in plan before sending `dayIndex` to the backend.
- `src/lib/nutrition/sanitize.ts`
  - Accept additional USDA/OFF field variants for calories/macros.
- `src/lib/api/nutrition.ts`
  - Export `normalizeFoodItem` for tests/compat.
- `src/lib/api/billing.ts`
  - Export `buildCheckoutHeaders` for tests/compat.
- `tests-e2e/boot-local.spec.ts`
  - Regression test: ensures `/` boots in production preview without React #185 or the global boundary.
- `playwright.local.config.ts`
  - Local config to run the preview-boot test with a managed `vite preview` webServer.

## QA steps for production
1. Load `/` and confirm app renders (no global error boundary).
2. Load `/auth` and confirm it renders and does not loop.
3. Click “Browse the demo” and confirm demo loads.
4. Sign in with email (and optionally Google/Apple) and confirm redirect to `/home`.

(Flow-specific scan/meals/workouts/coach QA should continue as per the main checklist; this change is intentionally scoped to the boot crash.)

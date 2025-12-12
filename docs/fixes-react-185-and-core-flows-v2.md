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

## Verification
- **Production build boots** without `React error #185` and without rendering `AppErrorBoundary`:
  - Added/ran a local Playwright boot test (`tests-e2e/boot-local.spec.ts`) against `vite preview`.
  - Verified the same with `VITE_ENABLE_PUBLIC_MARKETING_PAGE=true`.
- **Builds:**
  - `npm run build` ✅
  - `npm --prefix functions run build` ✅

## Files changed
- `src/components/PublicLayout.tsx`
  - Remove duplicate `useDemoWireup()` subscription.
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

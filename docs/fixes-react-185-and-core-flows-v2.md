# React error #185 follow-up & core flow checklist (Dec 2025)

## Crash recap & fix
- **Symptom:** `/` and `/home` immediately tripped the global boundary with “Minified React error #185 (Maximum update depth exceeded)”. The tree never progressed past the skip link because the demo mode store re-fired `useSyncExternalStore` subscribers during initial render and the root providers were tightly coupled to the route definitions.
- **Fixes:**
  1. `subscribeDemo` now matches the `useSyncExternalStore` contract exactly (listeners are called without arguments and only when the snapshot truly changes), preventing React from re-entering render.
  2. `AppProviders` encapsulates the auth/demo/bootstrap providers while `AppRouter` content is slotted as children. This lets us mount the provider stack independently (for smoke tests) and ensures synchronous demo wiring no longer cascades into BrowserRouter during render.
  3. `AppErrorBoundary` logs extra diagnostics (route, auth uid, demo flag, stack) so the next crash ships with actionable context.

## Automated checks
- `npx vitest run src/state/demo.test.ts src/lib/auth.test.tsx src/App.smoke.test.tsx`
  - Coverage:
    - Demo store no longer notifies during subscribe, persists session flag.
    - `useAuthUser` transitions (loading → ready, user change → null) verified via exported store internals.
    - `AppProviders` renders without throwing (router + toasts + demo wiring) with a stub child component.

## Manual QA plan (needs real environment)
Run these once Firebase/Stripe/OpenAI credentials are available. Each item assumes happy-path success plus one failure mode.

1. **Authentication**
   - Email/password sign-up, logout, and sign-in (expect redirect to `/home`).
   - Google + Apple sign-in (popup and redirect). Confirm friendly error when Apple unavailable.
   - “Explore demo” from `/auth` loads demo data without touching real auth.
2. **Scan flow**
   - `/scan/start` → weight entry → upload 4 poses → submit → see processing card transition to result.
   - Force failure (omit a pose) and ensure status becomes “Failed” with retry CTA.
   - Visit `/history`, open a completed scan, delete it, and confirm storage cleanup via logs.
3. **Nutrition**
   - `/meals` search “chicken”, log entry via USDA result, confirm daily totals update instantly.
   - `/barcode` scan placeholder UPC, add meal, delete it, verify callable logs show scrubbed payload (no `undefined`).
   - Toggle `/settings/units` between US/metric and re-open meals to confirm unit labels change.
4. **Workouts & Programs**
   - Start catalog program from `/programs`, land on `/workouts?plan=...&started=1`, see “Activating…” then hydrated plan.
   - Mark a set complete, reload page, ensure completion persists.
5. **Coach chat**
   - Send prompt in `/coach/chat`, ensure OpenAI reply or friendly fallback on rate-limit.
   - Trigger error (e.g., disconnect network) and confirm toast shows retry guidance.
6. **Demo / policy gates**
   - Load `/` with `?demo=1` signed-out, confirm read-only CTAs and no React crash.
   - Accept policy gate, reload, ensure preferences stick.

Document any deviations in this file for the next pass.

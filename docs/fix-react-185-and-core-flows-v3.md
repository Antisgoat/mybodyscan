## Summary

This change set eliminates the production boot crash (“Minified React error #185; maximum update depth exceeded”) and adds a few safety guardrails in core flows without changing backend contracts.

## Root cause

- **Offending code**: `useDemoWireup()` in `src/hooks/useDemo.ts`
- **Failure mode**: auth listener re-subscribed on every navigation (`location.*` dependencies) and auth callback mutated demo state (and sometimes URL). In production demo/auth timing this could create a re-entrant update loop → React **max update depth** → global error boundary.

More detail: `docs/fix-react-185-root-cause-v3.md`.

## Fix details

### Boot/demo/auth wiring

- **`src/hooks/useDemo.ts`**
  - Subscribe to `onAuthStateChanged` **once**.
  - Only clear demo flags / force demo off when `user` is present.
  - Remove `demo=` query param only when `authed === true` (separate guarded effect).

### Error boundary logging

- **`src/components/AppErrorBoundary.tsx`**
  - Log includes `error.message` and a normalized stack.
  - Added a simple global guard to prevent repeated crash-log spam during crash loops.

## Core flow guardrails (no behavior change when data is valid)

### Scan / results

- **`src/pages/Scan/History.tsx`**: guard `bodyFatPercent.toFixed(...)` so malformed/missing estimates don’t crash the page.
- **`src/pages/Report.tsx`**: guard several `.toFixed(...)` calls so unexpected report payloads render `—` instead of throwing.

### Meals / nutrition

- **`src/lib/nutritionBackend.ts`**: `addMeal()` now uses `scrubUndefined()` so we never send `undefined` fields to backend/Firestore.

### Workouts

- **`src/pages/Workouts.tsx`**: safe handling when `today.exercises` is missing/non-array.
- **`src/lib/workouts.ts`**: safe weekly completion calculation when plan days/exercises are malformed.

### Coach

- **`src/pages/Coach/Chat.tsx`**: add `onSnapshot` error handler to avoid crashes on permission/network issues; surfaces a single toast + stable UI state.

## Tests added

- **`src/hooks/useDemo.test.tsx`**
  - Ensures demo is not wiped for signed-out users on `?demo=1`.
  - Ensures auth listener subscription is not recreated on navigation.

## Verification

Commands run locally:

- `npm test`
- `npm run build`
- `npm --prefix functions run build`

## QA checklist (non-technical)

- Open the site in an incognito window: home page should load (no “We hit a snag”).
- Go to Sign In:
  - Email/password sign-in works.
  - Google sign-in works.
  - Apple sign-in works (if enabled).
- Click “Browse demo” / “Explore demo”:
  - You can navigate Home/Scan/Meals/Workouts/Coach without crashes.
- Scan:
  - Start a scan, upload 4 photos, reach processing/results.
  - If a scan result is missing fields, the page should show `—` for missing numbers instead of crashing.
- Meals:
  - Add a meal, delete a meal, copy yesterday; failures show a destructive toast.
- Workouts:
  - If plan isn’t ready, you see a loading/activation message instead of a crash.
  - Marking an exercise done doesn’t crash even if plan data is temporarily inconsistent.
- Coach chat:
  - If the backend is unavailable/permission denied, you see a clean error message/toast, not a crash.

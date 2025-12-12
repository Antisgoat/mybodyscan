## Root cause (React error #185 / maximum update depth)

### What was looping

The infinite update loop was caused by **`useDemoWireup()`** (`src/hooks/useDemo.ts`).

- The hook subscribed to Firebase Auth (`onAuthStateChanged`) inside a `useEffect` whose dependency array included `location.pathname` and `location.search`.
- That meant **the auth listener was torn down and re-created on every navigation**.
- The auth callback also performed **demo-mode mutations** (`setDemo(false)` + storage wipes) and sometimes **navigation**.

In production (where demo mode can be enabled and `?demo=1` URLs are used), this combination could create a re-entrant chain:

- navigation → re-subscribe auth listener → immediate auth callback → demo state update (+ optional navigation) → router update → navigation …

Eventually React hits its guardrail and throws **“maximum update depth exceeded”** (minified React error **#185**), which is caught by the global error boundary (“We hit a snag”).

### Why logs said “App mounted twice”

There are **two separate logs** for `[init] App mounted`:

- One in `src/main.tsx` (top-level boot)
- One in `src/App.tsx` (inside `AppProviders`)

So “mounted twice” did not necessarily mean React mounted the root twice; it was two different log sites.

### Why this showed up in production

- Production runs with real demo links / persisted demo sessions and real auth initialization timing.
- The loop depends on the interaction between **router navigation**, **auth listener lifecycle**, and **demo-mode store updates**.

## Fix (high level)

`useDemoWireup()` was refactored to:

- **Subscribe to `onAuthStateChanged` once** (no `location.*` dependencies)
- **Only wipe/disable demo when a real authed user exists**
- Move demo-query cleanup into a **separate, guarded effect** that runs only when `authed === true`

Manual checks for this PR

- App theme renders soft-blue across buttons/cards/headers.
- Demo mode (?demo=1): write buttons disabled with “Read-only demo”.
- Google sign-in: popup works on desktop; redirect fallback on mobile.
- If already signed in, navigating to /today loads without flicker/errors.
- Nutrition search “chicken”: results appear; serving changes update macros immediately.
- Today totals show calories and P/C/F; 7-day chart visible.
- Deep links /app/today, /app/scan, /app/workouts load without 404.
- App Check: missing token allowed in dev; server logs appcheck_soft_missing.
- Checkout button in Plans: blocked in demo; otherwise opens URL.
- Build tag shows short commit and date from build.txt.
- Auth config & IdentityToolkit probe:
  - /auth loads without a red configuration banner when VITE*FIREBASE*\* values are present.
  - Console may log a single IdentityToolkit probe warning (404/403) if the current origin is not in Firebase Auth authorized domains; treat this as informational.
  - Red configuration cards only appear when required keys (apiKey/authDomain/projectId/appId) are missing or Firebase init throws.
- 2025-12-03 smoke-test plan (manual verification needed):
  - Sign in with a non-demo account, open `/meals`, search “chicken,” log a meal, and confirm the totals update.
  - Visit `/coach`, send a prompt such as “Create a 3 day workout split,” and ensure a friendly reply renders without “Bad Request.”
  - Start a scan with placeholder weights, upload four test images (can be compressed placeholders), submit, and verify the history entry transitions out of “pending.”
  - Open `/plans`, click “Buy Now,” and confirm Stripe Checkout or the fallback URL opens without “Checkout unavailable.”

# 2025-02-16 — Firebase auth stability hardening

- ⚠️ `npm run build` (not run: node/npm unavailable in the execution environment)
- ⚠️ `npm --prefix functions run build` (not run: node/npm unavailable in the execution environment)
- ⚠️ Manual auth, meals, coach chat, scan, history, and checkout flows need verification on staging/production once a full runtime is available.

## 2025-12-04

- ✅ `npm run lint`
- ✅ `npm run build`
- ✅ `npm --prefix functions run build`
- ⚠️ Manual auth/billing, meals, coach chat, scan, and history flows still need a signed-in staging pass (not runnable in this headless workspace); changes were validated via local callable/API reasoning only.

## 2025-12-04 — history + meals hardening

- ✅ `npm run build`
- ✅ `npm --prefix functions run build`
- ⚠️ Manual verification requires staging Firebase credentials; please run through the checklist below in a real environment:
  - [ ] Login and session persistence across /home → /history
  - [ ] Meals search “chicken” + add/remove favorites/templates
  - [ ] Coach chat prompt succeeds or shows friendly error
  - [ ] Scan flow: start → upload placeholders → result appears
  - [ ] Scan history delete removes entry and toast appears
  - [ ] Plans checkout opens Stripe session or URL fallback

## 2025-12-05 — scan API hardening

- ✅ `bun run typecheck`
- ✅ `bun run lint`
- Hardened scan API helpers to return typed {ok,data,error} results with safe error parsing and Firestore timestamp normalization.
- Updated scan start/submit/result/history pages to surface friendly errors (with short debug refs), guard missing auth, and clean up snapshot handling.
- To repro previous issues: start a scan while signed out or with missing photos—UI now blocks submission with descriptive messaging instead of generic exceptions; open scan result/history with revoked access to see controlled error text instead of console traces.

## Release smoke test (quick reference)

- Login/logout with email + password (and any enabled social providers).
- Explore demo if available, ensuring it loads without sign-in.
- Meals: search "chicken", add to today, and confirm calories/macros update.
- AI coach: ask for a 3-day workout split and a sample meal; expect friendly replies or clear inline errors.
- Scan flow: start a scan, upload or mock photos, submit, view the result, confirm it appears in History, and delete it.
- Plans/Checkout: start a plan purchase against the test Stripe environment; confirm redirect and that access reflects in the UI when returning.

## 2025-12-14: Post-fix smoke test (coach/programs/meals/rules)

- ✅ `npm run build`
- ✅ `npm run typecheck`
- ✅ Firestore rules tests (local emulator): `npx firebase emulators:exec --only firestore "npm run test --prefix tests/rules"`
- ✅ Coach “Today at a glance” panel added on `/coach` and verified builds cleanly.
- ✅ Coach chat now sends optional “today context” (nutrition totals + plan goals + last scan) and backend merges/auto-fills context without failing requests.

Manual verification (requires a real Firebase project + browser runtime):

1. Auth
   - [ ] Sign in with email + password.
   - [ ] Sign out and sign back in.
2. Coach
   - [ ] `/coach/chat` loads without crashes.
   - [ ] No Firestore `permission-denied` errors for `users/{uid}/coachThreads/*`.
   - [ ] Start a new chat, send a message, and see an AI response (via `coachChat`).
3. Programs
   - [ ] `/programs` and `/programs/:id` load without error toasts.
   - [ ] “Start program” activates a plan via `/applyCatalogPlan` and redirects to `/workouts?plan=...&started=1`.
   - [ ] No `documentPath must point to a document` errors.
4. Meals
   - [ ] `/meals` loads without the route error boundary.
   - [ ] Daily progress ring renders calories/macros (0-safe while loading).
   - [ ] Logging foods updates totals.
   - [ ] No `Can't find variable: totalCalories` errors.
5. Scans
   - [ ] Start → upload → submit scan works end-to-end.
   - [ ] Results page loads without crashes and shows metrics + plan.
6. General
   - [ ] No unhandled exceptions in console on the main flows.
   - [ ] No Firestore `permission-denied` errors for a valid signed-in user.

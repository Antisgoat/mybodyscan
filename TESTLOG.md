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
- 2025-12-03 smoke-test plan (manual verification needed):
  - Sign in with a non-demo account, open `/meals`, search “chicken,” log a meal, and confirm the totals update.
  - Visit `/coach`, send a prompt such as “Create a 3 day workout split,” and ensure a friendly reply renders without “Bad Request.”
  - Start a scan with placeholder weights, upload four test images (can be compressed placeholders), submit, and verify the history entry transitions out of “pending.”
  - Open `/plans`, click “Buy Now,” and confirm Stripe Checkout or the fallback URL opens without “Checkout unavailable.”

## 2025-12-04
- ✅ `npm run lint`
- ✅ `npm run build`
- ✅ `npm --prefix functions run build`
- ⚠️ Manual auth/billing, meals, coach chat, scan, and history flows still need a signed-in staging pass (not runnable in this headless workspace); changes were validated via local callable/API reasoning only.

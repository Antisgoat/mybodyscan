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

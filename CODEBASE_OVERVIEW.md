# Codebase Overview

## 1. High-level architecture
- **Web app**: Vite + React SPA that gates authenticated routes through `ProtectedRoute`, `FeatureGate`, and data boundaries inside a `BrowserRouter`, all wrapped by global providers such as React Query, App Check, and consent/demomode guards.【F:src/App.tsx†L99-L607】
- **Cloud Functions**: Exported entrypoint re-exports REST and callable handlers for chat, nutrition, scan, workouts, payments, and health checks.【F:functions/src/index.ts†L1-L9】
- **Firebase surfaces**: Hosting serves the built SPA with strict security headers and rewrites REST-style endpoints to specific functions; Firestore and Storage rules are packaged alongside functions for deploy.【F:firebase.json†L2-L166】【F:storage.rules†L1-L29】

## 2. Build & deploy flow
- **Toolchains**: Root package targets Node >=18 <21 while Functions pin Node 20; CI runs both web and functions builds on Node 20 runners.【F:package.json†L6-L12】【F:functions/package.json†L3-L16】【F:.github/workflows/verify.yml†L1-L34】
- **Local scripts**: `npm run typecheck`, `npm run build`, and `npm run verify:local` cover TS checks, web builds, and combined web/functions builds; functions have their own `npm --prefix functions run typecheck`/`build` flow.【F:package.json†L10-L36】【F:functions/package.json†L7-L16】
- **Deploy**: Hosting and functions deploy independently via `npm run deploy:hosting` / `deploy:functions`, with Firebase predeploy hooks reinstalling and rebuilding functions code.【F:package.json†L31-L32】【F:firebase.json†L153-L159】

## 3. Environment variables
### Frontend (`VITE_*`)
- Firebase config (`VITE_FIREBASE_*`) overrides the committed public config for auth, firestore, storage, and functions clients.【F:src/lib/firebase.ts†L1-L36】【F:src/config/firebase.public.ts†L1-L17】
- App Check uses `VITE_RECAPTCHA_V3_SITE_KEY` with demo-mode fallbacks; `VITE_DEMO_MODE` also toggles soft App Check and demo UX guards.【F:src/appCheck.ts†L18-L74】【F:src/env.ts†L1-L2】
- Function origins (`VITE_FUNCTIONS_URL`, `VITE_FUNCTIONS_BASE_URL`) drive authenticated fetches for nutrition/workouts and generic helpers.【F:src/lib/nutrition.ts†L1-L70】【F:src/lib/workouts.ts†L1-L55】【F:src/lib/env.ts†L1-L13】
- Auth flags (`VITE_FORCE_APPLE_BUTTON`, `VITE_APPLE_ENABLED`) control Apple provider availability; `VITE_APP_VERSION` tags support emails; marketing flag `VITE_ENABLE_PUBLIC_MARKETING_PAGE` swaps the root route; diagnostics surface `VITE_DEBUG_PANEL` and `VITE_API_BASE` values.【F:src/pages/Auth.tsx†L33-L120】【F:src/lib/firebaseAuthConfig.ts†L94-L132】【F:src/lib/support.ts†L1-L27】【F:src/App.tsx†L114-L121】【F:src/pages/SystemCheck.tsx†L24-L200】

### Functions (Firebase secrets/env)
- Host/App Check tuning via `HOST_BASE_URL`, `APP_CHECK_ALLOWED_ORIGINS`, and `APP_CHECK_ENFORCE_SOFT`; OpenAI and Stripe keys gate scan/chat/payments; USDA/Nutrition keys (`USDA_FDC_API_KEY`, `NUTRITION_RPM`) configure food search; `COACH_RPM` rate-limits chat.【F:functions/src/lib/env.ts†L7-L33】【F:functions/src/systemHealth.ts†L4-L11】【F:functions/src/system/health.ts†L6-L16】【F:functions/src/payments.ts†L7-L40】【F:functions/src/nutritionSearch.ts†L447-L477】【F:functions/src/nutritionBarcode.ts†L84-L130】【F:functions/src/coachChat.ts†L165-L220】

## 4. Routing map
- `/auth` – Sign-in/up UI with email/social providers and demo gating.【F:src/App.tsx†L139-L144】【F:src/pages/Auth.tsx†L33-L180】
- `/scan` – Protected scan dashboard wrapped by scan feature/data boundaries.【F:src/App.tsx†L173-L188】
- `/today` – Daily overview linking scans, meals, and workouts, health-gated.【F:src/App.tsx†L147-L159】【F:src/pages/Today.tsx†L106-L141】
- `/meals` – Nutrition logging workspace behind nutrition feature gate.【F:src/App.tsx†L334-L346】【F:src/pages/MealsSearch.tsx†L300-L357】
- `/coach` – AI coach home with data boundary and chat/day subroutes.【F:src/App.tsx†L190-L232】【F:src/pages/Coach/Chat.tsx†L120-L214】
- `/history` – Scan history view requiring scan feature access.【F:src/App.tsx†L443-L456】
- `/plans` – Plan selection and checkout triggers under account gate.【F:src/App.tsx†L457-L470】【F:src/pages/Plans.tsx†L14-L183】
- `/system/check` – Diagnostics page querying `/system/health` and surfacing env toggles.【F:src/App.tsx†L580-L585】【F:src/pages/SystemCheck.tsx†L24-L200】

## 5. Cloud Functions inventory
- `coachChat` (`functions/src/coachChat.ts`) – App Check + auth protected POST that rate-limits user prompts, calls OpenAI if configured, and stores replies in `users/{uid}/coachChat` pruning history.【F:functions/src/coachChat.ts†L132-L225】
- `nutritionSearch` (`functions/src/nutritionSearch.ts`) – GET search proxy requiring App Check, throttled by `NUTRITION_RPM`, fanning out to USDA/OpenFoodFacts with stub fallbacks.【F:functions/src/nutritionSearch.ts†L426-L559】
- `nutritionBarcode` (`functions/src/nutritionBarcode.ts`) – App Check + auth barcode lookup with per-UID rate limits and 24h in-memory cache.【F:functions/src/nutritionBarcode.ts†L57-L135】
- `addMeal`/`deleteMeal`/`getDailyLog`/`getNutritionHistory` (`functions/src/nutrition.ts`) – Authenticated JSON handlers for CRUD + summaries on `users/{uid}/nutritionLogs/{day}` with App Check enforcement.【F:functions/src/nutrition.ts†L206-L334】
- `beginPaidScan`, `recordGateFailure`, `refundIfNoResult`, `startScanSession`, `submitScan` (`functions/src/scan/*.ts`) – Scan lifecycle endpoints for credit checks, gating, Storage uploads (`user_uploads/{uid}/{scanId}`), OpenAI vision processing, idempotency docs, and credit refunds.【F:functions/src/scan/beginPaidScan.ts†L20-L145】【F:functions/src/scan/recordGateFailure.ts†L16-L58】【F:functions/src/scan/refundIfNoResult.ts†L11-L78】【F:functions/src/scan/start.ts†L46-L128】【F:functions/src/scan/submit.ts†L332-L433】
- `workouts` suite (`functions/src/workouts.ts`) – Generates/stores workout plans, tracks completion progress docs, and provides an `adjustWorkout` HTTP helper.【F:functions/src/workouts.ts†L104-L332】
- `createCheckout` / `stripeWebhook` (`functions/src/payments.ts`) – Stripe helpers returning 501 when secrets missing, using soft App Check on checkout.【F:functions/src/payments.ts†L7-L81】
- `deleteMyAccount` / `createExportIndex` (`functions/src/account.ts`) – Callable utilities to recursively purge a user’s Firestore tree, clean `user_uploads/{uid}` storage, and return short-lived export URLs for scans.【F:functions/src/account.ts†L10-L102】
- `system` (`functions/src/system/health.ts`) and `systemHealth` (`functions/src/systemHealth.ts`) – Health probes reporting OpenAI/Stripe/App Check status, with `system` returning 501 if Stripe disabled.【F:functions/src/system/health.ts†L6-L18】【F:functions/src/systemHealth.ts†L1-L13】
- `useCredit` callable (`functions/src/useCredit.ts`) – App Check + auth validated credit consumption used by the web client.【F:functions/src/useCredit.ts†L1-L35】

## 6. Firestore schema in use
- `users/{uid}` – root doc inspected for `meta.founder` to allow scan credit bypass.【F:functions/src/scan/start.ts†L21-L31】
- `users/{uid}/coach/profile` – source profile for workout/coach generation; plan writes live in `users/{uid}/coachPlans/current`.【F:functions/src/coachPlan.ts†L158-L205】
- `users/{uid}/coachPlans/current` – single doc storing generated coach plan metadata and sessions.【F:functions/src/coachPlan.ts†L188-L203】
- `users/{uid}/coachChat` – collection of chat transcripts with timestamps and `usedLLM` flag, pruned after 10 docs.【F:functions/src/coachChat.ts†L118-L210】
- `users/{uid}/nutritionLogs/{day}` – documents with `meals[]`, calorie/macronutrient totals, and timestamps.【F:functions/src/nutrition.ts†L120-L205】
- `users/{uid}/nutritionLogs/{day}/entries` – subcollection of meal log entries written from the meals search UI.【F:src/pages/MealsSearch.tsx†L324-L348】
- `users/{uid}/nutrition/favorites` & `/nutrition/templates` – per-user saved foods/templates with server timestamps.【F:src/lib/nutritionCollections.ts†L24-L88】
- `users/{uid}/private/credits` – rolling credit buckets and summaries consumed/refunded during scan operations.【F:functions/src/credits.ts†L20-L123】
- `users/{uid}/credits` – individual credit docs filtered client-side for remaining balance displays.【F:src/lib/credits.ts†L1-L16】
- `users/{uid}/workoutPlans/{planId}` plus `/progress/{iso}` and `workoutPlans_meta` – workout plan storage, per-day completion arrays, and active-plan pointer.【F:functions/src/workouts.ts†L104-L213】【F:src/pages/Today.tsx†L80-L89】
- `users/{uid}/workoutLogs` – collection helper exposed for future logs in coach DB utilities.【F:src/lib/db/coachPaths.ts†L6-L12】
- `users/{uid}/scans/{scanId}` – scan session metadata/results with OpenAI output, credits remaining, and idempotency support; associated `users/{uid}/private/idempotency` docs cache completion state.【F:functions/src/scan/submit.ts†L361-L433】
- `users/{uid}/gate/{YYYYMMDD}` – per-day scan gate counters for failure rate-limiting.【F:functions/src/scan/recordGateFailure.ts†L16-L39】

## 7. Error handling conventions
- Helpers normalize Firebase errors to HTTP status via `errorCode`/`statusFromCode`, treating auth, precondition, rate limit, and unavailable cases consistently across handlers.【F:functions/src/lib/errors.ts†L1-L17】
- Stripe-backed endpoints intentionally return HTTP 501 with `payments_disabled` when secrets are absent, and the system health probe mirrors that status so tooling and the UI know payments are off by configuration.【F:functions/src/payments.ts†L7-L40】【F:functions/src/system/health.ts†L6-L18】【F:src/pages/SystemCheck.tsx†L115-L200】

## 8. App Check, security headers, storage, and deletion
- The SPA initializes Firebase App Check with reCAPTCHA v3, tracking readiness in `AppCheckProvider`; server handlers enforce tokens via `verifyAppCheckStrict` (soft mode optional via env).【F:src/appCheck.ts†L18-L74】【F:src/components/AppCheckProvider.tsx†L10-L45】【F:functions/src/http.ts†L1-L38】【F:functions/src/lib/env.ts†L7-L18】
- Hosting sends HSTS, CSP, and other hardened headers globally, with a stricter CSP variant for preview frames.【F:firebase.json†L24-L64】
- User-generated media uploads use signed URLs targeting `user_uploads/{uid}/{scanId}/{pose}.jpg` before results persist to Storage under `scans/{uid}/{scanId}/…`, with Storage rules limiting owners to JPEG images ≤15 MB.【F:functions/src/scan/start.ts†L46-L116】【F:src/lib/scan.ts†L40-L79】【F:storage.rules†L13-L29】
- A `deleteUploads` helper is defined to clean the temporary `uploads` objects after processing, but it is not currently invoked—leaving manual cleanup as a follow-up risk.【F:functions/src/scan/submit.ts†L292-L307】

## 9. Analytics events
- Checkout, scan, meals, and workout UI trigger analytics via `track`, including `checkout_start`, `start_scan_click`, `log_meal_click`, `log_workout_click`, `workout_mark_done`, and `demo_block` variants for gated flows.【F:src/pages/Plans.tsx†L14-L34】【F:src/pages/Today.tsx†L106-L141】【F:src/pages/Workouts.tsx†L104-L138】【F:src/lib/payments.ts†L12-L119】【F:src/lib/workouts.ts†L21-L53】

## 10. Open TODOs & risks
- Replace placeholder health, coach, and workouts shims with real services (tracked in linked TODOs).【F:src/lib/healthShim.ts†L1-L40】【F:src/lib/coachShim.ts†L1-L43】【F:src/lib/workoutsShim.ts†L1-L72】
- Persist user unit preferences instead of hard-coded US units; comment marks pending work.【F:src/hooks/useUnits.ts†L1-L9】
- Subscription filtering in the Plans page still needs subscriber awareness (`// TODO: Check subscription status`).【F:src/pages/Plans.tsx†L137-L183】
- Secret-management TODO notes removing inline defaults in env helper once production keys verified.【F:functions/src/lib/env.ts†L4-L33】
- Temporary scan uploads cleanup helper is unused, so Storage may accumulate artifacts until deletion is wired up.【F:functions/src/scan/submit.ts†L292-L307】

## Common reviews
- Type safety: `npm run typecheck` then `npm --prefix functions run typecheck`.【F:package.json†L29-L29】【F:functions/package.json†L7-L16】
- Production build parity: `npm run build` and `npm --prefix functions run build` (included in `npm run verify:local`).【F:package.json†L10-L35】
- Deploy commands: `npm run deploy:hosting` / `npm run deploy:functions` (functions script also supports project override).【F:package.json†L31-L32】【F:functions/package.json†L7-L16】
- Diagnostics: `npm run dev:check` launches Vite at `/system/check` for integration verification.【F:package.json†L36-L36】

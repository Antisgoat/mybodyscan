# iOS Native Smoke Test (MyBodyScan)

Use this checklist to confirm a clean checkout can build and run the native iOS app without regressions.

## Build steps
1. `npm ci`
2. `npm run build`
3. `npm run build:native`
4. `npx cap sync ios`
5. `npx cap open ios`

## Simulator checks
1. Launch the app in the iOS Simulator.
2. Sign in with `developer@adlerlabs.com` (email/password). Confirm the spinner clears within 15 seconds and you reach the authenticated UI.
3. Trigger an OpenAI-backed action (for example: AI coach chat, meal plan generation, or AI body scan). Confirm the request succeeds via Firebase Functions.
4. Verify production/native release UI does **not** show the Auth debug panel or any “Debug info” UI.

## Secrets checklist
- `OPENAI_API_KEY` must remain in Firebase Functions secrets only (no client `.env*` files).

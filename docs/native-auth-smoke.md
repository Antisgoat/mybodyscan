# Native Auth Smoke Test (iOS)

## Pre-flight
- Build + sync the native bundle:
  - `npm run build:native`
  - `npx cap sync ios`

## iOS Simulator
1. Launch the app in the iOS Simulator.
2. Wait for boot to complete.
   - ✅ No `[auth] step timeout` or `[auth] init timeout` logs.
   - ✅ App renders without a blank screen.

## Email/Password Sign-In
1. Enter a valid email/password and submit.
   - ✅ No page reloads.
   - ✅ Spinner stops within 15 seconds.
   - ✅ Success navigates to the authenticated area.
2. Enter an invalid password.
   - ✅ Spinner stops within 15 seconds.
   - ✅ Error message is shown.

## Offline Handling
1. Toggle airplane mode on.
2. Attempt email/password sign-in.
   - ✅ Sign-in is blocked with an offline message.

ROLE: Lead iOS + Web (Capacitor) engineer.

GOAL:
1) iOS build runs in Simulator without a white screen.
2) Web app works the same as iOS (same routes, same behavior).
3) Capacitor iOS always has a valid web assets folder at build time (no lstat public missing, no “index.html couldn’t be opened”).
4) Native build must NOT ship Firebase JS Auth (no "firebase/auth" or "@firebase/auth" in dist or ios/App/App/public/assets).
5) Native verifier must PASS: npm run build:native && npm run verify:native && npm run ios:sync && npm run verify:native.
6) Native Firebase is fully removed; Firebase runs via the Web SDK inside the WebView only.
7) Remove only what’s necessary; don’t break the web build.

READ THIS CONTEXT (CURRENT FAILURES):
- Native verifier fails with:
  - dist/assets/firebase-*.js contains "firebase/auth" and "@firebase/auth"
  - dist/assets/capacitor-firebase-auth-*.js is emitted
- iOS runtime shows white screen, JS Eval error, and sometimes “index.html couldn’t be opened”.
- Xcode “public” lstat missing happens when ios/App/App/public folder is missing at build time.
- Xcode also shows missing Splash/AppIcon files (warnings), plus plugin warnings.

WHAT TO DO (REQUIRED CHANGES):

A) Make ios/App/App/public ALWAYS exist
- Ensure ios/App/App/public/ exists in repo with a placeholder index.html (already present or create it).
- Ensure no scripts or docs tell the user to rm -rf ios/App/App/public ever again.
- If any build phase references public, it must never break even if cap sync hasn’t run yet.
- If there is any script or code deleting ios/App/App/public, change it to delete only contents, not the folder.

B) Remove native Firebase configuration
- No native Firebase pods or Swift helpers should exist.
- `FirebaseCore` must not be imported anywhere in `ios/App/App/*.swift`.
- There should be no `GoogleService-Info.plist` in the app bundle.

C) Firebase auth stays web-only in the WebView
- Native Firebase auth plugins are intentionally **not** used.
- Use the Web SDK for auth inside the WebView.

D) Fix the white screen
- Add an early boot error boundary so if startup crashes, we show a visible error screen and log the stack to console.
- Confirm the root cause by:
  - Opening Safari Web Inspector Console and capturing the top exception.
  - Fix the exception (most likely an auth import/shim throw or missing public assets).
- Ensure index.html exists in the iOS app bundle at runtime (public folder present, cap sync copied dist).
- Ensure capacitor.config.ts has webDir "dist" and no server.url.

E) Xcode warnings (do not block build)
- Missing Splash/AppIcon files: either regenerate assets properly or remove broken references.
- Prefer fix: add an asset generation step documented for release:
  - If resources/icon.png and resources/splash.png exist, run: npx @capacitor/assets generate --ios
  - Ensure generated files match Xcode asset catalog names so warnings disappear.

OUTPUT REQUIRED FROM YOU (Cursor):
1) A list of exact files you changed.
2) The exact reasoning why FirebaseCore build errors happened and how you removed native Firebase.
3) Confirmation commands and expected outputs:
   - npm run build:native (should succeed)
   - npm run smoke:native (PASSED)
   - npm run ios:sync (succeeds, public populated)
   - npm run smoke:native (PASSED)
4) Notes for iOS release readiness: any remaining warnings, missing icons/splash, entitlements, privacy strings, bundle id, versioning.

DO NOT:
- Do not remove Firebase entirely (web app depends on it).
- Do not “just disable” verifier without fixing the bundle.
- Do not leave ios/App/App/public missing at build time ever again.

START NOW:
- First, scan the repo for native Firebase imports and remove them.
- Then ensure boot diagnostics prevent masked script errors from blocking startup.
- Then fix any boot crash/white screen issues.

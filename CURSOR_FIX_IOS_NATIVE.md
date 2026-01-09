ROLE: Lead iOS + Web (Capacitor) engineer.

GOAL:
1) iOS build runs in Simulator without a white screen.
2) Web app works the same as iOS (same routes, same behavior).
3) Capacitor iOS always has a valid web assets folder at build time (no lstat public missing, no “index.html couldn’t be opened”).
4) Native build must NOT ship Firebase JS Auth (no "firebase/auth" or "@firebase/auth" in dist or ios/App/App/public/assets).
5) Native verifier must PASS: npm run build:native && npm run verify:native && npm run ios:sync && npm run verify:native.
6) Firebase iOS is configured exactly once and early enough (no FirebaseCore “default app not yet configured” at startup).
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

B) Fix Firebase iOS configuration (native)
- Ensure GoogleService-Info.plist exists at ios/App/App/GoogleService-Info.plist and is added to the “App” target.
- In AppDelegate (ios/App/App/AppDelegate.swift), import FirebaseCore and call FirebaseApp.configure() inside application(_:didFinishLaunchingWithOptions:) before Capacitor loads the webview/plugins.
- Ensure it only runs once (guard with FirebaseApp.app() == nil).
- Remove any late or duplicated configure call that causes the “not yet configured” message first and “configured” later.

C) Stop bundling Firebase JS Auth into native web assets
The native verifier is correct: Firebase JS Auth is being bundled. Fix root cause.

1) Find and remove any compat/root firebase imports:
   - Replace any firebase/compat imports with modular SDK imports.
   - Replace any import from "firebase" (root) with explicit modular imports:
     firebase/app, firebase/firestore, firebase/functions, firebase/storage (ONLY what is actually used).
   - The bundle currently looks like compat/all-in-one (it includes many modules). That must be fixed.

2) Ensure NO file that is included in native build statically imports firebase/auth.
   - Create a strict separation:
     - Web-only auth implementation file imports firebase/auth.
     - Native build must not even contain the firebase/auth module in dist.
   - Use build-time dead-code elimination OR Vite resolve.alias in native mode so firebase/auth cannot be bundled.
   - Acceptance: dist/assets should NOT contain tokens “firebase/auth” or “@firebase/auth”.

3) Vite configuration (native mode)
   - In vite.config.ts, when mode === "native":
     - Add resolve.alias mapping for "firebase/auth" and "@firebase/auth" to a local shim module that does NOT include those strings and does NOT import firebase/auth.
     - This prevents accidental imports from ever pulling auth into native bundles.
   - Keep web mode untouched.

4) Update the verifier if it’s incorrectly flagging native plugin JS
   - If the project uses @capacitor-firebase/authentication on native, it will emit a JS chunk. That is OK.
   - The verifier must enforce: no Firebase JS Auth, but should not forbid the native plugin wrapper unless the app explicitly doesn’t use it.
   - Adjust scripts/verify-native-bundle.mjs accordingly:
     - FAIL on tokens: "firebase/auth" and "@firebase/auth"
     - DO NOT fail just because a chunk name contains "capacitor-firebase-auth" unless we are explicitly banning the plugin.
   - The final criterion is “no Firebase JS Auth in native assets”; plugin wrapper is allowed if used.

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
2) The exact reasoning why Firebase JS Auth was being bundled and how you removed it.
3) Confirmation commands and expected outputs:
   - npm run build:native (should succeed)
   - npm run verify:native (PASSED)
   - npm run ios:sync (succeeds, public populated)
   - npm run verify:native (PASSED)
4) Notes for iOS release readiness: any remaining warnings, missing icons/splash, entitlements, privacy strings, bundle id, versioning.

DO NOT:
- Do not remove Firebase entirely (web app depends on it).
- Do not “just disable” verifier without fixing the bundle.
- Do not leave ios/App/App/public missing at build time ever again.

START NOW:
- First, scan the repo for any firebase/compat or root firebase imports and replace them.
- Then enforce auth separation so native build excludes firebase/auth.
- Then fix AppDelegate FirebaseApp.configure timing.
- Then fix the boot crash/white screen.


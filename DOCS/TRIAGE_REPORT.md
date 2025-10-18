# MyBodyScan Auth & Demo Triage

Generated: 2025-10-18T21:50:06.188Z

## Summary

| Area | Status | Notes |
| --- | --- | --- |
| Firebase Init Order | ❌ FAIL | App Check setup runs in parallel with getAuth(), so persistence pulls auth before App Check finishes. |
| Auth Persistence | ✅ PASS | setPersistence(browserLocalPersistence) enforced during init. |
| Email | ✅ PASS | safeEmailSignIn wraps signInWithEmailAndPassword with retry on network failures. |
| Google | ✅ PASS | GoogleAuthProvider used with popup→redirect fallback. |
| Apple | ✅ PASS | Apple button gated behind APPLE_OAUTH_ENABLED with feature-disabled toast. |
| Demo (Anon + Read-only) | ✅ PASS | Demo explore uses anonWithRetry() and persistDemoFlags(). |
| Firebase Web Config | ⚠️ WARN | Firebase config normalizes firebasestorage.app buckets to appspot.com. Local env missing VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID, VITE_FIREBASE_APP_ID. |
| Functions Engines/Build | ✅ PASS | Functions engines pinned to Node 20. |
| Health/Hosting | ✅ PASS | Hosting rewrites /system/health and SPA fallback present. dist/system/health.json present after build. |
| Credits/Claims | ✅ PASS | refreshClaims callable invoked from refreshClaimsNow(). |

## Findings

### Firebase Init Order — ❌ FAIL
App Check setup runs in parallel with getAuth(), so persistence pulls auth before App Check finishes.

- initFirebaseApp uses Promise.all for setupAppCheck + setupPersistence, allowing getAuth() before App Check tokens. ([src/lib/appInit.ts:L60](../src/lib/appInit.ts))

```ts
  56 │     return ready;
  57 │   }
  58 │   ready = (async () => {
  59 │     const app = resolveApp();
  60 │     await Promise.all([setupAppCheck(app), setupPersistence(app)]);
  61 │   })();
  62 │   return ready;
  63 │ }
  64 │ 
```
- getAuth() invoked inside setupPersistence while App Check may still be initializing. ([src/lib/appInit.ts:L45](../src/lib/appInit.ts))

```ts
  41 │ }
  42 │ 
  43 │ async function setupPersistence(app: FirebaseApp) {
  44 │   try {
  45 │     const auth = getAuth(app);
  46 │     await setPersistence(auth, browserLocalPersistence);
  47 │   } catch (error) {
  48 │     if (import.meta.env.DEV) {
  49 │       console.warn("[appInit] Unable to enforce local persistence", error);
```
- App Check is created with ReCaptchaV3Provider but not awaited before persistence. ([src/lib/appInit.ts:L29](../src/lib/appInit.ts))

```ts
  25 │     return;
  26 │   }
  27 │   try {
  28 │     const key = (import.meta.env.VITE_RECAPTCHA_KEY || "").trim();
  29 │     appCheckInstance = initializeAppCheck(app, {
  30 │       provider: new ReCaptchaV3Provider(key || "dummy-key"),
  31 │       isTokenAutoRefreshEnabled: true,
  32 │     });
  33 │     appCheckInitialized = true;
```

### Auth Persistence — ✅ PASS
setPersistence(browserLocalPersistence) enforced during init.

- Auth persistence forced to browserLocalPersistence with error logging fallback. ([src/lib/appInit.ts:L46](../src/lib/appInit.ts))

```ts
  42 │ 
  43 │ async function setupPersistence(app: FirebaseApp) {
  44 │   try {
  45 │     const auth = getAuth(app);
  46 │     await setPersistence(auth, browserLocalPersistence);
  47 │   } catch (error) {
  48 │     if (import.meta.env.DEV) {
  49 │       console.warn("[appInit] Unable to enforce local persistence", error);
  50 │     }
```

### Email — ✅ PASS
safeEmailSignIn wraps signInWithEmailAndPassword with retry on network failures.

- safeEmailSignIn awaits initApp() then retries auth/network-request-failed once. ([src/lib/firebase.ts:L2](../src/lib/firebase.ts))

```ts
   1 │ import { getApp, type FirebaseApp } from "firebase/app";
   2 │ import { signInWithEmailAndPassword, type Auth } from "firebase/auth";
   3 │ import { type AppCheck } from "firebase/app-check";
   4 │ import { type Firestore } from "firebase/firestore";
   5 │ import { getFunctions, type Functions } from "firebase/functions";
   6 │ import { getStorage, type FirebaseStorage } from "firebase/storage";
```
- Auth page submits credentials via safeEmailSignIn(). ([src/pages/Auth.tsx:L413](../src/pages/Auth.tsx))

```ts
 409 │     setFormError(null);
 410 │     setLoading(true);
 411 │     try {
 412 │       if (mode === "signin") {
 413 │         await safeEmailSignIn(email, password);
 414 │       } else {
 415 │         await createAccountEmail(email, password);
 416 │       }
 417 │       navigate(from, { replace: true });
```

### Google — ✅ PASS
GoogleAuthProvider used with popup→redirect fallback.

- Google sign-in leverages signInWithProvider() with fallback to redirect and popup diagnostics. ([src/pages/Auth.tsx:L467](../src/pages/Auth.tsx))

```ts
 463 │     setLastOauthError(null);
 464 │     try {
 465 │       rememberAuthRedirect(from);
 466 │       const authInstance = await getAuthSafe();
 467 │       const googleProvider = new GoogleAuthProvider();
 468 │       googleProvider.setCustomParameters?.({ prompt: "select_account" });
 469 │       const result = await signInWithProvider(authInstance, googleProvider, {
 470 │         preferPopup: shouldUsePopupAuth(),
 471 │       });
```

### Apple — ✅ PASS
Apple button gated behind APPLE_OAUTH_ENABLED with feature-disabled toast.

- Apple provider created with OAuthProvider('apple.com') and finalizeAppleProfile(). ([src/pages/Auth.tsx:L591](../src/pages/Auth.tsx))

```ts
 587 │     setAppleSetupNote(null);
 588 │     setLoading(true);
 589 │     setProviderLoading("apple");
 590 │     setLastOauthError(null);
 591 │     const appleProvider = new OAuthProvider("apple.com");
 592 │     appleProvider.addScope("email");
 593 │     appleProvider.addScope("name");
 594 │     try {
 595 │       rememberAuthRedirect(from);
```
- Apple sign-in short-circuits unless APPLE_OAUTH_ENABLED is true, surfacing configuration guidance. ([src/pages/Auth.tsx:L582](../src/pages/Auth.tsx))

```ts
 578 │       });
 579 │       return;
 580 │     }
 581 │ 
 582 │     if (!appleFeatureEnabled) {
 583 │       handleAppleFeatureDisabled();
 584 │       return;
 585 │     }
 586 │ 
```

### Demo (Anon + Read-only) — ✅ PASS
Demo explore uses anonWithRetry() and persistDemoFlags().

- Anon demo flow defined via anonWithRetry(). ([src/pages/Auth.tsx:L27](../src/pages/Auth.tsx))

```ts
  23 │ import { getAuthSafe } from "@/lib/appInit";
  24 │ import {
  25 │   signInWithPopup,
  26 │   signInWithRedirect,
  27 │   signInAnonymously,
  28 │   type Auth as FirebaseAuth,
  29 │   type AuthProvider,
  30 │   type UserCredential,
  31 │   GoogleAuthProvider,
```
- Firestore writes funnel through assertNotDemoWrite() to enforce read-only demo. ([src/lib/dbWrite.ts:L1](../src/lib/dbWrite.ts))

```ts
   1 │ import { assertNotDemoWrite } from "./demoGuard";
   2 │ import {
   3 │   addDoc as _addDoc,
   4 │   setDoc as _setDoc,
   5 │   updateDoc as _updateDoc,
```

### Firebase Web Config — ⚠️ WARN
Firebase config normalizes firebasestorage.app buckets to appspot.com. Local env missing VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID, VITE_FIREBASE_APP_ID.

- storageBucket rewrites firebasestorage.app hosts to <projectId>.appspot.com and surfaces missing env keys. ([src/config/firebaseConfig.ts:L96](../src/config/firebaseConfig.ts))

```ts
  92 │   };
  93 │ 
  94 │   if (config.storageBucket.endsWith("firebasestorage.app")) {
  95 │     meta.normalizedFrom = config.storageBucket;
  96 │     config.storageBucket = `${config.projectId}.appspot.com`;
  97 │     meta.storageBucketNormalized = config.storageBucket;
  98 │   }
  99 │ 
 100 │   const miss = requiredMissing(config);
```
- Config reports missing env keys via getFirebaseConfigMissingEnvKeys(). ([src/config/firebaseConfig.ts:L12](../src/config/firebaseConfig.ts))

```ts
   8 │   measurementId?: string;
   9 │ };
  10 │ 
  11 │ type FirebaseConfigMeta = {
  12 │   missingEnvKeys: string[];
  13 │   usedFallbackKeys: string[];
  14 │   storageBucketInput: string;
  15 │   storageBucketNormalized: string;
  16 │   normalizedFrom?: string | null;
```

### Functions Engines/Build — ✅ PASS
Functions engines pinned to Node 20.

- functions/package.json engines.node = "20" ([functions/package.json:L4](../functions/package.json))

```ts
   1 │ {
   2 │   "type": "module",
   3 │   "engines": {
   4 │     "node": "20"
   5 │   },
   6 │   "main": "lib/index.js",
   7 │   "scripts": {
   8 │     "clean": "rimraf lib",
```
- functions/tsconfig.json targets NodeNext modules and outDir lib. ([functions/tsconfig.json:L3](../functions/tsconfig.json))

```ts
   1 │ {
   2 │   "compilerOptions": {
   3 │     "module": "NodeNext",
   4 │     "moduleResolution": "NodeNext",
   5 │     "target": "ES2022",
   6 │     "outDir": "lib",
   7 │     "noEmit": false,
```

### Health/Hosting — ✅ PASS
Hosting rewrites /system/health and SPA fallback present. dist/system/health.json present after build.

- firebase.json rewrites /system/health to /system/health.json and includes SPA fallback. ([firebase.json:L103](../firebase.json))

```ts
  99 │         "function": "stripeWebhook",
 100 │         "functionRegion": "us-central1"
 101 │       },
 102 │       {
 103 │         "source": "/system/health",
 104 │         "destination": "/system/health.json"
 105 │       },
 106 │       {
 107 │         "source": "**",
```
- scripts/write-health-json.mjs writes dist/system/health.json during postbuild. ([scripts/write-health-json.mjs:L20](../scripts/write-health-json.mjs))

```ts
  16 │   ts: new Date().toISOString(),
  17 │ };
  18 │ 
  19 │ const outputPath = join(targetDir, "health.json");
  20 │ writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  21 │ 
  22 │ console.log(`[health] wrote ${outputPath}`);
  23 │ 
```

### Credits/Claims — ✅ PASS
refreshClaims callable invoked from refreshClaimsNow().

- refreshClaimsNow() calls httpsCallable(functions, "refreshClaims") then forces ID token refresh. ([src/lib/auth.ts:L167](../src/lib/auth.ts))

```ts
 163 │   if (!current) {
 164 │     throw new Error("auth/no-current-user");
 165 │   }
 166 │   try {
 167 │     await httpsCallable(functions, "refreshClaims")({});
 168 │   } catch (error) {
 169 │     if (import.meta.env.DEV) {
 170 │       console.warn("[auth] refreshClaims callable failed", error);
 171 │     }
```
- CreditsBadge renders ∞ for dev role or unlimited testers. ([src/components/CreditsBadge.tsx:L5](../src/components/CreditsBadge.tsx))

```ts
   1 │ import { useCredits } from "@/hooks/useCredits";
   2 │ 
   3 │ export function CreditsBadge() {
   4 │   const { credits, unlimited, loading, demo, tester, role } = useCredits();
   5 │   const isDev = role === "dev";
   6 │   const showInfinity = unlimited || isDev;
   7 │   const displayCredits = loading ? "…" : showInfinity ? "∞" : credits;
   8 │ 
   9 │   return (
```

## Build Output

- ✅ PASS `npm run build` (exit 0)

  ```

> vite_react_shadcn_ts@0.0.0 build
> vite build

vite v5.4.20 building for production...
transforming...
✓ 3071 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                             7.80 kB │ gzip:  1.85 kB
dist/assets/silhouette-front-C6BufFH5.png                  18.50 kB
dist/assets/index-BbdvJrBt.css                             71.70 kB │ gzip: 12.38 kB
dist/assets/pkg-_babel-runtime-l0sNRNKZ.js                  0.00 kB │ gzip:  0.02 kB
dist/assets/pkg-detect-node-es-l0sNRNKZ.js                  0.00 kB │ gzip:  0.02 kB
dist/assets/pkg-dom-helpers-l0sNRNKZ.js                     0.00 kB │ gzip:  0.02 kB
dist/assets/pkg-react-transition-group-CQ21Yfvs.js          0.06 kB │ gzip:  0.07 kB
dist/assets/pkg-tiny-invariant-BaFNuDhB.js                  0.08 kB │ gzip:  0.09 kB
dist/assets/pkg-get-nonce-C-Z93AgS.js                       0.09 kB │ gzip:  0.10 kB
dist/assets/react-query-DTq7xEjD.js                         0.25 kB │ gzip:  0.21 kB
dist/assets/pkg-clsx-B-dksMZM.js                            0.37 kB │ gzip:  0.24 kB
dist/assets/pkg-internmap-BkD7Hj8s.js                       0.64 kB │ gzip:  0.31 kB
dist/assets/pkg-use-callback-ref-CPg2K6fY.js                0.68 kB │ gzip:  0.38 kB
dist/assets/pkg-firebase-sQTyw44K.js                        0.69 kB │ gzip:  0.46 kB
dist/assets/pkg-tslib-CDuPK5Eb.js                           0.77 kB │ gzip:  0.41 kB
dist/assets/pkg-class-variance-authority-DLeVpCSu.js        0.80 kB │ gzip:  0.44 kB
dist/assets/pkg-prop-types-4wm7Xbao.js                      0.80 kB │ gzip:  0.52 kB
dist/assets/pkg-victory-vendor-BVu7krTW.js                  0.82 kB │ gzip:  0.43 kB
dist/assets/pkg-react-style-singleton-BkyPEk4T.js           0.82 kB │ gzip:  0.45 kB
dist/assets/pkg-use-sync-external-store-D5kqpzl0.js         1.08 kB │ gzip:  0.60 kB
dist/assets/pkg-use-sidecar-XYc7w_fF.js                     1.27 kB │ gzip:  0.64 kB
dist/assets/pkg-next-themes-D7y064Ay.js                     1.45 kB │ gzip:  0.81 kB
dist/assets/pkg-aria-hidden-DvXkyWUv.js                     1.47 kB │ gzip:  0.74 kB
dist/assets/pkg-d3-path-CimkQT29.js                         2.03 kB │ gzip:  0.91 kB
dist/assets/pkg-react-is-DcAOwtUU.js                        2.14 kB │ gzip:  0.80 kB
dist/assets/pkg-react-remove-scroll-bar-D-dj5Vr8.js         2.30 kB │ gzip:  0.96 kB
dist/assets/pkg-_firebase-logger-CNz1B4Yj.js                2.31 kB │ gzip:  1.02 kB
dist/assets/pkg-d3-interpolate-DQThwDfD.js                  2.57 kB │ gzip:  1.20 kB
dist/assets/pkg-eventemitter3-_gqcMBhN.js                   3.04 kB │ gzip:  1.16 kB
dist/assets/pkg-idb-BXWtuYvb.js                             3.05 kB │ gzip:  1.23 kB
dist/assets/pkg-d3-array-g_qRI3rN.js                        3.36 kB │ gzip:  1.46 kB
dist/assets/pkg-scheduler-DYLXRpC5.js                       4.10 kB │ gzip:  1.78 kB
dist/assets/pkg-_floating-ui-utils-ye2j5HVc.js              4.23 kB │ gzip:  1.80 kB
dist/assets/pkg-d3-time-CKN_R_9G.js                         4.65 kB │ gzip:  1.66 kB
dist/assets/pkg-d3-format-CzD4bSOQ.js                       4.79 kB │ gzip:  2.19 kB
dist/assets/pkg-fast-equals-DlKA5pbF.js                     5.63 kB │ gzip:  2.01 kB
dist/assets/pkg-recharts-scale-DCsQrNir.js                  6.01 kB │ gzip:  2.20 kB
dist/assets/pkg-react-remove-scroll-DqhKaz_f.js             6.03 kB │ gzip:  2.47 kB
dist/assets/pkg-_firebase-component-CD9tLe94.js             6.21 kB │ gzip:  1.76 kB
dist/assets/pkg-d3-color-9lF95FHy.js                        7.13 kB │ gzip:  3.02 kB
dist/assets/pkg-_floating-ui-dom-BDTImRdM.js                7.59 kB │ gzip:  3.34 kB
dist/assets/pkg-react-DjW1UnSv.js                           8.01 kB │ gzip:  3.05 kB
dist/assets/pkg-_floating-ui-core-De_TkaaY.js               8.32 kB │ gzip:  3.36 kB
dist/assets/pkg-_capacitor-core-CJ8v3BQZ.js                 8.98 kB │ gzip:  3.55 kB
dist/assets/pkg-_remix-run-router-CtTzx7Mk.js               9.00 kB │ gzip:  3.98 kB
dist/assets/SystemCheck-BQOpSSD4.js                         9.02 kB │ gzip:  3.27 kB
dist/assets/pkg-d3-time-format-DZ7XSvmz.js                  9.03 kB │ gzip:  2.84 kB
dist/assets/pkg-react-router-Dc75RkZR.js                    9.03 kB │ gzip:  3.42 kB
dist/assets/DevAudit-DUHpwAL1.js                            9.20 kB │ gzip:  3.50 kB
dist/assets/OnboardingMBS-Dg14uMdl.js                      10.69 kB │ gzip:  3.45 kB
dist/assets/pkg-decimal_js-light-ZKFLnszB.js               12.78 kB │ gzip:  5.48 kB
… (truncated, 37 more lines)
  ```

- ✅ PASS `npm --prefix functions run build` (exit 0)

  ```

> build
> rimraf lib && tsc --project ./tsconfig.json && node --input-type=module -e "import { existsSync } from 'node:fs'; if (!existsSync('lib/index.js')) { console.error('Missing lib/index.js after build'); process.exit(2); }"


npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.

  ```

## dist/system/health.json

```json
{
  "ok": true,
  "appCheckSoft": true,
  "ts": "2025-10-18T21:50:02.268Z"
}
```

## Fix Plan

1. Sequence initFirebaseApp() so setupAppCheck(app) awaits before setupPersistence(app) to avoid getAuth() without App Check tokens (src/lib/appInit.ts).
2. Populate VITE_FIREBASE_* env vars for the production project and ensure storageBucket resolves to <projectId>.appspot.com (.env / hosting config).

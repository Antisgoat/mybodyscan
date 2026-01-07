# iOS auth: strict web vs native separation

Capacitor iOS uses **WKWebView**. Running Firebase **Web** Auth (`firebase/auth`) during native boot can crash with errors like:

- `@firebase/auth: INTERNAL ASSERTION FAILED: Expected a class definition`

This repo enforces a strict split:

## What runs where

- **Web (browser)**: Firebase Web Auth lives in `src/lib/auth/webFirebaseAuth.ts`.
  - There are **no top-level** `firebase/auth` imports in this module.
  - All `firebase/auth` usage is behind `await import("firebase/auth")` inside functions.

- **Native (Capacitor iOS/Android)**: Native auth lives in `src/lib/auth/nativeAuth.ts`.
  - Uses `@capacitor-firebase/authentication`.
  - Must **never** import `firebase/auth`.

- **Single entrypoint**: `src/lib/authFacade.ts`
  - The rest of the app imports auth only from here (or via the `src/lib/auth.ts` shim).
  - The platform implementation is selected **at runtime** via `isNative()` and loaded via **dynamic import**:
    - `src/lib/auth/webFacadeImpl.ts` (web)
    - `src/lib/auth/nativeFacadeImpl.ts` (native)

## Boot safety / avoiding module preloads

Vite can inject `<link rel="modulepreload">` tags into `dist/index.html`, which can cause sensitive chunks to be fetched at boot. For Capacitor iOS, we disable HTML modulepreload injection in `vite.config.ts`:

- `build.modulePreload = false`

This ensures `firebase-auth-*` is **not** preloaded at native boot.

## Verification checklist

After changes, verify:

- `npm run build`
- Confirm `dist/index.html` does **not** contain:
  - `firebase-auth-`
  - `capacitor-firebase-auth-`
  - `<link rel="modulepreload">`
- Confirm the crash signature is only present in a lazy chunk:
  - `grep -R "Expected a class definition" dist/assets || true`
  - `grep -R "@firebase/auth" dist/assets || true`

## iOS Firebase initialization

`ios/App/App/AppDelegate.swift` configures Firebase **as early as possible**:

- `override init()` calls `FirebaseApp.configure()` (guarded by presence of `GoogleService-Info.plist`)
- `didFinishLaunchingWithOptions` also calls the same helper

`GoogleService-Info.plist` must be included in the Xcode target (Copy Bundle Resources). Do **not** commit secrets into Swift.


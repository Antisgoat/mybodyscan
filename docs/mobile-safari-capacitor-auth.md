## Mobile Safari + Capacitor Auth (Firebase)

This repo supports **same-origin** Firebase Auth on web (critical for iOS Safari / ITP), and provides scaffolding for **native auth** in future Capacitor builds.

### Phase 1 (Web): same-origin redirect auth (required for iOS Safari / PWA)

#### Firebase Console checklist

In **Firebase Console → Authentication → Settings**:

- **Authorized domains** must include:
  - `mybodyscanapp.com` (**required**)
  - `www.mybodyscanapp.com` (if used)
  - `localhost` (dev)
  - `mybodyscan-f3daf.web.app` (optional, if you still use the default Hosting domain)
  - `mybodyscan-f3daf.firebaseapp.com` (optional; not recommended for production auth flows)

In **Firebase Console → Authentication → Sign-in method**:

- **Google**: enabled
- **Apple**: enabled (web setup required if you use Apple on web)

#### Google OAuth configuration

In **Google Cloud Console → APIs & Services → Credentials** (OAuth 2.0 Client IDs):

- **Authorized JavaScript origins**:
  - `https://mybodyscanapp.com`
- **Authorized redirect URIs**:
  - `https://mybodyscanapp.com/__/auth/handler`

Notes:
- The redirect URI MUST match the `authDomain` origin used by the web app.
- If you see Google continuing to `*.firebaseapp.com`, your web config is still using the default auth domain and iOS Safari persistence can break.

#### Apple Sign in (web)

In **Apple Developer → Certificates, Identifiers & Profiles**:

- **Service ID** (web):
  - **Domains and Subdomains**: `mybodyscanapp.com`
  - **Return URLs**: `https://mybodyscanapp.com/__/auth/handler`

### Web app runtime requirements (enforced)

- **Same-origin authDomain**: when running on `mybodyscanapp.com`, Firebase `authDomain` is forced to `mybodyscanapp.com` at runtime.
- **Boot sequence**: `initAuth()` runs before routing decisions:
  - sets persistence (prefers IndexedDB; fallback local/session)
  - finalizes `getRedirectResult()` (via `finalizeRedirectResult()`)
  - waits for the first `onAuthStateChanged` event (`authReady`)
- **Diagnostics**: Settings → Diagnostics shows origin/authDomain/iOS Safari detection/persistence mode and warns in red if misconfigured.

### Phase 2 (Capacitor): web-only auth inside WKWebView

For Capacitor iOS/Android builds, MyBodyScan keeps Firebase auth **web-only** inside the WebView.
Native Firebase auth plugins are intentionally disabled to avoid build-time and runtime issues.

#### Capacitor iOS checklist (high-level)

- **Bundle ID** matches App Store config
- **URL schemes** set only for deep links you control
- **Sign in with Apple** is required if third-party sign-in is enabled (otherwise hide third-party providers)
- **Associated Domains** only if you use Universal Links / dynamic links

#### Capacitor Android checklist (high-level)

- `google-services.json` present and `google-services` plugin applied
- SHA-1/SHA-256 fingerprints added in Firebase Console (for Google sign-in)
- intent-filters / app links if using Universal Links / dynamic links

### Where to look in code

- Web boot init: `src/main.tsx` → `initAuth()`
- Auth init: `src/lib/auth/initAuth.ts`
- Firebase runtime config: `src/lib/firebase.ts`
- Provider flows: `src/lib/auth/oauth.ts`, `src/lib/auth/providers.ts`
- Diagnostics: `src/pages/Settings.tsx` (Settings → Diagnostics), `src/pages/Diagnostics.tsx`
- Auth facade (web-only): `src/lib/authFacade.ts`

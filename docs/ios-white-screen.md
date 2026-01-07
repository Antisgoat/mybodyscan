## iOS white screen: `@firebase/auth` INTERNAL ASSERTION FAILED

### Symptom
- iOS Simulator (WKWebView) boots to a white screen.
- Console shows:
  - `@firebase/auth: Auth (...): INTERNAL ASSERTION FAILED: Expected a class definition`
  - Script URL like `capacitor://localhost/assets/firebase-*.js`

### Root cause
Native boot was indirectly importing/executing Firebase Auth JS code during initial render.

In Capacitor iOS, some native plugins ship a “web fallback” that pulls in `firebase/auth`.
If our boot path subscribes to auth state immediately, it can cause the plugin (and thus
Firebase Auth JS) to evaluate during WKWebView startup — which can crash with the internal
assertion above.

### Fix (boot firewall)
We enforce a **native boot firewall**:
- On native (capacitor://), the app **does not start any auth listeners** and **does not import**
  any auth implementation during initial render.
- Auth is only enabled **after the user opens the Login/Auth UI** (explicit opt-in).
- Web behavior is unchanged: persistence + redirect finalization still happen during boot.

Key pieces:
- `src/lib/auth/authSdk.ts`: the only place that can load `firebase/auth` (lazy + cached).
- `src/lib/authFacade.ts`: native boot firewall; prevents importing auth plugins / auth SDK until opt-in.
- `src/pages/Auth.tsx`: opt-in point on native; starts the auth listener when the user visits Login.

### What to check if it regresses
- No static imports from `firebase/auth` anywhere.
- No “auth bootstrap” runs on native boot (only after user action).
- If new native plugins are added, verify they don’t pull `firebase/auth` into the boot graph.


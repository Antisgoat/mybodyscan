## Mobile monetization (Capacitor iOS + Android) via RevenueCat

### What shipped
- Native (iOS/Android) purchases + restore are handled via **RevenueCat**.
- Web billing remains **Stripe** (unchanged UX), but is **hidden on native builds**.
- A single entitlement doc is now authoritative across platforms: `users/{uid}/entitlements/current`.

### Required env vars (Web app)
- **`VITE_RC_API_KEY_IOS`**: RevenueCat *Public SDK Key* for iOS.
- **`VITE_RC_API_KEY_ANDROID`**: RevenueCat *Public SDK Key* for Android.
- **`VITE_RC_ENTITLEMENT_ID`**: RevenueCat entitlement identifier (default `"pro"`).

### Required env vars (Cloud Functions)
- **`REVENUECAT_WEBHOOK_SIGNING_SECRET`**: RevenueCat webhook signing secret (HMAC SHA-256).
- **`REVENUECAT_ENTITLEMENT_ID`**: Entitlement identifier to apply (default `"pro"`).

### App Store Connect (iOS) checklist
- Create your **In‑App Purchase subscription products** (e.g. monthly + yearly) with the exact product IDs you want.
- Add the products to a **Subscription Group** and complete required metadata.
- In RevenueCat, create an **iOS app**, add those products, and attach them to the **`pro`** entitlement.
- Ensure the iOS build has **In‑App Purchase capability** enabled.

### Play Console (Android) checklist
- Create **subscription products** (base plans/offers) for monthly/yearly.
- In RevenueCat, create an **Android app**, add those products, and attach them to the **`pro`** entitlement.
- Ensure billing is enabled for the app and testing accounts are configured.

### RevenueCat webhook setup
- In RevenueCat → **Webhooks**, add an endpoint pointing at your Firebase Function:
  - `https://<region>-<project>.cloudfunctions.net/revenueCatWebhook`
- Enable webhook signing and set **`REVENUECAT_WEBHOOK_SIGNING_SECRET`** in Functions.
- The webhook is authoritative: it writes `users/{uid}/entitlements/current` and uses idempotency via `revenuecat_events/{eventId}`.

### Firestore rules
- Users can **read** `users/{uid}/entitlements/*`
- Users cannot **write** entitlements docs (server-only)

### Build / deploy commands
- Web app: `npm run typecheck && npm test && npm run build`
- Functions: `npm --prefix functions install && npm --prefix functions run build`
- Deploy (manual): `firebase deploy --only functions,firestore:rules`


# Native iOS Build Notes

## Required Firebase web config (native)
The Capacitor WKWebView build uses the Firebase **web** config object. For iOS
shipping builds, the following env values **must** be populated (they are not secrets):

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`

Recommended if available:

- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MEASUREMENT_ID`

These values are available in the Firebase Console → Project settings → General
→ *Your apps* → *Web app* configuration.

## External scripts in native
Native builds default to **blocking external scripts** (Stripe/Google) to avoid
WKWebView noise. If you explicitly want to allow external scripts in native,
set:

```
VITE_NATIVE_EXTERNAL_SCRIPTS_ENABLED=true
```

## Network diagnostics
In dev/debug builds, the Auth debug panel includes a network probe against:

- IdentityToolkit
- SecureToken
- Firestore
- Functions

Use it to verify `connect-src` CSP allows Firebase endpoints from
`capacitor://localhost`.

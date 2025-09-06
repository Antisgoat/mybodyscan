# Security Notes

- Firestore rules restrict writes for scans and ledger to the server only.
- Cloud Functions enforce App Check and block anonymous users in production.
- A 30s per-user rate limit prevents scan abuse (`meta.lastScanAt`).
- `assertEnv()` fails fast in production if required Firebase env vars are missing.

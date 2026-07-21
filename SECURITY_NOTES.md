# Security Notes

- Firestore rules restrict writes for scans and ledger to the server only.
- Cloud Functions use the shared `APP_CHECK_MODE` contract. Production is intentionally `soft` while the web key and legitimate-client coverage are validated; `strict` rejects missing or invalid tokens on protected paths.
- Per-user rate limiting protects expensive endpoints:
  - `scan_create` and `beginPaidScan`: 10 requests/hour
  - Nutrition search and barcode lookups: 100 requests/hour
- Firebase Console enforcement for Functions, Firestore, and Storage remains off until production domains issue valid tokens. Activation and rollback are documented in `docs/PRODUCTION_RELEASE.md`.
- Stripe webhook and checkout handlers validate environment configuration at startup and fail fast if secrets are missing.
- Required environment variables (production):
  - `STRIPE_SECRET`
  - `STRIPE_WEBHOOK_SECRET`
  - `HOST_BASE_URL`
  - `USDA_FDC_API_KEY` (nutrition fallbacks)
- Credits ledger updates occur inside Firestore transactions with optimistic locking to prevent race conditions.

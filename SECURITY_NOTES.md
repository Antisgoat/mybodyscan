# Security Notes

- Firestore rules restrict writes for scans and ledger to the server only.
- Cloud Functions now enforce strict Firebase App Check on critical mutations (scan submission, paid scans, payments, credit usage). Non-critical reads continue to allow soft validation for compatibility.
- Per-user rate limiting protects expensive endpoints:
  - `scan_create` and `beginPaidScan`: 10 requests/hour
  - Nutrition search and barcode lookups: 100 requests/hour
- Strict App Check validation is active for: `beginPaidScan`, `startScanSession`, `submitScan`, `processQueuedScanHttp`, `getScanStatus`, payments HTTP/callable endpoints, `useCredit`, `nutritionSearch`, `nutritionBarcode`, and Stripe webhook handling. Soft verification remains for legacy read-only health and workout endpoints.
- Stripe webhook and checkout handlers validate environment configuration at startup and fail fast if secrets are missing.
- Required environment variables (production):
  - `STRIPE_SECRET` or `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `HOST_BASE_URL`
  - `USDA_FDC_API_KEY` (nutrition fallbacks)
- Credits ledger updates occur inside Firestore transactions with optimistic locking to prevent race conditions.

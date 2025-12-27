# Scan upload reliability checklist

## Why this matters
Safari users on **mybodyscanapp.com** were seeing Firebase Storage preflight 404s (`firebasestorage.googleapis.com/v0/b/...`) which caused `"Upload started but no bytes were sent."` and blocked scans. The fix requires Storage bucket CORS plus an automatic server-side upload fallback.

## Bucket CORS (one-time, per bucket)

If you see Safari preflight 404s or `"no bytes were sent"`:

1. Ensure you are authenticated to the Firebase project.
2. Run:
   - `npm run storage:cors:set`
3. Verify:
   - `npm run storage:cors:get` should list the configured origins.
   - In the browser devtools, uploads should start sending bytes immediately without OPTIONS 404 spam.

The canonical config lives in `infra/storage-cors.json`.

## App Check (optional, opt-in)

Set `VITE_APPCHECK_SITE_KEY` to enable ReCAPTCHA v3 App Check in the web bundle. If unset, App Check remains disabled without console warnings.

## Upload flow expectations

- All photos upload to `scans/{uid}/{scanId}/{pose}.jpg` (JPEG only).
- Primary path: Firebase Storage Web SDK `uploadBytesResumable`.
- If the Storage SDK fails due to CORS/App Check/network, the client automatically falls back to a server-side upload (same-origin via Hosting rewrite).
- Analysis (`submitScan`) only queues after all four objects exist at the canonical paths.

## Operator validation (Safari)

1. Open https://mybodyscanapp.com and capture front/back/left/right.
2. Watch Network tab: uploads should stream bytes within 1–2 seconds; no 404 preflight errors.
3. If Storage fails, the UI will retry in “safe mode” and complete via the server fallback.
4. After all four uploads, the scan should move from uploading → queued → processing → complete, and result photos render from download URLs without repeated fetch loops.

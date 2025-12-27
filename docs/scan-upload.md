# Scan upload reliability checklist

## Why this matters
Safari users on **mybodyscanapp.com** were seeing Firebase Storage preflight 404s (`firebasestorage.googleapis.com/v0/b/...`) which caused `"Upload started but no bytes were sent."` and blocked scans. The fix requires Storage bucket CORS so the official Firebase Storage Web SDK (resumable uploads) can work reliably in Safari.

## Bucket CORS (one-time, per bucket)

If you see Safari preflight 404s or `"no bytes were sent"`:

1. Ensure you are authenticated to the Firebase project.
2. Run:
   - `npm run storage:cors:set`
3. Verify:
   - `npm run storage:cors:get` should list the configured origins.
   - In the browser devtools, uploads should start sending bytes immediately without OPTIONS 404 spam.

The canonical config lives in `scripts/cors.json` (mirrored in `infra/storage-cors.json`) and allows:
- Origins: `https://mybodyscanapp.com`, `https://mybodyscan-f3daf.web.app`, `http://localhost:5173`, `http://localhost:4173`
- Methods: `GET, HEAD, POST, PUT, OPTIONS`
- Response headers: `Content-Type, Authorization, x-goog-*, x-firebase-storage-version`

## App Check (optional, opt-in)

Set `VITE_APPCHECK_SITE_KEY` to enable ReCAPTCHA v3 App Check in the web bundle. If unset, App Check remains disabled without console warnings.

## Upload flow expectations

- All photos upload to `scans/{uid}/{scanId}/{pose}.jpg` (JPEG only).
- Uploads use ONLY the Firebase Storage Web SDK `uploadBytesResumable` and `getDownloadURL` (no manual REST/XHR to Storage endpoints).
- Analysis (`submitScan`) only queues after all four objects exist at the canonical paths.

## Operator validation (Safari)

1. Open https://mybodyscanapp.com and capture front/back/left/right.
2. Watch Network tab: uploads should stream bytes within 1–2 seconds; no 404 preflight errors.
3. After all four uploads, the scan should move from uploading → queued → processing → complete, and result photos render from download URLs without repeated fetch loops.

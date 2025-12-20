# Scan Upload Reliability (iPhone Safari)

## Why iOS Safari uploads stall

Firebase Storage resumable uploads rely on long-lived, timer-driven streams. On iOS Safari/WebKit this can stall or pause indefinitely when:

- the tab is backgrounded or the device is locked
- the radio hands off between Wi‑Fi and cellular
- iOS throttles timers when resources are constrained

Even very small JPEGs can enter a `paused` state forever with no progress events. This is why we no longer rely on resumable uploads as the only path on iOS.

## Reliable upload paths

We now support **dual-path uploads**:

1. **Backend HTTP upload (default for iOS WebKit)**
   - `uploadScanPhotoHttp` accepts bytes via `fetch()`
   - Auth required via Firebase ID token
   - Function writes to Cloud Storage server-side

2. **Firebase Storage resumable (default for desktop)**
   - Uses `uploadBytesResumable`
   - Still used on stable desktop browsers
   - Auto-fallback to the HTTP path if stalled/paused/timeout

On iOS Safari/WebKit we prefer the function upload path, and only fall back to Storage if the function path fails.

## Debugging uploads (?debug=1)

When `?debug=1` is present in the scan URL, the scan page shows:

- Upload method per photo (storage/function)
- Correlation IDs per attempt
- Per-photo timings (elapsedMs)
- Exact error codes/messages and server responses
- Auth + App Check status

Debug buttons:

- **Test Storage Write**: uploads a 1KB file using the Storage SDK
- **Test Function Upload**: uploads a 1KB JPEG via `uploadScanPhotoHttp`

These buttons confirm which path is functional on the current device/network.

## Correlation IDs

Each scan upload attempt generates a correlation ID:

```
{scanId}-{random}-{pose}-{attempt}
```

The client sends the ID to `uploadScanPhotoHttp`, and the function logs it in Cloud Logging.

## Deployment checklist

- Deploy Functions: `uploadScanPhotoHttp` must be live
- Ensure CORS allows:
  - `https://mybodyscanapp.com`
  - `https://mybodyscan-f3daf.web.app`
  - `https://mybodyscan-f3daf.firebaseapp.com`
- Verify Storage rules allow writes to `user_uploads/{uid}/scans/{scanId}/{view}.jpg`
- Confirm updatedAt is written during uploads (client writes per pose)


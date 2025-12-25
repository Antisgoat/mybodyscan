# Scan pipeline (reliable + fast)

## Goals (non‑negotiable)

- **Upload 4 photos (front/back/left/right) and get results in < 60s (typical)**.
- **No direct Google Storage REST/XHR code in the browser.**
- **No signed URLs / no IAM `signBlob` anywhere in the scan pipeline.**
- **Clear, actionable results**: estimated body fat %, BMI (when possible), key observations, workout program, nutrition plan (macros/calories).

## Final architecture

### 1) Session creation (same-origin)

- **Client** calls `POST /api/scan/start`
  - Hosting rewrite → Cloud Function `startScanSession`
  - Creates Firestore doc: `users/{uid}/scans/{scanId}` with `status: "uploading"`
  - Returns **storage paths** (not URLs):
    - `user_uploads/{uid}/scans/{scanId}/front.jpg`
    - `user_uploads/{uid}/scans/{scanId}/back.jpg`
    - `user_uploads/{uid}/scans/{scanId}/left.jpg`
    - `user_uploads/{uid}/scans/{scanId}/right.jpg`

### 2) Upload (primary: Firebase Storage Web SDK)

- **Client** preprocesses each photo:
  - JPEG only
  - conservative max dimensions
  - aggressive byte cap for mobile reliability
- **Client** uploads using **Firebase Storage Web SDK only**:
  - `uploadBytesResumable(ref(storage, path), blob, metadata)`
  - bounded concurrency: **2** uploads at a time
  - stall watchdog + per-photo timeout + overall timeout
  - UI states: preparing → uploading → retrying → done / failed

### 3) Upload fallback (same-origin, only on iOS Safari stalls)

If iOS Safari stalls after SDK retries with **0 bytes transferred**, the client switches to:

- `POST /api/scan/upload` (Hosting rewrite → `uploadScanPhotoHttp`)
  - validates Firebase ID token (`Authorization: Bearer …`)
  - accepts multipart (`file`) or raw bytes
  - writes to Storage via Admin SDK (`bucket.file(path).save(...)`)
  - returns `{ path, size, contentType }`
  - **does not generate signed URLs** (no `signBlob`)

### 4) Submit (same-origin)

- **Client** calls `POST /api/scan/submit` (rewrite → `submitScan`)
  - validates that all 4 Storage objects exist at the expected paths
  - sets Firestore scan doc status to `queued`

### 5) Processing (server-side only; no signed URLs)

- Firestore trigger `processQueuedScan` runs when status becomes `queued`
- Downloads the 4 images **server-side** via Admin Storage (`file.download()`)
- Sends a single multimodal request to OpenAI using **base64 data URLs** (no signed URLs)
- Writes results back to Firestore:
  - `status: "complete"`
  - `estimate`, `workoutPlan`, `nutritionPlan`, `recommendations`, `planMarkdown`, etc.
- Includes timing logs:
  - `queueDurationMs`, `downloadElapsedMs`, `openAiElapsedMs`, `totalProcessingMs`

## Config requirements (deployment safety)

The scan engine refuses to run unless these are present on Cloud Functions:

- `OPENAI_API_KEY` (**required**)
- `OPENAI_MODEL` (**required**)
- `OPENAI_BASE_URL` (optional; defaults to `https://api.openai.com`)
- `OPENAI_PROVIDER` (optional; defaults to `openai`)

Missing config is returned as a typed error:

- `scan_engine_not_configured` (HTTP 503) with a human-readable message.

## Storage rules

- Client writes are allowed only for the authenticated user under:
  - `user_uploads/{uid}/scans/{scanId}/{pose}.jpg`
- Processing reads happen server-side (Admin SDK bypasses rules).

## QA checklist

### Desktop Chrome

- Upload 4 photos → progress increases smoothly → analysis completes → results render.
- No console spam about CORS/preflight to `googleapis` beyond standard Firebase SDK behavior.

### iOS Safari (device or simulator)

- Upload 4 photos → no permanent 0–1% stall.
- If an upload stalls, it retries and (if needed) switches to fallback uploader.

### Offline mid-upload

- Start upload, toggle offline → upload aborts with an actionable error and retries after reconnect.

### Private browsing / signed-out

- Attempt scan while signed out → blocked with clear “Please sign in” message.

## Scan pipeline basics

The scan flow uploads four prepared JPEG photos to Firebase Storage and then asks the scan engine (OpenAI) to generate an estimate, workout program, and macro plan.

### Required environment

Set these **required** values in Functions/Hosting (`.env.*` or runtime config):

- `OPENAI_API_KEY`
- `OPENAI_MODEL` (e.g., `gpt-4o-mini`)
- `OPENAI_PROVIDER` (e.g., `openai`)
- `OPENAI_BASE_URL` (e.g., `https://api.openai.com`)
- `STORAGE_BUCKET` (canonical bucket, `*.appspot.com`)
- `PROJECT_ID`

The backend fails fast with `scan_engine_not_configured` if any are missing so the UI can surface an actionable error.

### Canonical storage paths

Scan photos are written to:

```
user_uploads/{uid}/scans/{scanId}/{pose}.jpg
```

Storage rules in `storage.rules` allow owner-only access to this path (plus `user_uploads/{uid}/debug/*` for diagnostics).

### Running a quick system check

1. Load `/scan?debug=1` (or any scan page in development).
2. Expand **Debug details** → **Run debug checks**.
3. The tool will validate:
   - Auth (uid present)
   - Storage write via Firebase SDK (1KB to `user_uploads/{uid}/debug/`)
   - Firestore write/read under `users/{uid}/diagnostics/systemCheck`
   - Scan engine config (provider/model/base URL) via `/system/health`

Use this to confirm tokens/rules/config are healthy without re-uploading photos.

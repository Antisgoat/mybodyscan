# Scan pipeline (production)

## Goals

- **No cross-origin Storage calls from the browser**
- **No signed URLs / no IAM `signBlob` dependency**
- **One canonical storage path**: `scans/{uid}/{scanId}/{pose}.jpg` where pose is `front|back|left|right`

## Endpoints (same-origin)

All scan traffic from the web app goes to **same-origin** paths that are rewritten by Firebase Hosting to Cloud Functions:

- **Start**: `POST /api/scan/start`
- **Upload photo**: `POST /api/scan/upload` (multipart)
- **Submit for analysis**: `POST /api/scan/submit`
- **Status (fallback/poll)**: `GET /api/scan/status?scanId=...`
- **Photo bytes**:
  - **Authenticated**: `GET /api/scan/photo?scanId=...&pose=front` (Authorization header required)
  - **Token mode (exports)**: `GET /api/scan/photo?scanId=...&pose=front&uid=...&token=...` (validated against `firebaseStorageDownloadTokens`)

## Client flow

1. **User selects 4 photos + weights**
2. Client calls `POST /api/scan/start` to create `users/{uid}/scans/{scanId}` and receive canonical `photoPaths`.
3. Client uploads each photo to `POST /api/scan/upload` with `multipart/form-data`:
   - `scanId`: string
   - `pose`: `front|back|left|right`
   - `file` (or `image` / `photo`): JPEG bytes
4. Client calls `POST /api/scan/submit` with:
   - `scanId`
   - `photoPaths` (canonical paths)
   - `currentWeightKg`, `goalWeightKg`
5. Results page listens to Firestore; if the listener stalls, it **polls** `GET /api/scan/status`.
6. Photos are displayed by fetching `/api/scan/photo` with auth and converting to a `blob:` URL (so `<img>` never needs auth headers).

## Server flow

- `uploadScanPhotoHttp` verifies the Firebase ID token, writes the object via Admin SDK to:
  - `scans/{uid}/{scanId}/{pose}.jpg`
  - Adds `firebaseStorageDownloadTokens` so token-mode downloads are possible without signed URLs.
- `submitScan` verifies the scan doc + photo paths exist, marks the scan `queued`.
- `processQueuedScan`:
  - claims processing (`status=processing`)
  - writes frequent `lastStep/progress/processingHeartbeatAt`
  - reads images from Storage via Admin SDK, calls OpenAI, writes:
    - `estimate` (body fat %, BMI if available, notes)
    - `workoutPlan`
    - `nutritionPlan` (calories/macros + sample day)
  - marks `status=complete`, `progress=100`.

## Guardrails

- Browser never calls Firebase Storage REST hosts directly.
- No GCS signed URLs and no IAM `signBlob` usage in the scan pipeline.
- Upload and photo fetch endpoints enforce auth by default.


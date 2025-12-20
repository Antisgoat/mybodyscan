# Scan upload “no hang” audit (ship-ready checklist)

Goal: **ZERO infinite states**. Any “uploading” / “processing” phase must eventually exit to success or a user-actionable failure.

This note enumerates every promise/timer/state transition in the scan flow that could otherwise hang, and the guardrails that guarantee eventual resolve/reject.

## Client scan pipeline entrypoints

- `src/pages/Scan.tsx` (`handleSubmit`, `retryFailed`, `retryPose`, `retrySubmitOnly`)
  - **Can hang at**: `await submitScanClient(...)`
  - **Guaranteed exit because**:
    - Each photo attempt uses `uploadPreparedPhoto(...)` with **hard wall-clock timeout** (default 60s per attempt).
    - `uploadPreparedPhoto` enforces **stall detection** via `Date.now()` deltas and **visibility/online/offline** rechecks.
    - `submitScanClient` enforces an **overall deadline** (default 4 minutes) via a combined abort signal passed to uploads + function submit.
    - Errors are surfaced in UI with per-photo failure + “Retry failed photo(s)” (no forced reselect).

- `src/pages/Scan/Result.tsx` (`handleFinalize`, `retryFailed`, `retryPose`)
  - **Can hang at**: `await submitScanClient(...)`
  - **Guaranteed exit because**: same guarantees as above.

## Upload implementation (must never hang)

- `src/lib/uploads/uploadPreparedPhoto.ts` (`uploadPreparedPhoto`)
  - **Can hang at**: Firebase Storage resumable upload task never completes and never emits progress (iOS Safari “paused forever”, background throttling, radio handoff).
  - **Guaranteed exit because**:
    - **Hard timeout** (`overallTimeoutMs`) cancels and rejects with `upload_timeout`.
    - **Stall watchdog** (`stallTimeoutMs`) cancels and rejects with:
      - `upload_paused` (taskState paused too long)
      - `upload_stalled` / `upload_no_progress` (running but no bytes for too long)
    - **Background/timer-throttle safe**:
      - On `document.visibilitychange` → `visible`, we immediately re-evaluate (using `Date.now()` deltas) and force-cancel if stalled/paused or timed out.
    - **Network safe**:
      - On `window.offline`, we immediately cancel + reject with `upload_offline` so caller can pause UI and retry on `online`.
      - On `window.online`, we re-evaluate + resume.
    - **No listener leaks**:
      - We always unsubscribe from `task.on(...)` and remove event listeners on resolve/reject.

- `src/lib/uploads/retryPolicy.ts`
  - `getUploadStallReason(...)`: stall classification uses only **wall-clock deltas**, not interval frequency.
  - `classifyUploadRetryability(...)`: retryable vs non-retryable classification.

## submitScanClient (must never hang)

- `src/lib/api/scan.ts` (`submitScanClient`)
  - **Can hang at**:
    - Upload loop waiting on a Storage task.
    - Submit call to Cloud Function (`apiFetch(submitUrl(), ...)`).
  - **Guaranteed exit because**:
    - Upload phase:
      - Sequential uploads; each attempt is bounded by `perPhotoTimeoutMs` (default 60s).
      - Retry policy only retries safe/retryable failures, with exponential backoff.
      - Offline exits quickly (upload_offline) then waits for online (up to overall deadline) and retries.
    - Submit phase:
      - Uses `apiFetch` with `timeoutMs` (default up to 180s, bounded by overall deadline).
      - Uses an **overall abort signal** (deadline) so the submit cannot run unbounded.
    - Total escape hatch:
      - `overallTimeoutMs` (default 4 minutes) aborts the whole attempt group.

## Processing/results phase (no “refresh required”)

- `src/pages/Processing.tsx`
  - **Can “feel” stuck at**: Firestore snapshot not updating.
  - **Guardrail**: watchdog UI offers “Retry processing” without re-upload; still needs a final hard max timeout pass (see TODO below).

- `src/pages/ScanResult.tsx`
  - **Can “feel” stuck at**: status stays `pending/processing` too long.
  - **Guardrail**: long-processing UI appears with guidance; still needs a final hard max timeout pass (see TODO below).

## Dev verification helpers

- `?debug=1`
  - In `Scan.tsx` debug panel, enable **Simulated frozen upload**:
    - `localStorage["mbs.debug.freezeUpload"]="1"`
    - Next upload uses `uploadPreparedPhoto(..., debugSimulateFreeze: true)` and must still exit via hard timeout + retry UX.

## Remaining TODOs before “done”

- ✅ Added explicit 3–5 minute **processing-stage escape hatch**:
  - `src/pages/Processing.tsx`: hard timeout UI with “Retry processing” / “Start new scan”.
  - `src/pages/ScanResult.tsx`: auto-retry processing once after 3 minutes, and hard timeout UI at 5 minutes.


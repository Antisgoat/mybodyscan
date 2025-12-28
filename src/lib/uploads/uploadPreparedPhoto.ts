import { getDownloadURL, ref, uploadBytesResumable, type UploadTask } from "firebase/storage";
import type { FirebaseStorage, UploadTaskSnapshot } from "firebase/storage";
import {
  classifyUploadRetryability,
  getUploadStallReason,
  type UploadTaskState,
} from "@/lib/uploads/retryPolicy";
import { getScanPhotoPath, type ScanPose } from "@/lib/uploads/storagePaths";

export type UploadPreparedPhotoProgress = {
  bytesTransferred: number;
  totalBytes: number;
  taskState: UploadTaskSnapshot["state"];
  lastProgressAt: number;
};

export type UploadPreparedPhotoResult = {
  path: string;
  storagePath: string;
  downloadURL?: string;
  size: number;
};

export type UploadPreparedPhotoParams = {
  storage: FirebaseStorage;
  file: Blob;
  uid: string;
  scanId: string;
  pose: ScanPose;
  contentType: string;
  includeDownloadURL?: boolean;
  stallTimeoutMs?: number;
  overallTimeoutMs?: number;
  maxRetries?: number;
  signal?: AbortSignal;
  onTask?: (task: UploadTask) => void;
  onProgress?: (progress: UploadPreparedPhotoProgress) => void;
  /**
   * Additional metadata to merge with the required scan identifiers.
   */
  extraMetadata?: Record<string, string | undefined>;
  debugSimulateFreeze?: boolean;
};

export class UploadTimeoutError extends Error {
  code = "upload_timeout";
  constructor(message = "Upload timed out.") {
    super(message);
    this.name = "UploadTimeoutError";
  }
}

export class UploadOfflineError extends Error {
  code = "upload_offline";
  constructor(message = "Connection lost.") {
    super(message);
    this.name = "UploadOfflineError";
  }
}

export class UploadZeroBytesError extends Error {
  code = "upload_zero_bytes";
  constructor(message = "Upload failed: zero-byte file.") {
    super(message);
    this.name = "UploadZeroBytesError";
  }
}

/**
 * Canonical scan photo uploader (Firebase Storage Web SDK).
 * - Hard wall-clock + stall timeouts per attempt
 * - Exponential backoff retries (bounded)
 * - Structured logging to help field-debug production issues
 */
export async function uploadPreparedPhoto(params: UploadPreparedPhotoParams): Promise<UploadPreparedPhotoResult> {
  const storagePath = getScanPhotoPath(params.uid, params.scanId, params.pose);
  const fileSize = typeof params.file?.size === "number" ? Number(params.file.size) : 0;
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    const err = new UploadZeroBytesError("Upload failed: zero-byte file.");
    (err as any).bytesTransferred = 0;
    throw err;
  }

  const customMetadata = Object.fromEntries(
    Object.entries({
      uid: params.uid,
      scanId: params.scanId,
      pose: params.pose,
      ...params.extraMetadata,
    }).filter(([, value]) => typeof value === "string" && value.length > 0)
  );

  const metadata = {
    contentType: params.contentType,
    cacheControl: "public,max-age=31536000",
    customMetadata: customMetadata as Record<string, string>,
  };

  const maxAttempts = Math.max(1, Math.min(5, Number(params.maxRetries ?? 3)));
  const stallTimeoutMs = Math.max(500, Number(params.stallTimeoutMs ?? 15_000));
  const overallTimeoutMs = Math.max(5_000, Number(params.overallTimeoutMs ?? 90_000));

  let lastError: any = null;
  let attempt = 0;
  let backoffMs = 500;
  const telemetryBase = {
    scanId: params.scanId,
    pose: params.pose,
    uid: params.uid,
    path: storagePath,
  };

  while (attempt < maxAttempts) {
    attempt += 1;
    const startedAt = Date.now();
    console.info("scan_upload_start", { ...telemetryBase, attempt });
    try {
      const result = await runResumableUploadAttempt({
        storage: params.storage,
        path: storagePath,
        file: params.file,
        metadata,
        includeDownloadURL: params.includeDownloadURL ?? true,
        stallTimeoutMs,
        overallTimeoutMs,
        signal: params.signal,
        onProgress: params.onProgress,
        onTask: params.onTask,
        debugSimulateFreeze: params.debugSimulateFreeze,
      });
      console.info("scan_upload_success", {
        ...telemetryBase,
        attempt,
        elapsedMs: Date.now() - startedAt,
        downloadURL: result.downloadURL ? "present" : "missing",
      });
      return {
        path: storagePath,
        storagePath,
        downloadURL: result.downloadURL,
        size: fileSize,
      };
    } catch (err: any) {
      lastError = err;
      const retryability = classifyUploadRetryability({
        code: err?.code,
        bytesTransferred: err?.bytesTransferred,
        wasOffline: err?.wasOffline,
      });
      console.error("scan_upload_failure", {
        ...telemetryBase,
        attempt,
        code: err?.code,
        message: err?.message,
        retryable: retryability.retryable,
        reason: retryability.reason,
      });
      if (!retryability.retryable || attempt >= maxAttempts) {
        throw err;
      }
      await waitWithAbort(backoffMs, params.signal);
      backoffMs = Math.min(8_000, backoffMs * 2);
    }
  }

  throw lastError ?? new Error("Upload failed.");
}

async function runResumableUploadAttempt(params: {
  storage: FirebaseStorage;
  path: string;
  file: Blob;
  metadata: {
    contentType: string;
    cacheControl?: string;
    customMetadata?: Record<string, string>;
  };
  signal?: AbortSignal;
  stallTimeoutMs: number;
  overallTimeoutMs: number;
  includeDownloadURL?: boolean;
  onTask?: (task: UploadTask) => void;
  onProgress?: (progress: UploadPreparedPhotoProgress) => void;
  debugSimulateFreeze?: boolean;
}): Promise<{ storagePath: string; downloadURL?: string }> {
  const startedAt = Date.now();
  const deadlineAt = startedAt + Math.max(1, Number(params.overallTimeoutMs || 0));
  const stallTimeoutMs = Math.max(250, Number(params.stallTimeoutMs || 0));
  const storageRef = ref(params.storage, params.path);

  // Debug: simulate a “frozen” upload (no Firebase task, no events).
  if (params.debugSimulateFreeze) {
    await waitUntilDeadlineOrAbort({
      deadlineAt,
      signal: params.signal,
      onRecheck: params.onProgress
        ? () =>
            params.onProgress!({
              bytesTransferred: 0,
              totalBytes: (params.file as any)?.size ?? 1,
              taskState: "paused",
              lastProgressAt: startedAt,
            })
        : undefined,
    });
    throw new UploadTimeoutError("Simulated frozen upload timed out.");
  }

  return await new Promise<{ storagePath: string; downloadURL?: string }>((resolve, reject) => {
    let settled = false;
    let lastBytes = 0;
    let lastBytesAt = Date.now();
    let lastState: UploadTaskState = "running";
    let wasOffline = typeof navigator !== "undefined" ? navigator.onLine === false : false;

    const task = uploadBytesResumable(storageRef, params.file, {
      contentType: params.metadata.contentType,
      cacheControl: params.metadata.cacheControl,
      customMetadata: params.metadata.customMetadata,
    });
    params.onTask?.(task);

    const safeReject = (err: any) => {
      if (settled) return;
      settled = true;
      cleanup();
      err.bytesTransferred = lastBytes;
      err.totalBytes = (params.file as any)?.size ?? 0;
      err.wasOffline = wasOffline;
      reject(err);
    };
    const safeResolve = async () => {
      if (settled) return;
      settled = true;
      cleanup();
      if (!params.includeDownloadURL) {
        resolve({ storagePath: params.path });
        return;
      }
      try {
        const url = await getDownloadURL(storageRef);
        resolve({ storagePath: params.path, downloadURL: url });
      } catch {
        resolve({ storagePath: params.path });
      }
    };

    const cancelTask = () => {
      try {
        task.cancel();
      } catch {
        // ignore
      }
    };

    const evaluate = (source: "interval" | "visibility" | "online" | "offline") => {
      if (settled) return;
      const now = Date.now();
      const noProgressTimeout = 4_000;
      const elapsedSinceBytes = now - lastBytesAt;
      if (lastBytes <= 0 && Number.isFinite(elapsedSinceBytes) && elapsedSinceBytes >= noProgressTimeout) {
        cancelTask();
        const err: any = new Error("Upload started but no bytes were sent.");
        err.code = "upload_no_progress";
        err.wasOffline = wasOffline;
        err.__source = source;
        safeReject(err);
        return;
      }
      if (now >= deadlineAt) {
        cancelTask();
        safeReject(
          new UploadTimeoutError(`Upload timed out after ${Math.round((now - startedAt) / 1000)}s.`)
        );
        return;
      }
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        // Treat offline as immediately retryable. Waiting here creates “hung” feelings on iOS.
        wasOffline = true;
        cancelTask();
        const err: any = new UploadOfflineError();
        err.wasOffline = true;
        err.__source = source;
        safeReject(err);
        return;
      }
      const reason = getUploadStallReason({
        lastBytes,
        lastBytesAt,
        lastState,
        now,
        stallTimeoutMs,
      });
      if (!reason) return;

      // If we’re visible again and the upload is still paused/stalled, force a retry by canceling.
      // This is the key to avoiding iOS Safari “paused forever” hangs.
      cancelTask();
      const err: any = new Error(
        reason === "no_progress"
          ? "Upload started but no bytes were sent."
          : reason === "paused"
            ? "Upload paused for too long."
            : "Upload stalled."
      );
      err.code =
        reason === "no_progress"
          ? "upload_no_progress"
          : reason === "paused"
            ? "upload_paused"
            : "upload_stalled";
      err.wasOffline = wasOffline;
      err.__source = source;
      safeReject(err);
    };

    const abortHandler = () => {
      cancelTask();
      const err: any = new Error("Upload cancelled.");
      err.code = "upload_cancelled";
      safeReject(err);
    };

    const onVis = () => {
      if (document.visibilityState === "hidden") {
        return;
      }
      if (document.visibilityState === "visible") {
        // Re-evaluate immediately; iOS may have throttled timers while hidden.
        evaluate("visibility");
        try {
          task.resume();
        } catch {
          // ignore
        }
      }
    };
    const onOnline = () => {
      // On connectivity recovery, immediately re-evaluate and resume.
      evaluate("online");
      try {
        task.resume();
      } catch {
        // ignore
      }
    };
    const onOffline = () => {
      wasOffline = true;
      evaluate("offline");
    };

    const intervalId =
      typeof window !== "undefined"
        ? window.setInterval(() => {
            // If backgrounded, this may be throttled — that’s OK because we also recheck
            // on visibilitychange/online events and we always compare Date.now deltas.
            evaluate("interval");
          }, 1000)
        : null;

    let unsubscribe: (() => void) | null = null;
    const cleanup = () => {
      if (intervalId != null) window.clearInterval(intervalId);
      if (unsubscribe) {
        try {
          unsubscribe();
        } catch {
          // ignore
        }
        unsubscribe = null;
      }
      if (params.signal) {
        try {
          params.signal.removeEventListener("abort", abortHandler);
        } catch {
          // ignore
        }
      }
      try {
        document.removeEventListener("visibilitychange", onVis);
        window.removeEventListener("online", onOnline);
        window.removeEventListener("offline", onOffline);
      } catch {
        // ignore
      }
    };

    if (params.signal) {
      if (params.signal.aborted) {
        abortHandler();
        return;
      }
      params.signal.addEventListener("abort", abortHandler, { once: true });
    }

    try {
      document.addEventListener("visibilitychange", onVis);
      window.addEventListener("online", onOnline);
      window.addEventListener("offline", onOffline);
    } catch {
      // ignore
    }

    unsubscribe = task.on(
      "state_changed",
      (snapshot) => {
        lastState = snapshot.state as UploadTaskState;
        const bytes = Math.max(0, snapshot.bytesTransferred || 0);
        if (bytes !== lastBytes) {
          lastBytes = bytes;
          lastBytesAt = Date.now();
        }

        // Emit progress. Even on paused states, this gives the UI a “heartbeat”.
        try {
          params.onProgress?.({
            bytesTransferred: bytes,
            totalBytes: snapshot.totalBytes || (params.file as any)?.size || 1,
            taskState: snapshot.state,
            lastProgressAt: Date.now(),
          });
        } catch {
          // ignore
        }

        // Best-effort resume (mobile Safari can wedge in paused).
        if (snapshot.state === "paused") {
          try {
            task.resume();
          } catch {
            // ignore
          }
        }
      },
      (error) => {
        safeReject(error);
      },
      () => {
        void safeResolve();
      }
    );
  });
}

async function waitUntilDeadlineOrAbort(params: {
  deadlineAt: number;
  signal?: AbortSignal;
  onRecheck?: () => void;
}): Promise<void> {
  // Use a small interval while visible; if hidden, we still recheck on visibility events
  // from the caller (or when it becomes visible again).
  while (true) {
    if (params.signal?.aborted) {
      const err: any = new Error("Upload cancelled.");
      err.code = "upload_cancelled";
      throw err;
    }
    const now = Date.now();
    if (now >= params.deadlineAt) return;
    try {
      params.onRecheck?.();
    } catch {
      // ignore
    }
    // This can be throttled in iOS background, but the only purpose here is the dev freeze helper.
    await new Promise((r) => setTimeout(r, 250));
  }
}

async function waitWithAbort(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (!Number.isFinite(delayMs) || delayMs <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("Upload cancelled."));
    };
    if (signal) {
      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener("abort", onAbort, { once: true });
      }
    }
  });
}

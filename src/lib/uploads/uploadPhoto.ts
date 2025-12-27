import type { FirebaseStorage, UploadTask } from "firebase/storage";
import { auth } from "@/lib/firebase";
import { getScanPhotoPath, type ScanPose } from "@/lib/uploads/storagePaths";
import { uploadViaServer } from "@/lib/uploads/uploadViaServer";
import { uploadViaStorage } from "@/lib/uploads/uploadViaStorage";

export type UploadMethod = "storage" | "server";

export type UploadPhotoResult = {
  method: UploadMethod;
  storagePath: string;
  downloadURL?: string;
  elapsedMs: number;
  correlationId: string;
};

let loggedSanityCheck = false;
function assertUploadRuntimeReady(params: {
  storage: FirebaseStorage;
  uid: string;
  scanId: string;
  pose: ScanPose;
  path: string;
}): void {
  const bucket = params.storage?.app?.options?.storageBucket;
  const origin = typeof window !== "undefined" ? window.location.origin : "unknown";
  const authUid = auth.currentUser?.uid || null;
  if (!loggedSanityCheck) {
    loggedSanityCheck = true;
    console.info("scan_storage_runtime", {
      storageBucket: bucket ?? null,
      origin,
      hasAuthUid: Boolean(authUid),
    });
  }
  if (!bucket) {
    const err: any = new Error(
      "Uploads unavailable: storage bucket missing. Please reload and sign in again."
    );
    err.code = "storage/missing-bucket";
    throw err;
  }
  if (!params.uid || !authUid) {
    const err: any = new Error("Please sign in again before uploading your photos.");
    err.code = "storage/unauthorized";
    throw err;
  }
  if (params.uid !== authUid) {
    const err: any = new Error(
      "Your sign-in changed during the scan. Please restart after signing in again."
    );
    err.code = "storage/wrong-user";
    throw err;
  }
  const expectedPath = getScanPhotoPath(params.uid, params.scanId, params.pose);
  if (params.path !== expectedPath) {
    const err: any = new Error("Invalid scan upload path detected.");
    err.code = "storage/invalid-path";
    throw err;
  }
}

export async function uploadPhoto(params: {
  storage: FirebaseStorage;
  path: string;
  file: Blob;
  uid: string;
  scanId: string;
  pose: string;
  correlationId: string;
  customMetadata?: Record<string, string>;
  signal?: AbortSignal;
  storageTimeoutMs: number;
  stallTimeoutMs: number;
  onTask?: (task: UploadTask) => void;
  onProgress?: (progress: {
    bytesTransferred: number;
    totalBytes: number;
    taskState: "running" | "paused" | "success" | "canceled" | "error";
    lastProgressAt: number;
  }) => void;
  debugSimulateFreeze?: boolean;
  onFallback?: (details: { reason: "storage_failed"; message: string }) => void;
}): Promise<UploadPhotoResult> {
  assertUploadRuntimeReady({
    storage: params.storage,
    uid: params.uid,
    scanId: params.scanId,
    pose: params.pose as ScanPose,
    path: params.path,
  });
  const telemetryBase = {
    uid: params.uid,
    scanId: params.scanId,
    pose: params.pose,
    path: params.path,
    correlationId: params.correlationId,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
    origin: typeof window !== "undefined" ? window.location.origin : undefined,
  };

  const logFailure = (event: string, error: any, attempt?: number) => {
    console.error(event, {
      ...telemetryBase,
      errorCode: error?.code,
      errorMessage: error?.message,
      uploadMethod: (error as any)?.uploadMethod ?? "storage",
      attempt,
    });
  };

  const classifyFallback = (error: any): "unauthorized" | "fallback" | "retry" | "fatal" => {
    const code = String(error?.code || "").toLowerCase();
    const message = String(error?.message || "").toLowerCase();
    if (code === "storage/unauthorized" || code === "auth/token-refresh-failed") {
      return "unauthorized";
    }
    if (code === "storage/missing-bucket" || code === "storage/wrong-user" || code === "storage/invalid-path") {
      return "fatal";
    }
    if (code === "upload_no_progress" || code === "upload_stalled" || code === "upload_timeout") {
      return "fallback";
    }
    if (message.includes("no bytes were sent") || message.includes("preflight")) {
      return "fallback";
    }
    if (code === "cors_blocked" || message.includes("cors")) {
      return "fallback";
    }
    if (code === "storage/retry-limit-exceeded" || code === "storage/unknown") {
      return (error?.bytesTransferred ?? 0) > 0 ? "retry" : "fallback";
    }
    if (code.startsWith("storage/") || code.startsWith("upload_")) {
      return "retry";
    }
    if (error?.name === "AbortError") return "fatal";
    return "fallback";
  };

  const attemptStorage = async (attempt: number) => {
    console.info("scan_upload_begin", {
      ...telemetryBase,
      method: "storage-sdk",
      attempt,
    });
    const result = await uploadViaStorage({
      storage: params.storage,
      path: params.path,
      file: params.file,
      customMetadata: params.customMetadata,
      stallTimeoutMs: params.stallTimeoutMs,
      overallTimeoutMs: params.storageTimeoutMs,
      signal: params.signal,
      onTask: params.onTask,
      onProgress: params.onProgress,
      debugSimulateFreeze: params.debugSimulateFreeze,
    });
    console.info("scan_upload_complete", {
      ...telemetryBase,
      method: "storage-sdk",
      elapsedMs: result.elapsedMs,
      attempt,
    });
    return result;
  };

  let lastError: any = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const storageResult = await attemptStorage(attempt);
      return {
        method: "storage",
        storagePath: storageResult.storagePath,
        downloadURL: storageResult.downloadURL,
        elapsedMs: storageResult.elapsedMs,
        correlationId: params.correlationId,
      };
    } catch (error: any) {
      lastError = error;
      const classification = classifyFallback(error);
      if (classification === "unauthorized") {
        logFailure("scan_upload_auth", error, attempt);
        const friendly = new Error("Your session expired. Please sign in again and retry.");
        (friendly as any).code = "storage/unauthorized";
        throw friendly;
      }
      if (classification === "retry" && attempt < 2) {
        continue;
      }
      if (classification === "fallback") {
        params.onFallback?.({
          reason: "storage_failed",
          message: "Upload blocked by browser/network configuration. Retrying with safe mode…",
        });
        try {
          const serverResult = await uploadViaServer({
            path: params.path,
            scanId: params.scanId,
            pose: params.pose,
            file: params.file,
            correlationId: params.correlationId,
            metadata: params.customMetadata,
            signal: params.signal,
          });
          console.info("scan_upload_complete", {
            ...telemetryBase,
            method: "server",
            elapsedMs: serverResult.elapsedMs,
          });
          return {
            method: "server",
            storagePath: serverResult.storagePath,
            downloadURL: undefined,
            elapsedMs: serverResult.elapsedMs,
            correlationId: params.correlationId,
          };
        } catch (fallbackError: any) {
          (fallbackError as any).uploadMethod = "server";
          logFailure("scan_upload_fallback_failed", fallbackError);
          throw fallbackError;
        }
      }
      logFailure("scan_upload_failed", error, attempt);
      throw error;
    }
  }
  logFailure("scan_upload_failed", lastError);
  throw lastError ?? new Error("Upload failed.");
}

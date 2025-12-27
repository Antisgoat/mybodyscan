import type { FirebaseStorage, UploadTask } from "firebase/storage";
import { auth } from "@/lib/firebase";
import { getScanPhotoPath, type ScanPose } from "@/lib/uploads/storagePaths";
import { uploadViaStorage } from "@/lib/uploads/uploadViaStorage";

export type UploadMethod = "storage";

export type UploadPhotoResult = {
  method: UploadMethod;
  storagePath: string;
  downloadURL?: string;
  elapsedMs: number;
  correlationId: string;
};

let loggedSanityCheck = false;

function parseHttpStatusFromStorageError(err: any): number | undefined {
  const direct =
    typeof err?.status === "number"
      ? err.status
      : typeof err?.httpStatus === "number"
        ? err.httpStatus
        : typeof err?.statusCode === "number"
          ? err.statusCode
          : undefined;
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;
  const serverResponse =
    typeof err?.customData?.serverResponse === "string"
      ? err.customData.serverResponse
      : typeof err?.serverResponse === "string"
        ? err.serverResponse
        : null;
  if (!serverResponse) return undefined;
  try {
    const parsed = JSON.parse(serverResponse);
    const code =
      typeof parsed?.error?.code === "number"
        ? parsed.error.code
        : typeof parsed?.code === "number"
          ? parsed.code
          : undefined;
    return typeof code === "number" && Number.isFinite(code) ? code : undefined;
  } catch {
    return undefined;
  }
}

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
    const httpStatus = parseHttpStatusFromStorageError(error);
    const storageErrorCode = error?.code;
    console.error(event, {
      ...telemetryBase,
      storageErrorCode,
      errorCode: storageErrorCode, // backward-compatible field name
      errorMessage: error?.message,
      httpStatus,
      uploadMethod: "storage",
      attempt,
    });
  };

  const classifyFallback = (error: any): "unauthorized" | "retry" | "fatal" => {
    const code = String(error?.code || "").toLowerCase();
    if (code === "storage/unauthorized" || code === "auth/token-refresh-failed") {
      return "unauthorized";
    }
    if (code === "storage/missing-bucket" || code === "storage/wrong-user" || code === "storage/invalid-path") {
      return "fatal";
    }
    if (code === "storage/retry-limit-exceeded" || code === "storage/unknown") {
      return "retry";
    }
    if (code.startsWith("storage/") || code.startsWith("upload_")) {
      return "retry";
    }
    if (error?.name === "AbortError") return "fatal";
    return "retry";
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
      if (classification === "retry" && attempt < 2) continue;
      logFailure("scan_upload_failed", error, attempt);
      throw error;
    }
  }
  logFailure("scan_upload_failed", lastError);
  throw lastError ?? new Error("Upload failed.");
}

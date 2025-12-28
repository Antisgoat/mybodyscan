import type { FirebaseStorage } from "firebase/storage";
import type { UploadTask } from "firebase/storage";
import { uploadPreparedPhoto } from "@/lib/uploads/uploadPreparedPhoto";
import { assertNoForbiddenStorageRestUrl } from "@/lib/storage/restGuards";
import { getScanPhotoPath, type ScanPose } from "@/lib/uploads/storagePaths";

export const SCAN_UPLOAD_CONTENT_TYPE = "image/jpeg";

export type UploadViaStorageResult = {
  method: "storage";
  storagePath: string;
  downloadURL?: string;
  elapsedMs: number;
};

function parseScanPath(path: string): { uid: string; scanId: string; pose: string } | null {
  const match = path.match(/^scans\/([^/]+)\/([^/]+)\/([^/.]+)\.jpg$/i);
  if (!match) return null;
  const [, uid, scanId, pose] = match;
  return { uid, scanId, pose };
}

function shouldLogUploadDebug(): boolean {
  try {
    if (typeof window === "undefined") return false;
    const flag = window.localStorage?.getItem("mbs.debug.uploadLogs");
    if (flag === "1") return true;
    return Boolean((import.meta as any).env?.DEV);
  } catch {
    return false;
  }
}

export async function uploadViaStorage(params: {
  storage: FirebaseStorage;
  path: string;
  file: Blob;
  includeDownloadURL?: boolean;
  customMetadata?: Record<string, string>;
  stallTimeoutMs: number;
  overallTimeoutMs: number;
  signal?: AbortSignal;
  onTask?: (task: UploadTask) => void;
  onProgress?: (progress: {
    bytesTransferred: number;
    totalBytes: number;
    taskState: "running" | "paused" | "success" | "canceled" | "error";
    lastProgressAt: number;
  }) => void;
  maxRetries?: number;
  debugSimulateFreeze?: boolean;
}): Promise<UploadViaStorageResult> {
  const startedAt = Date.now();
  const debugUploads = shouldLogUploadDebug();
  assertNoForbiddenStorageRestUrl(params.path, "upload_path");
  const parsedPath = parseScanPath(params.path);
  if (!parsedPath) {
    const err: any = new Error("Invalid scan upload path.");
    err.code = "invalid_scan_path";
    throw err;
  }
  const pathParts = debugUploads ? parsedPath : null;
  let lastProgressBucket = -1;

  const log = (level: "info" | "warn", event: string, payload?: Record<string, unknown>) => {
    if (!debugUploads) return;
    const base = {
      event,
      path: params.path,
      uid: pathParts?.uid,
      scanId: pathParts?.scanId,
      pose: pathParts?.pose,
      contentType: SCAN_UPLOAD_CONTENT_TYPE,
      size: typeof params.file?.size === "number" ? params.file.size : undefined,
    };
    // eslint-disable-next-line no-console
    console[level]("storage.upload", { ...base, ...(payload ?? {}) });
  };

  const annotateError = (err: any) => {
    const code = String(err?.code || "").toLowerCase();
    const message = String(err?.message || "").toLowerCase();
    if (!code && message.includes("no bytes were sent")) {
      err.code = "upload_no_progress";
    }
    if (message.includes("preflight") || message.includes("cors")) {
      err.code = err.code || "cors_blocked";
    }
    return err;
  };

  try {
    log("info", "start");
    const canonicalPath = getScanPhotoPath(parsedPath.uid, parsedPath.scanId, parsedPath.pose as ScanPose);
    const pathMismatch = canonicalPath !== params.path;
    const result = await uploadPreparedPhoto({
      storage: params.storage,
      uid: parsedPath.uid,
      scanId: parsedPath.scanId,
      pose: parsedPath.pose as ScanPose,
      file: params.file,
      contentType: SCAN_UPLOAD_CONTENT_TYPE,
      includeDownloadURL: params.includeDownloadURL ?? true,
      signal: params.signal,
      stallTimeoutMs: params.stallTimeoutMs,
      overallTimeoutMs: params.overallTimeoutMs,
      maxRetries: params.maxRetries,
      extraMetadata: {
        ...params.customMetadata,
        pathMismatch: pathMismatch ? "true" : undefined,
      },
      onTask: params.onTask,
      onProgress: (progress) => {
        params.onProgress?.(progress);
        if (!debugUploads) return;
        const fraction =
          progress.totalBytes > 0
            ? Math.max(0, Math.min(1, progress.bytesTransferred / progress.totalBytes))
            : 0;
        const bucket = Math.min(4, Math.floor((fraction || 0) * 4));
        if (bucket !== lastProgressBucket || progress.taskState === "paused") {
          lastProgressBucket = bucket;
          log("info", "progress", {
            bytesTransferred: progress.bytesTransferred,
            totalBytes: progress.totalBytes,
            taskState: progress.taskState,
            progress: Number((fraction * 100).toFixed(1)),
          });
        }
      },
      debugSimulateFreeze: params.debugSimulateFreeze,
    });
    const elapsedMs = Date.now() - startedAt;
    if (debugUploads) {
      log("info", "complete", {
        elapsedMs,
        downloadURL: result.downloadURL,
      });
    }
    return {
      method: "storage",
      storagePath: result.path,
      downloadURL: result.downloadURL,
      elapsedMs,
    };
  } catch (err: any) {
    const annotated = annotateError(err);
    if (err && typeof err === "object") {
      (annotated as any).uploadMethod = "storage";
    }
    log("warn", "failed", {
      message: (annotated as any)?.message,
      code: (annotated as any)?.code,
    });
    throw annotated;
  }
}

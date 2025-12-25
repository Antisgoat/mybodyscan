import type { UploadTask } from "firebase/storage";
import { getFirebaseStorage } from "@/lib/firebase";
import { buildScanPhotoPath, type ScanPose } from "@/lib/scanPaths";
import { uploadViaHttp } from "@/lib/uploads/uploadViaHttp";
import { uploadViaStorage } from "@/lib/uploads/uploadViaStorage";

export type UploadMethod = "storage" | "http";

export type UploadPhotoResult = {
  method: UploadMethod;
  storagePath: string;
  contentType: string;
  size: number;
  elapsedMs: number;
  correlationId: string;
};

function toCode(err: unknown): string {
  return typeof (err as any)?.code === "string" ? String((err as any).code) : "";
}

function shouldFallbackToHttp(err: unknown): boolean {
  const code = toCode(err);
  // Don’t “fallback” around auth/permission/cancelled/invalid errors; those need user action.
  if (code === "storage/unauthorized") return false;
  if (code === "function/unauthenticated" || code === "function/permission-denied") return false;
  if (code === "upload_cancelled" || code === "storage/canceled") return false;
  if (code === "storage/invalid-argument") return false;
  // Everything else is potentially transport-related (Safari stalls, transient network, etc.)
  return true;
}

/**
 * Canonical scan uploader:
 * - Prefer Firebase Storage SDK resumable upload (progress + retry-friendly).
 * - Automatically fall back to same-origin HTTP upload if SDK upload fails/stalls.
 */
export async function uploadPhoto(params: {
  uid: string;
  scanId: string;
  pose: ScanPose;
  file: Blob;
  correlationId: string;
  customMetadata?: Record<string, string>;
  signal?: AbortSignal;
  storageTimeoutMs: number;
  stallTimeoutMs: number;
  httpTimeoutMs?: number;
  onTask?: (task: UploadTask) => void;
  onProgress?: (progress: {
    bytesTransferred: number;
    totalBytes: number;
    taskState: "running" | "paused" | "success" | "canceled" | "error";
    lastProgressAt: number;
  }) => void;
  debugSimulateFreeze?: boolean;
}): Promise<UploadPhotoResult> {
  const startedAt = Date.now();
  const contentType = "image/jpeg";
  const size = Number((params.file as any)?.size ?? 0) || 0;
  const storagePath = buildScanPhotoPath({
    uid: params.uid,
    scanId: params.scanId,
    view: params.pose,
  });

  const storage = getFirebaseStorage();
  try {
    const result = await uploadViaStorage({
      storage,
      path: storagePath,
      file: params.file,
      customMetadata: params.customMetadata,
      stallTimeoutMs: params.stallTimeoutMs,
      overallTimeoutMs: params.storageTimeoutMs,
      signal: params.signal,
      onTask: params.onTask,
      onProgress: params.onProgress,
      debugSimulateFreeze: params.debugSimulateFreeze,
    });
    return {
      method: "storage",
      storagePath: result.storagePath,
      contentType,
      size,
      elapsedMs: Date.now() - startedAt,
      correlationId: params.correlationId,
    };
  } catch (err: any) {
    if (!shouldFallbackToHttp(err)) throw err;
    const http = await uploadViaHttp({
      scanId: params.scanId,
      pose: params.pose,
      file: params.file,
      correlationId: params.correlationId,
      signal: params.signal,
      timeoutMs: typeof params.httpTimeoutMs === "number" ? params.httpTimeoutMs : 45_000,
      stallTimeoutMs: params.stallTimeoutMs,
      onProgress: (p) => {
        // Keep the same progress callback shape used by SDK uploads.
        params.onProgress?.({
          bytesTransferred: p.bytesTransferred,
          totalBytes: p.totalBytes,
          taskState: "running",
          lastProgressAt: p.lastProgressAt,
        });
      },
    });
    return {
      method: "http",
      storagePath: http.storagePath,
      contentType,
      size,
      elapsedMs: Date.now() - startedAt,
      correlationId: params.correlationId,
    };
  }
}

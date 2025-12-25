import type { UploadTask } from "firebase/storage";
import { buildScanPhotoPath, type ScanPose } from "@/lib/scanPaths";
import { uploadViaHttp } from "@/lib/uploads/uploadViaHttp";

export type UploadMethod = "http";

export type UploadPhotoResult = {
  method: UploadMethod;
  storagePath: string;
  contentType: string;
  size: number;
  elapsedMs: number;
  correlationId: string;
};

/**
 * Canonical scan uploader (web):
 * - **Same-origin only**: always uploads via `/api/scan/upload` (Hosting rewrite → Cloud Function).
 * - This prevents iOS Safari CORS/preflight and avoids any dependency on GCS signed URLs / signBlob.
 */
export async function uploadPhoto(params: {
  uid: string;
  scanId: string;
  pose: ScanPose;
  file: Blob;
  correlationId: string;
  customMetadata?: Record<string, string>;
  signal?: AbortSignal;
  storageTimeoutMs: number; // kept for call-site compatibility
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

  const http = await uploadViaHttp({
    scanId: params.scanId,
    pose: params.pose,
    file: params.file,
    correlationId: params.correlationId,
    signal: params.signal,
    timeoutMs: typeof params.httpTimeoutMs === "number" ? params.httpTimeoutMs : 45_000,
    stallTimeoutMs: params.stallTimeoutMs,
    onProgress: (p) => {
      params.onProgress?.({
        bytesTransferred: p.bytesTransferred,
        totalBytes: p.totalBytes,
        taskState: "running",
        lastProgressAt: p.lastProgressAt,
      });
    },
  });
  // `uploadViaHttp` writes to the canonical storage path server-side.
  // We return `http.storagePath` from the function response as the source of truth.
  void storagePath; // keep for debugging parity / future diagnostics
  return {
    method: "http",
    storagePath: http.storagePath,
    contentType,
    size,
    elapsedMs: Date.now() - startedAt,
    correlationId: params.correlationId,
  };
}

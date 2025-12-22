import type { FirebaseStorage, UploadTask } from "firebase/storage";
import { uploadViaStorage } from "@/lib/uploads/uploadViaStorage";
import { uploadViaHttp } from "@/lib/uploads/uploadViaHttp";

export type UploadMethod = "storage" | "http";

export type UploadPhotoResult = {
  method: UploadMethod;
  storagePath: string;
  elapsedMs: number;
  correlationId: string;
};

export async function uploadPhoto(params: {
  storage: FirebaseStorage;
  path: string;
  file: Blob;
  scanId: string;
  pose: string;
  correlationId: string;
  customMetadata?: Record<string, string>;
  signal?: AbortSignal;
  storageTimeoutMs: number;
  httpTimeoutMs?: number;
  stallTimeoutMs: number;
  onTask?: (task: UploadTask) => void;
  onProgress?: (progress: {
    bytesTransferred: number;
    totalBytes: number;
    taskState: "running" | "paused" | "success" | "canceled" | "error";
    lastProgressAt: number;
  }) => void;
  onMethodChange?: (info: { method: UploadMethod }) => void;
  debugSimulateFreeze?: boolean;
  preferredMethod?: UploadMethod;
}): Promise<UploadPhotoResult> {
  const method = params.preferredMethod ?? "storage";
  if (method === "http") {
    params.onMethodChange?.({ method: "http" });
    const result = await uploadViaHttp({
      scanId: params.scanId,
      pose: params.pose,
      file: params.file,
      correlationId: params.correlationId,
      timeoutMs: params.httpTimeoutMs ?? params.storageTimeoutMs,
      signal: params.signal,
    });
    return {
      method: "http",
      storagePath: result.storagePath,
      elapsedMs: result.elapsedMs,
      correlationId: params.correlationId,
    };
  }

  params.onMethodChange?.({ method: "storage" });
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
  return {
    method: "storage",
    storagePath: result.storagePath,
    elapsedMs: result.elapsedMs,
    correlationId: params.correlationId,
  };
}

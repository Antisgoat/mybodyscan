import type { FirebaseStorage } from "firebase/storage";
import type { UploadTask } from "firebase/storage";
import { uploadPreparedPhoto } from "@/lib/uploads/uploadPreparedPhoto";

export type UploadViaStorageResult = {
  method: "storage";
  storagePath: string;
  elapsedMs: number;
};

export async function uploadViaStorage(params: {
  storage: FirebaseStorage;
  path: string;
  file: Blob;
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
  debugSimulateFreeze?: boolean;
}): Promise<UploadViaStorageResult> {
  const startedAt = Date.now();
  try {
    const result = await uploadPreparedPhoto({
      storage: params.storage,
      path: params.path,
      file: params.file,
      metadata: {
        contentType: "image/jpeg",
        cacheControl: "public,max-age=31536000",
        customMetadata: params.customMetadata,
      },
      signal: params.signal,
      stallTimeoutMs: params.stallTimeoutMs,
      overallTimeoutMs: params.overallTimeoutMs,
      onTask: params.onTask,
      onProgress: params.onProgress,
      debugSimulateFreeze: params.debugSimulateFreeze,
    });
    return {
      method: "storage",
      storagePath: result.storagePath,
      elapsedMs: Date.now() - startedAt,
    };
  } catch (err: any) {
    if (err && typeof err === "object") {
      (err as any).uploadMethod = "storage";
    }
    throw err;
  }
}

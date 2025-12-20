import type { FirebaseStorage, UploadTask } from "firebase/storage";
import { uploadViaFunction } from "@/lib/uploads/uploadViaFunction";
import { uploadViaStorage } from "@/lib/uploads/uploadViaStorage";

export type UploadMethod = "storage" | "function";

export type UploadPhotoResult = {
  method: UploadMethod;
  storagePath: string;
  bucket?: string;
  size?: number;
  generation?: string;
  md5?: string;
  elapsedMs: number;
  correlationId: string;
  fallbackFrom?: UploadMethod;
};

export function isIOSWebKitDevice(env?: {
  userAgent?: string;
  maxTouchPoints?: number;
}): boolean {
  const ua = String(env?.userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : ""));
  const maxTouchPoints =
    typeof env?.maxTouchPoints === "number"
      ? env.maxTouchPoints
      : typeof navigator !== "undefined" && typeof (navigator as any).maxTouchPoints === "number"
        ? Number((navigator as any).maxTouchPoints)
        : 0;
  const isIOS = /iP(hone|ad|od)/i.test(ua);
  const isIPadLike = /Macintosh/i.test(ua) && maxTouchPoints > 1;
  const isAppleWebKit = /AppleWebKit/i.test(ua);
  return isAppleWebKit && (isIOS || isIPadLike);
}

export function shouldPreferFunctionUpload(): boolean {
  return isIOSWebKitDevice();
}

export function shouldFallbackToFunction(code?: string): boolean {
  const normalized = String(code || "");
  return (
    normalized === "upload_timeout" ||
    normalized === "upload_paused" ||
    normalized === "upload_stalled" ||
    normalized === "upload_no_progress" ||
    normalized === "storage/retry-limit-exceeded" ||
    normalized === "storage/timeout"
  );
}

export function shouldFallbackToStorage(code?: string): boolean {
  const normalized = String(code || "");
  if (
    normalized === "function/unauthenticated" ||
    normalized === "function/permission-denied" ||
    normalized === "function/invalid-argument"
  ) {
    return false;
  }
  return (
    normalized === "cors_blocked" ||
    normalized === "upload_timeout" ||
    normalized.startsWith("function/")
  );
}

export async function uploadPhoto(params: {
  preferredMethod: UploadMethod;
  storage: FirebaseStorage;
  path: string;
  file: Blob;
  token: string;
  scanId: string;
  view: "front" | "back" | "left" | "right";
  correlationId: string;
  signal?: AbortSignal;
  storageTimeoutMs: number;
  functionTimeoutMs: number;
  stallTimeoutMs: number;
  onTask?: (task: UploadTask) => void;
  onProgress?: (progress: {
    bytesTransferred: number;
    totalBytes: number;
    taskState: "running" | "paused" | "success" | "canceled" | "error";
    lastProgressAt: number;
  }) => void;
  onMethodChange?: (info: { method: UploadMethod; fallbackFrom?: UploadMethod }) => void;
  debugSimulateFreeze?: boolean;
}): Promise<UploadPhotoResult> {
  const startMethod = params.preferredMethod;
  if (startMethod === "storage") {
    params.onMethodChange?.({ method: "storage" });
    try {
      const result = await uploadViaStorage({
        storage: params.storage,
        path: params.path,
        file: params.file,
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
    } catch (err: any) {
      const code = typeof err?.code === "string" ? err.code : undefined;
      if (!shouldFallbackToFunction(code)) throw err;
      params.onMethodChange?.({ method: "function", fallbackFrom: "storage" });
      const result = await uploadViaFunction({
        token: params.token,
        scanId: params.scanId,
        view: params.view,
        file: params.file,
        correlationId: params.correlationId,
        signal: params.signal,
        timeoutMs: params.functionTimeoutMs,
        onProgress: (info) => {
          params.onProgress?.({
            bytesTransferred: info.bytesTransferred,
            totalBytes: info.totalBytes,
            taskState: "running",
            lastProgressAt: Date.now(),
          });
        },
      });
      return {
        method: "function",
        fallbackFrom: "storage",
        storagePath: params.path,
        bucket: result.bucket,
        size: result.size,
        generation: result.generation,
        md5: result.md5,
        elapsedMs: result.elapsedMs,
        correlationId: params.correlationId,
      };
    }
  }

  params.onMethodChange?.({ method: "function" });
  try {
    const result = await uploadViaFunction({
      token: params.token,
      scanId: params.scanId,
      view: params.view,
      file: params.file,
      correlationId: params.correlationId,
      signal: params.signal,
      timeoutMs: params.functionTimeoutMs,
      onProgress: (info) => {
        params.onProgress?.({
          bytesTransferred: info.bytesTransferred,
          totalBytes: info.totalBytes,
          taskState: "running",
          lastProgressAt: Date.now(),
        });
      },
    });
    return {
      method: "function",
      storagePath: params.path,
      bucket: result.bucket,
      size: result.size,
      generation: result.generation,
      md5: result.md5,
      elapsedMs: result.elapsedMs,
      correlationId: params.correlationId,
    };
  } catch (err: any) {
    const code = typeof err?.code === "string" ? err.code : undefined;
    if (!shouldFallbackToStorage(code)) throw err;
    params.onMethodChange?.({ method: "storage", fallbackFrom: "function" });
    const result = await uploadViaStorage({
      storage: params.storage,
      path: params.path,
      file: params.file,
      stallTimeoutMs: params.stallTimeoutMs,
      overallTimeoutMs: params.storageTimeoutMs,
      signal: params.signal,
      onTask: params.onTask,
      onProgress: params.onProgress,
      debugSimulateFreeze: params.debugSimulateFreeze,
    });
    return {
      method: "storage",
      fallbackFrom: "function",
      storagePath: result.storagePath,
      elapsedMs: result.elapsedMs,
      correlationId: params.correlationId,
    };
  }
}

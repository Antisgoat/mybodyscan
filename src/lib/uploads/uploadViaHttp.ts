import { ApiError } from "@/lib/http";
import { DEFAULT_FN_BASE, resolveFunctionUrl } from "@/lib/api/functionsBase";
import { xhrUploadFormDataJson } from "@/lib/uploads/xhrUploadJson";

type UploadScanPhotoHttpResponse = {
  ok: true;
  bucket: string;
  path: string;
  size: number;
  contentType?: string;
  downloadURL?: string;
  generation?: string;
  md5?: string;
};

export type UploadViaHttpResult = {
  method: "http";
  storagePath: string;
  elapsedMs: number;
};

function isStorageRestUrl(candidate: string): boolean {
  const value = candidate.toLowerCase();
  if (value.includes("firebasestorage.googleapis.com")) return true;
  if (value.includes("storage.googleapis.com")) return true;
  return value.includes("/v0/b/") || value.includes("/upload/storage/v1/b/");
}

function resolveUploadBaseUrl(): string {
  const resolved = resolveFunctionUrl("VITE_SCAN_UPLOAD_HTTP_URL", "uploadScanPhotoHttp");
  if (isStorageRestUrl(resolved)) {
    console.warn("scan_upload_http_invalid_override", { resolved });
    return `${DEFAULT_FN_BASE}/uploadScanPhotoHttp`;
  }
  return resolved;
}

function uploadUrl(scanId: string, view: string, correlationId: string): string {
  const base = resolveUploadBaseUrl();
  const params = new URLSearchParams({
    scanId,
    view,
    correlationId,
  });
  return `${base}?${params.toString()}`;
}

function mapHttpError(err: unknown): Error & { code?: string } {
  if (err instanceof ApiError) {
    const code =
      typeof err.code === "string" && err.code.length
        ? `function/${err.code}`
        : `function/http_${err.status || 0}`;
    const message =
      typeof err.message === "string" && err.message.length
        ? err.message
        : "Upload failed.";
    const error = new Error(message) as Error & { code?: string };
    error.code = code;
    return error;
  }
  if (err instanceof Error) return err as Error & { code?: string };
  const fallback = new Error("Upload failed.") as Error & { code?: string };
  fallback.code = "function/upload_failed";
  return fallback;
}

export async function uploadViaHttp(params: {
  scanId: string;
  pose: string;
  file: Blob;
  correlationId: string;
  signal?: AbortSignal;
  timeoutMs: number;
  stallTimeoutMs?: number;
  onProgress?: (progress: { bytesTransferred: number; totalBytes: number; lastProgressAt: number }) => void;
}): Promise<UploadViaHttpResult> {
  const startedAt = Date.now();
  const form = new FormData();
  form.append("scanId", params.scanId);
  form.append("view", params.pose);
  form.append("pose", params.pose);
  form.append("correlationId", params.correlationId);
  form.append("file", params.file, `${params.pose}.jpg`);

  try {
    const response = await xhrUploadFormDataJson<UploadScanPhotoHttpResponse>({
      url: uploadUrl(params.scanId, params.pose, params.correlationId),
      formData: form,
      timeoutMs: params.timeoutMs,
      stallTimeoutMs: params.stallTimeoutMs ?? 12_000,
      signal: params.signal,
      headers: {
        "X-Correlation-Id": params.correlationId,
        "X-Scan-Id": params.scanId,
        "X-Scan-View": params.pose,
      },
      onProgress: (p) => {
        params.onProgress?.({
          bytesTransferred: p.loaded,
          totalBytes: p.total,
          lastProgressAt: p.lastProgressAt,
        });
      },
    }).then((r) => r.data);
    const path = response?.ok ? response.path : "";
    if (!path) {
      const err = new Error("Upload failed.") as Error & { code?: string };
      err.code = "function/upload_failed";
      throw err;
    }
    return {
      method: "http",
      storagePath: path,
      elapsedMs: Date.now() - startedAt,
    };
  } catch (err) {
    throw mapHttpError(err);
  }
}

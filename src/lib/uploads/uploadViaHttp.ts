import { apiFetch, ApiError } from "@/lib/http";
import { resolveFunctionUrl } from "@/lib/api/functionsBase";

type UploadScanPhotoHttpResponse = {
  ok: true;
  bucket: string;
  path: string;
  size: number;
  generation?: string;
  md5?: string;
};

export type UploadViaHttpResult = {
  method: "http";
  storagePath: string;
  elapsedMs: number;
};

function uploadUrl(scanId: string, view: string, correlationId: string): string {
  const base = resolveFunctionUrl("VITE_SCAN_UPLOAD_HTTP_URL", "uploadScanPhotoHttp");
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
}): Promise<UploadViaHttpResult> {
  const startedAt = Date.now();
  const form = new FormData();
  form.append("scanId", params.scanId);
  form.append("view", params.pose);
  form.append("correlationId", params.correlationId);
  form.append("file", params.file, `${params.pose}.jpg`);

  try {
    const response = await apiFetch<UploadScanPhotoHttpResponse>(
      uploadUrl(params.scanId, params.pose, params.correlationId),
      {
        method: "POST",
        body: form,
        timeoutMs: params.timeoutMs,
        retries: 0,
        signal: params.signal,
      }
    );
    const path = response?.path || "";
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

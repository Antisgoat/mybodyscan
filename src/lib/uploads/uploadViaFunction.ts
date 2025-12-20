import { resolveFunctionUrl } from "@/lib/api/functionsBase";
import { getAppCheckTokenHeader } from "@/lib/appCheck";

export type UploadViaFunctionResponse = {
  ok: true;
  bucket: string;
  path: string;
  size: number;
  generation?: string;
  md5?: string;
};

export type UploadViaFunctionResult = {
  method: "function";
  bucket: string;
  path: string;
  size: number;
  generation?: string;
  md5?: string;
  elapsedMs: number;
  correlationId: string;
};

export type UploadViaFunctionErrorDetails = {
  code?: string;
  message?: string;
  details?: unknown;
};

export class UploadViaFunctionError extends Error {
  code?: string;
  status?: number;
  details?: unknown;
  method: "function" = "function";
  constructor(message: string, opts?: { code?: string; status?: number; details?: unknown }) {
    super(message);
    this.name = "UploadViaFunctionError";
    this.code = opts?.code;
    this.status = opts?.status;
    this.details = opts?.details;
  }
}

function resolveUploadUrl(): string {
  return resolveFunctionUrl("VITE_SCAN_UPLOAD_URL", "uploadScanPhotoHttp");
}

function buildUploadError(params: {
  message: string;
  code?: string;
  status?: number;
  details?: unknown;
}): UploadViaFunctionError {
  return new UploadViaFunctionError(params.message, {
    code: params.code,
    status: params.status,
    details: params.details,
  });
}

function parseJsonSafe(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function uploadViaFunction(params: {
  token: string;
  scanId: string;
  view: "front" | "back" | "left" | "right";
  file: Blob;
  correlationId: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  onProgress?: (info: { bytesTransferred: number; totalBytes: number }) => void;
}): Promise<UploadViaFunctionResult> {
  const startedAt = Date.now();
  const timeoutMs =
    typeof params.timeoutMs === "number" && Number.isFinite(params.timeoutMs)
      ? Math.max(1000, params.timeoutMs)
      : 45_000;
  const controller = new AbortController();
  const onAbort = () => {
    try {
      controller.abort();
    } catch {
      // ignore
    }
  };
  if (params.signal) {
    if (params.signal.aborted) onAbort();
    else {
      try {
        params.signal.addEventListener("abort", onAbort, { once: true });
      } catch {
        // ignore
      }
    }
  }
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let timeoutFired = false;
  timeoutId = setTimeout(() => {
    timeoutFired = true;
    onAbort();
  }, timeoutMs);

  const cleanup = () => {
    if (timeoutId != null) clearTimeout(timeoutId);
    if (params.signal) {
      try {
        params.signal.removeEventListener("abort", onAbort);
      } catch {
        // ignore
      }
    }
  };

  try {
    params.onProgress?.({
      bytesTransferred: 0,
      totalBytes: (params.file as any)?.size ?? 1,
    });
    const form = new FormData();
    form.append("file", params.file, `${params.view}.jpg`);
    form.append("scanId", params.scanId);
    form.append("view", params.view);
    form.append("correlationId", params.correlationId);

    const appCheckHeader = await getAppCheckTokenHeader().catch(() => ({}));
    const response = await fetch(resolveUploadUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.token}`,
        "X-Correlation-Id": params.correlationId,
        ...appCheckHeader,
      },
      body: form,
      signal: controller.signal,
    });
    const text = await response.text();
    const payload = text ? parseJsonSafe(text) : null;
    if (!response.ok) {
      const errPayload = (payload || {}) as UploadViaFunctionErrorDetails;
      throw buildUploadError({
        message:
          errPayload.message ||
          `Upload failed (${response.status})` ||
          "Upload failed.",
        code: errPayload.code ? `function/${errPayload.code}` : `function/${response.status}`,
        status: response.status,
        details: errPayload.details ?? errPayload,
      });
    }
    if (!payload || payload.ok !== true) {
      const errPayload = (payload || {}) as UploadViaFunctionErrorDetails;
      throw buildUploadError({
        message: errPayload.message || "Upload failed.",
        code: errPayload.code ? `function/${errPayload.code}` : "function/unknown",
        status: response.status,
        details: errPayload.details ?? errPayload,
      });
    }
    const data = payload as UploadViaFunctionResponse;
    params.onProgress?.({
      bytesTransferred: data.size ?? (params.file as any)?.size ?? 1,
      totalBytes: data.size ?? (params.file as any)?.size ?? 1,
    });
    return {
      method: "function",
      bucket: data.bucket,
      path: data.path,
      size: data.size,
      generation: data.generation,
      md5: data.md5,
      elapsedMs: Date.now() - startedAt,
      correlationId: params.correlationId,
    };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      if (timeoutFired) {
        const timeoutErr: any = buildUploadError({
          message: "Upload timed out.",
          code: "upload_timeout",
        });
        throw timeoutErr;
      }
      const cancelled: any = buildUploadError({
        message: "Upload cancelled.",
        code: "upload_cancelled",
      });
      throw cancelled;
    }
    if (err instanceof UploadViaFunctionError) throw err;
    if (err instanceof TypeError) {
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      const errCode = offline ? "upload_offline" : "cors_blocked";
      throw buildUploadError({
        message: offline
          ? "Connection lost during upload."
          : "Upload blocked by network/CORS.",
        code: errCode,
      });
    }
    throw err;
  } finally {
    cleanup();
  }
}

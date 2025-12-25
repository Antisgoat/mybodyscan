import { auth } from "@/lib/firebase";
import { appCheck } from "@/lib/appCheck";
import { getIdToken } from "firebase/auth";
import { getToken as getAppCheckToken } from "firebase/app-check";
import { ApiError } from "@/lib/http";

export type XhrProgress = {
  loaded: number;
  total: number;
  lastProgressAt: number;
};

type XhrUploadJsonOptions = {
  url: string;
  formData: FormData;
  timeoutMs: number;
  stallTimeoutMs: number;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  onProgress?: (progress: XhrProgress) => void;
};

async function buildAuthHeaders(): Promise<Record<string, string>> {
  const u = auth.currentUser;
  const [idToken, ac] = await Promise.all([
    u ? getIdToken(u, /*forceRefresh*/ false).catch(() => "") : Promise.resolve(""),
    appCheck ? getAppCheckToken(appCheck, false).catch(() => null) : Promise.resolve(null),
  ]);
  const h: Record<string, string> = {};
  if (idToken) h.Authorization = `Bearer ${idToken}`;
  if (ac?.token) h["X-Firebase-AppCheck"] = ac.token;
  return h;
}

function isOfflineNow(): boolean {
  try {
    return typeof navigator !== "undefined" && navigator.onLine === false;
  } catch {
    return false;
  }
}

export async function xhrUploadFormDataJson<T = any>(
  opts: XhrUploadJsonOptions
): Promise<{ data: T; status: number }> {
  const timeoutMs = Math.max(1, Number(opts.timeoutMs || 0));
  const stallTimeoutMs = Math.max(250, Number(opts.stallTimeoutMs || 0));
  const authHeaders = await buildAuthHeaders();
  const mergedHeaders = { ...authHeaders, ...(opts.headers ?? {}) };

  const startedAt = Date.now();
  let lastProgressAt = startedAt;
  let lastLoaded = 0;

  return await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    let stallTimer: number | null = null;
    let timeoutTimer: number | null = null;

    const cleanup = () => {
      if (stallTimer != null) window.clearInterval(stallTimer);
      if (timeoutTimer != null) window.clearTimeout(timeoutTimer);
      stallTimer = null;
      timeoutTimer = null;
      try {
        xhr.upload.onprogress = null;
        xhr.onerror = null;
        xhr.onabort = null;
        xhr.onload = null;
      } catch {
        // ignore
      }
      if (opts.signal) {
        try {
          opts.signal.removeEventListener("abort", abortHandler);
        } catch {
          // ignore
        }
      }
    };

    const safeReject = (err: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const safeResolve = (data: T, status: number) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ data, status });
    };

    const abortHandler = () => {
      try {
        xhr.abort();
      } catch {
        // ignore
      }
      const err: any = new Error("Request aborted.");
      err.name = "AbortError";
      safeReject(err);
    };

    if (opts.signal) {
      if (opts.signal.aborted) {
        abortHandler();
        return;
      }
      opts.signal.addEventListener("abort", abortHandler, { once: true });
    }

    const emitProgress = (loaded: number, total: number) => {
      const now = Date.now();
      if (loaded !== lastLoaded) {
        lastLoaded = loaded;
        lastProgressAt = now;
      }
      try {
        opts.onProgress?.({ loaded, total, lastProgressAt: now });
      } catch {
        // ignore
      }
    };

    stallTimer = window.setInterval(() => {
      if (settled) return;
      const now = Date.now();
      if (now - lastProgressAt < stallTimeoutMs) return;
      // Treat offline as an immediate, retryable failure.
      if (isOfflineNow()) {
        try {
          xhr.abort();
        } catch {
          // ignore
        }
        const err: any = new Error("Connection lost.");
        err.code = "upload_offline";
        err.wasOffline = true;
        safeReject(err);
        return;
      }
      // iOS Safari: uploads can “pause” forever; abort to allow caller retry/fallback.
      try {
        xhr.abort();
      } catch {
        // ignore
      }
      const err: any = new Error("Upload started but no bytes were sent.");
      err.code = "upload_no_progress";
      safeReject(err);
    }, 500);

    timeoutTimer = window.setTimeout(() => {
      if (settled) return;
      try {
        xhr.abort();
      } catch {
        // ignore
      }
      const err: any = new Error("Upload timed out.");
      err.code = "upload_timeout";
      safeReject(err);
    }, timeoutMs);

    xhr.upload.onprogress = (evt) => {
      const loaded = Math.max(0, Number(evt.loaded || 0));
      const total = Math.max(1, Number(evt.total || 0));
      emitProgress(loaded, total);
    };

    xhr.onerror = () => {
      const err: any = new ApiError("Network request failed", 0);
      err.code = "xhr/network_error";
      safeReject(err);
    };

    xhr.onabort = () => {
      if (settled) return;
      const err: any = new Error("Request aborted.");
      err.name = "AbortError";
      safeReject(err);
    };

    xhr.onload = () => {
      const status = typeof xhr.status === "number" ? xhr.status : 0;
      const text = typeof xhr.responseText === "string" ? xhr.responseText : "";
      let parsed: any = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = null;
      }
      if (status >= 200 && status < 300) {
        safeResolve((parsed ?? (undefined as any)) as T, status);
        return;
      }
      const code = parsed?.error?.code || parsed?.code;
      const message =
        parsed?.error?.message ||
        parsed?.message ||
        (status ? `${status} ${xhr.statusText || ""}`.trim() : "Upload failed.");
      safeReject(new ApiError(String(message), status || 0, code, parsed));
    };

    try {
      xhr.open("POST", opts.url, true);
      for (const [k, v] of Object.entries(mergedHeaders)) {
        if (typeof v === "string" && v.trim()) {
          xhr.setRequestHeader(k, v);
        }
      }
      // Initial progress “heartbeat” so UI can show something immediately.
      emitProgress(0, Math.max(1, (opts.formData as any)?.size ?? 1));
      xhr.send(opts.formData);
    } catch (err) {
      safeReject(err);
    }
  });
}


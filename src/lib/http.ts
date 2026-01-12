import { getIdToken } from "@/auth/client";
import { appCheck } from "@/lib/appCheck";
import { getToken as getAppCheckToken } from "firebase/app-check";
import {
  fallbackDirectUrl,
  noteWorkingUrl,
  looksLikeHtml,
} from "@/lib/api/urls";

export type FallbackKey =
  | "systemHealth"
  | "coachChat"
  | "nutritionSearch"
  | "createCheckout"
  | "createCustomerPortal"
  | "deleteAccount";

export type ApiOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: any; // will be JSON.stringified if object
  timeoutMs?: number; // default 15000
  retries?: number; // default 2 (total 3 attempts)
  retryBaseMs?: number; // default 400 (backoff)
  expectJson?: boolean; // default true
  signal?: AbortSignal; // optional external abort (e.g. wall-clock deadline)
};

export class ApiError extends Error {
  status: number;
  code?: string;
  data?: any;
  constructor(message: string, status = 0, code?: string, data?: any) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

async function getAuthHeaders() {
  const [idToken, ac] = await Promise.all([
    getIdToken({ forceRefresh: false }).then((t) => t || "").catch(() => ""),
    appCheck
      ? getAppCheckToken(appCheck, false).catch(() => null)
      : Promise.resolve(null),
  ]);
  const h: Record<string, string> = {};
  if (idToken) h.Authorization = `Bearer ${idToken}`;
  if (ac?.token) h["X-Firebase-AppCheck"] = ac.token;
  return h;
}

function toJsonBody(body: any): {
  headers: Record<string, string>;
  payload: BodyInit | undefined;
} {
  if (body == null) return { headers: {}, payload: undefined };
  if (
    typeof body === "string" ||
    body instanceof Blob ||
    body instanceof FormData
  ) {
    return { headers: {}, payload: body as any };
  }
  return {
    headers: { "Content-Type": "application/json" },
    payload: JSON.stringify(body),
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function apiFetch<T = any>(
  url: string,
  opts: ApiOptions = {}
): Promise<T> {
  const {
    method = "GET",
    headers = {},
    body,
    timeoutMs = 15000,
    retries = 2,
    retryBaseMs = 400,
    expectJson = true,
    signal,
  } = opts;

  const authHeaders = await getAuthHeaders();
  const { headers: bodyHdr, payload } = toJsonBody(body);
  const merged = { ...authHeaders, ...bodyHdr, ...headers };

  let attempt = 0;
  let lastErr: any = null;

  while (attempt <= retries) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const abortFromExternal = () => ctrl.abort();
    try {
      if (signal) {
        if (signal.aborted) {
          clearTimeout(t);
          throw Object.assign(new Error("Request aborted."), { name: "AbortError" });
        }
        signal.addEventListener("abort", abortFromExternal, { once: true });
      }
      const res = await fetch(url, {
        method,
        headers: merged,
        body: payload,
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (signal) {
        try {
          signal.removeEventListener("abort", abortFromExternal);
        } catch {
          // ignore
        }
      }

      const contentType = res.headers.get("content-type") || "";
      let preview: string | null = null;
      if (
        expectJson &&
        (contentType.includes("text/html") ||
          contentType.includes("text/plain") ||
          !contentType)
      ) {
        try {
          const clone = res.clone();
          preview = await clone.text();
          if (preview && looksLikeHtml(preview, contentType)) {
            throw new ApiError(
              "Received HTML instead of JSON",
              res.status || 0,
              undefined,
              { raw: preview, contentType }
            );
          }
        } catch (err) {
          if (err instanceof ApiError) {
            throw err;
          }
        }
      }

      const parseJson = async () => {
        try {
          return await res.clone().json();
        } catch {
          if (preview != null) return { raw: preview, contentType };
          return null;
        }
      };

      if (!res.ok) {
        const data = expectJson ? await parseJson() : null;
        const htmlRaw = typeof data?.raw === "string" ? data.raw : preview;
        const msg = (
          data?.error?.message ||
          data?.message ||
          (htmlRaw && looksLikeHtml(htmlRaw, contentType)
            ? "HTML response"
            : `${res.status} ${res.statusText}`)
        ).toString();
        const code = data?.error?.code || data?.code || undefined;
        // Retry on typical transient errors:
        if ([429, 502, 503, 504].includes(res.status) && attempt < retries) {
          const backoff = retryBaseMs * Math.pow(2, attempt);
          await sleep(backoff);
          attempt++;
          continue;
        }
        throw new ApiError(msg, res.status, code, data);
      }

      if (!expectJson) return undefined as unknown as T;
      const data = await parseJson();
      // Some functions return raw strings/empty — tolerate it
      return (data ?? (undefined as any)) as T;
    } catch (e: any) {
      clearTimeout(t);
      if (signal) {
        try {
          signal.removeEventListener("abort", abortFromExternal);
        } catch {
          // ignore
        }
      }
      const isAbort = e?.name === "AbortError";
      const netLike =
        isAbort ||
        e?.message?.includes?.("NetworkError") ||
        e?.message?.includes?.("Failed to fetch");
      if (netLike && attempt < retries) {
        const backoff = retryBaseMs * Math.pow(2, attempt);
        await sleep(backoff);
        attempt++;
        lastErr = e;
        continue;
      }
      lastErr = e;
      break;
    }
  }

  if (lastErr instanceof ApiError) throw lastErr;
  throw new ApiError(lastErr?.message || "Network request failed", 0);
}

// Convenience wrappers
export const apiGet = <T = any>(u: string, o: ApiOptions = {}) =>
  apiFetch<T>(u, { ...o, method: "GET" });
export const apiPost = <T = any>(u: string, body?: any, o: ApiOptions = {}) =>
  apiFetch<T>(u, { ...o, method: "POST", body });

export async function apiFetchWithFallback<T = any>(
  key: FallbackKey,
  url: string,
  opts: ApiOptions = {}
): Promise<T> {
  try {
    const data = await apiFetch<T>(url, opts);
    noteWorkingUrl(key, url);
    return data;
  } catch (error) {
    const err = error as ApiError | (Error & { status?: number; data?: any });
    const raw = typeof err?.data?.raw === "string" ? err.data.raw : undefined;
    const contentType =
      typeof err?.data?.contentType === "string"
        ? err.data.contentType
        : undefined;
    const msg = String(err?.message || "");
    const htmlish =
      (raw ? looksLikeHtml(raw, contentType) : false) ||
      looksLikeHtml(msg, contentType);
    const status =
      (err as ApiError)?.status ??
      (typeof err?.status === "number" ? err.status : 0);

    if (!htmlish && status > 0 && status < 500) {
      throw err;
    }

    const direct = fallbackDirectUrl(key);
    const data = await apiFetch<T>(direct, opts);
    noteWorkingUrl(key, direct);
    return data;
  }
}

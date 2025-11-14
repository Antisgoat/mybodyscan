import { auth, appCheck } from "@/lib/firebase";
import { getIdToken } from "firebase/auth";
import { getToken as getAppCheckToken } from "firebase/app-check";

export type ApiOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: any;                   // will be JSON.stringified if object
  timeoutMs?: number;           // default 15000
  retries?: number;             // default 2 (total 3 attempts)
  retryBaseMs?: number;         // default 400 (backoff)
  expectJson?: boolean;         // default true
};

export class ApiError extends Error {
  status: number;
  code?: string;
  data?: any;
  constructor(message: string, status = 0, code?: string, data?: any) {
    super(message);
    this.status = status; this.code = code; this.data = data;
  }
}

async function getAuthHeaders() {
  const u = auth.currentUser;
  const [idToken, ac] = await Promise.all([
    u ? getIdToken(u, /*forceRefresh*/ false).catch(() => "") : Promise.resolve(""),
    getAppCheckToken(appCheck, false).catch(() => null),
  ]);
  const h: Record<string, string> = {};
  if (idToken) h.Authorization = `Bearer ${idToken}`;
  if (ac?.token) h["X-Firebase-AppCheck"] = ac.token;
  return h;
}

function toJsonBody(body: any): { headers: Record<string,string>; payload: BodyInit | undefined } {
  if (body == null) return { headers: {}, payload: undefined };
  if (typeof body === "string" || body instanceof Blob || body instanceof FormData) {
    return { headers: {}, payload: body as any };
  }
  return { headers: { "Content-Type": "application/json" }, payload: JSON.stringify(body) };
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export async function apiFetch<T = any>(url: string, opts: ApiOptions = {}): Promise<T> {
  const {
    method = "GET",
    headers = {},
    body,
    timeoutMs = 15000,
    retries = 2,
    retryBaseMs = 400,
    expectJson = true,
  } = opts;

  const authHeaders = await getAuthHeaders();
  const { headers: bodyHdr, payload } = toJsonBody(body);
  const merged = { ...authHeaders, ...bodyHdr, ...headers };

  let attempt = 0; let lastErr: any = null;

  while (attempt <= retries) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method, headers: merged, body: payload, signal: ctrl.signal });
      clearTimeout(t);

      // Try parse JSON if requested
      const parseJson = async () => {
        try { return await res.json(); } catch { return null; }
      };

      if (!res.ok) {
        const data = expectJson ? await parseJson() : null;
        const msg = (data?.error?.message || data?.message || `${res.status} ${res.statusText}`).toString();
        const code = (data?.error?.code || data?.code || undefined);
        // Retry on typical transient errors:
        if ([429, 502, 503, 504].includes(res.status) && attempt < retries) {
          const backoff = retryBaseMs * Math.pow(2, attempt);
          await sleep(backoff);
          attempt++; continue;
        }
        throw new ApiError(msg, res.status, code, data);
      }

      if (!expectJson) return undefined as unknown as T;
      const data = await parseJson();
      // Some functions return raw strings/empty — tolerate it
      return (data ?? (undefined as any)) as T;
    } catch (e: any) {
      clearTimeout(t);
      const isAbort = e?.name === "AbortError";
      const netLike = isAbort || e?.message?.includes?.("NetworkError") || e?.message?.includes?.("Failed to fetch");
      if (netLike && attempt < retries) {
        const backoff = retryBaseMs * Math.pow(2, attempt);
        await sleep(backoff);
        attempt++; lastErr = e; continue;
      }
      lastErr = e; break;
    }
  }

  if (lastErr instanceof ApiError) throw lastErr;
  throw new ApiError(lastErr?.message || "Network request failed", 0);
}

// Convenience wrappers
export const apiGet  = <T=any>(u: string, o: ApiOptions = {}) => apiFetch<T>(u, { ...o, method: "GET" });
export const apiPost = <T=any>(u: string, body?: any, o: ApiOptions = {}) => apiFetch<T>(u, { ...o, method: "POST", body });

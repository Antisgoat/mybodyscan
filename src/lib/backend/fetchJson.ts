import { getFunctionsOrigin, urlJoin } from "@/lib/backend/functionsOrigin";
import { isCapacitorNative } from "@/lib/platform/isNative";

export type BackendError = Error & {
  status: number;
  correlationId?: string;
  payload?: unknown;
  origin: string;
};

function withApiPrefix(endpoint: string): string {
  return endpoint.startsWith("/api/") ? endpoint : `/api${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
}

export async function fetchJson<T>(
  endpoint: string,
  init: RequestInit = {},
  timeoutMs = 15000
): Promise<T> {
  const origin = getFunctionsOrigin();
  const url = urlJoin(origin, endpoint);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers || {}),
      },
      credentials: "omit",
    });

    const correlationId =
      response.headers.get("x-correlation-id") ||
      response.headers.get("X-Correlation-Id") ||
      undefined;

    const text = await response.text().catch(() => "");
    const payload = text
      ? (() => {
          try {
            return JSON.parse(text);
          } catch {
            return { message: text };
          }
        })()
      : {};

    if (!response.ok) {
      if (
        response.status === 404 &&
        isCapacitorNative() &&
        !endpoint.startsWith("/api/")
      ) {
        return fetchJson<T>(withApiPrefix(endpoint), init, timeoutMs);
      }
      const error = new Error(
        (payload as any)?.message ||
          (payload as any)?.error ||
          `HTTP ${response.status}`
      ) as BackendError;
      error.status = response.status;
      error.correlationId = correlationId;
      error.payload = payload;
      error.origin = origin;
      if (import.meta.env.DEV) {
        console.warn("backend_fetch_failed", { endpoint, status: error.status, correlationId });
      }
      throw error;
    }

    return payload as T;
  } catch (cause: any) {
    if (cause?.name === "AbortError") {
      const error = new Error("Request timed out") as BackendError;
      error.status = 0;
      error.origin = origin;
      throw error;
    }
    if (typeof cause?.status === "number") throw cause;
    const error = new Error(cause?.message || "network_error") as BackendError;
    error.status = 0;
    error.origin = origin;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

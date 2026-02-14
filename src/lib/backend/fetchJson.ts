import { urlJoin } from "@/lib/backend/functionsOrigin";
import { getApiBaseUrl } from "@/lib/api/baseUrl";

export type BackendError = Error & {
  status: number;
  correlationId?: string;
  payload?: unknown;
  origin: string;
};

export async function fetchJson<T>(
  endpoint: string,
  init: RequestInit = {},
  timeoutMs = 15000
): Promise<T> {
  const origin = getApiBaseUrl();
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
            return null;
          }
        })()
      : {};

    if (text && payload === null) {
      const error = new Error("Received non-JSON response from server") as BackendError;
      error.status = response.status || 502;
      error.correlationId = correlationId;
      error.payload = { raw: text.slice(0, 500) };
      error.origin = origin;
      throw error;
    }

    if (!response.ok) {
      const error = new Error(
        (payload as any)?.message ||
          (payload as any)?.error ||
          `HTTP ${response.status}`
      ) as BackendError;
      error.status = response.status;
      error.correlationId = correlationId;
      error.payload = payload;
      error.origin = origin;
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

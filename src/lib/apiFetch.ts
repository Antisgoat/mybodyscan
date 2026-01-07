import { getAppCheckTokenHeader } from "@/lib/appCheck";
import { getIdToken } from "@/lib/authFacade";
import { assertNoForbiddenStorageRestUrl } from "@/lib/storage/restGuards";

function normalizeUrl(input: RequestInfo): RequestInfo {
  if (typeof input !== "string") return input;
  if (input.startsWith("http://") || input.startsWith("https://")) return input;
  if (input.startsWith("/api")) return input;
  if (input.startsWith("/")) return `/api${input}`;
  return `/api/${input}`;
}

export async function apiFetch(input: RequestInfo, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  if (
    !headers.has("Content-Type") &&
    init.body &&
    !(init.body instanceof FormData)
  ) {
    headers.set("Content-Type", "application/json");
  }

  try {
    const token = await getIdToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  } catch (error) {
    console.warn("apiFetch.token_failed", error);
  }

  // Server uses this to normalize "day" boundaries for diary/history queries.
  if (!headers.has("x-tz-offset-mins")) {
    try {
      headers.set("x-tz-offset-mins", String(new Date().getTimezoneOffset()));
    } catch {
      // ignore
    }
  }

  const appCheckHeaders = await getAppCheckTokenHeader();
  Object.entries(appCheckHeaders).forEach(([key, value]) => {
    headers.set(key, value);
  });

  assertNoForbiddenStorageRestUrl(
    typeof input === "string"
      ? input
      : typeof (input as any)?.url === "string"
        ? (input as any).url
        : undefined,
    "apiFetch"
  );
  const url = normalizeUrl(input);
  // Default to same-origin credentials. Cross-origin requests (e.g. Functions
  // direct URLs) should not force credentialed mode, which can trigger CORS
  // failures in Safari.
  try {
    return await fetch(url, { ...init, headers, credentials: "same-origin" });
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("api_fetch_failed", { url, error });
    }
    throw error;
  }
}

export async function apiFetchJson<T = any>(
  input: RequestInfo,
  init: RequestInit = {}
): Promise<T> {
  const response = await apiFetch(input, init);
  const contentType = response.headers.get("Content-Type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => ({}))
    : await response.text().catch(() => "");

  if (!response.ok) {
    const message =
      typeof payload === "string"
        ? payload
        : payload?.error || `HTTP ${response.status}`;
    const url =
      typeof input === "string"
        ? normalizeUrl(input)
        : typeof (input as any)?.url === "string"
          ? (input as any).url
          : "unknown";
    const error = new Error(message) as Error & {
      status?: number;
      url?: string;
      payload?: unknown;
    };
    error.status = response.status;
    error.url = url;
    error.payload = payload;
    if (import.meta.env.DEV) {
      console.warn("api_http_error", {
        url,
        status: response.status,
        payload,
      });
    }
    if (
      payload &&
      typeof payload === "object" &&
      "code" in payload &&
      typeof payload.code === "string"
    ) {
      (error as Error & { code?: string }).code = payload.code;
    }
    throw error;
  }

  return payload as T;
}

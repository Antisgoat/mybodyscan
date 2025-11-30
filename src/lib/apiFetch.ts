import { getAppCheckTokenHeader } from "@/lib/appCheck";
import { auth } from "@/lib/firebase";

function normalizeUrl(input: RequestInfo): RequestInfo {
  if (typeof input !== "string") return input;
  if (input.startsWith("http://") || input.startsWith("https://")) return input;
  if (input.startsWith("/api")) return input;
  if (input.startsWith("/")) return `/api${input}`;
  return `/api/${input}`;
}

export async function apiFetch(input: RequestInfo, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type") && init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  try {
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken();
      headers.set("Authorization", `Bearer ${token}`);
    }
  } catch {}

  const appCheckHeaders = await getAppCheckTokenHeader();
  Object.entries(appCheckHeaders).forEach(([key, value]) => {
    headers.set(key, value);
  });

  const url = normalizeUrl(input);
  return fetch(url, { ...init, headers, credentials: "include" });
}

export async function apiFetchJson<T = any>(input: RequestInfo, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(input, init);
  const contentType = response.headers.get("Content-Type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => ({}))
    : await response.text().catch(() => "");

  if (!response.ok) {
    const message = typeof payload === "string" ? payload : payload?.error || `HTTP ${response.status}`;
    const error = new Error(message);
    if (payload && typeof payload === "object" && "code" in payload && typeof payload.code === "string") {
      (error as Error & { code?: string }).code = payload.code;
    }
    throw error;
  }

  return payload as T;
}

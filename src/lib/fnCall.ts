import { ensureAppCheck, getAppCheckTokenHeader } from "@/lib/appCheck";
import { fnUrl } from "@/lib/env";
import { requireIdToken } from "@/auth/mbs-auth";
import { canUseNativeHttp, nativeHttpRequest } from "@/lib/nativeHttp";

export type FnCallError = Error & {
  status?: number;
  endpoint?: string;
  payload?: unknown;
  code?: string;
};

async function parseJsonOrText(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function messageFromPayload(payload: unknown, status: number): string {
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    return trimmed.length ? trimmed : `fn_error_${status}`;
  }
  if (payload && typeof payload === "object") {
    const anyPayload = payload as any;
    const msg =
      (typeof anyPayload.error === "string" && anyPayload.error) ||
      (typeof anyPayload.error?.message === "string" && anyPayload.error.message) ||
      (typeof anyPayload.message === "string" && anyPayload.message) ||
      "";
    return msg.trim().length ? msg.trim() : `fn_error_${status}`;
  }
  return `fn_error_${status}`;
}

function codeFromPayload(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const anyPayload = payload as any;
  const code =
    (typeof anyPayload.code === "string" && anyPayload.code) ||
    (typeof anyPayload.error?.code === "string" && anyPayload.error.code) ||
    undefined;
  return code || undefined;
}

function parseNativePayload(data: unknown): unknown {
  if (data == null) return {};
  if (typeof data === "string") {
    const trimmed = data.trim();
    if (!trimmed) return {};
    try {
      return JSON.parse(trimmed);
    } catch {
      return data;
    }
  }
  return data;
}

export async function fnJson<T = unknown>(
  path: string,
  options: {
    method?: "GET" | "POST";
    body?: unknown;
    headers?: Record<string, string>;
    signal?: AbortSignal;
  } = {}
): Promise<T> {
  const endpoint = fnUrl(path);
  const idToken = await requireIdToken();

  await ensureAppCheck();
  const appCheckHeaders = await getAppCheckTokenHeader();

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(options.method === "POST" ? { "Content-Type": "application/json" } : {}),
    Authorization: `Bearer ${idToken}`,
    ...(options.headers ?? {}),
  };
  Object.entries(appCheckHeaders).forEach(([k, v]) => {
    headers[k] = v;
  });

  const method = options.method ?? "POST";
  const body =
    method === "POST" ? JSON.stringify(options.body ?? {}) : undefined;

  if (canUseNativeHttp()) {
    try {
      const response = await nativeHttpRequest({
        url: endpoint,
        method,
        headers,
        data: body ?? undefined,
      });
      const payload = parseNativePayload(response.data);
      if (response.status < 200 || response.status >= 300) {
        const err: FnCallError = new Error(
          messageFromPayload(payload, response.status)
        );
        err.status = response.status;
        err.endpoint = endpoint;
        err.payload = payload;
        err.code = codeFromPayload(payload);
        if (import.meta.env.DEV) {
          console.warn("fn_http_error", {
            endpoint,
            path,
            status: response.status,
            payload,
          });
        }
        throw err;
      }
      return payload as T;
    } catch (cause: any) {
      const err: FnCallError = new Error(
        typeof cause?.message === "string" && cause.message.length
          ? cause.message
          : "network_error"
      );
      err.endpoint = endpoint;
      err.payload = { cause: cause?.message ?? String(cause) };
      if (import.meta.env.DEV) {
        console.warn("fn_fetch_failed", { endpoint, path, cause });
      }
      throw err;
    }
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method,
      headers,
      body,
      signal: options.signal,
      // Bearer-token requests to Functions should never rely on cookies; omitting
      // credentials avoids Safari "Load failed" CORS edge-cases.
      credentials: "omit",
    });
  } catch (cause: any) {
    const err: FnCallError = new Error(
      typeof cause?.message === "string" && cause.message.length
        ? cause.message
        : "network_error"
    );
    err.endpoint = endpoint;
    err.payload = { cause: cause?.message ?? String(cause) };
    if (import.meta.env.DEV) {
      console.warn("fn_fetch_failed", { endpoint, path, cause });
    }
    throw err;
  }

  const payload = await parseJsonOrText(response);
  if (!response.ok) {
    const err: FnCallError = new Error(
      messageFromPayload(payload, response.status)
    );
    err.status = response.status;
    err.endpoint = endpoint;
    err.payload = payload;
    err.code = codeFromPayload(payload);
    if (import.meta.env.DEV) {
      console.warn("fn_http_error", {
        endpoint,
        path,
        status: response.status,
        payload,
      });
    }
    throw err;
  }

  return payload as T;
}

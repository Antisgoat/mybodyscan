import { Capacitor, CapacitorHttp } from "@capacitor/core";

const DEFAULT_TIMEOUT_MS = 15_000;

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value, typeof window !== "undefined" ? window.location.href : undefined);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function headersToObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function buildResponseHeaders(
  rawHeaders: Record<string, string> | undefined
): Headers {
  const headers = new Headers();
  if (!rawHeaders) return headers;
  for (const [key, value] of Object.entries(rawHeaders)) {
    if (value == null) continue;
    headers.set(key, String(value));
  }
  return headers;
}

async function extractRequestBody(
  request: Request
): Promise<{ data?: any; contentType?: string }> {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD") {
    return {};
  }
  const contentType = request.headers.get("content-type") || undefined;
  if (!request.body) {
    return { contentType };
  }

  const clone = request.clone();
  if (contentType?.includes("application/json")) {
    const text = await clone.text();
    if (!text) return { data: "", contentType };
    try {
      return { data: JSON.parse(text), contentType };
    } catch {
      return { data: text, contentType };
    }
  }

  if (
    contentType?.includes("text/") ||
    contentType?.includes("application/x-www-form-urlencoded") ||
    contentType?.includes("application/xml")
  ) {
    const text = await clone.text();
    return { data: text, contentType };
  }

  const buffer = await clone.arrayBuffer();
  return { data: new Uint8Array(buffer), contentType };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TypeError("Failed to fetch"));
    }, timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export function installNativeFetchPolyfill(options?: {
  timeoutMs?: number;
}): void {
  if (!Capacitor?.isNativePlatform?.()) return;
  if (typeof globalThis === "undefined") return;
  const anyGlobal = globalThis as typeof globalThis & {
    __mbsNativeFetchInstalled?: boolean;
    __mbsNativeFetchOriginal?: typeof fetch;
  };
  if (anyGlobal.__mbsNativeFetchInstalled) return;
  if (typeof anyGlobal.fetch !== "function") return;

  const originalFetch = anyGlobal.fetch.bind(globalThis);
  anyGlobal.__mbsNativeFetchOriginal = originalFetch;

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const nativeFetch: typeof fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = request.url;

    if (!isHttpUrl(url)) {
      return originalFetch(input as RequestInfo, init);
    }

    const method = request.method.toUpperCase();
    const headers = new Headers(request.headers);
    const { data } = await extractRequestBody(request);

    try {
      const responsePromise = CapacitorHttp.request({
        url,
        method,
        headers: headersToObject(headers),
        data,
      });

      const response = await withTimeout(responsePromise, timeoutMs);
      const responseHeaders = buildResponseHeaders(response.headers);
      let body: BodyInit | null = null;

      if (response.data == null) {
        body = null;
      } else if (typeof response.data === "string") {
        body = response.data;
      } else if (
        response.data instanceof ArrayBuffer ||
        ArrayBuffer.isView(response.data)
      ) {
        body = response.data as ArrayBuffer;
      } else {
        body = JSON.stringify(response.data);
        if (!responseHeaders.has("content-type")) {
          responseHeaders.set("content-type", "application/json");
        }
      }

      return new Response(body, {
        status: response.status,
        statusText: response.statusText || "",
        headers: responseHeaders,
      });
    } catch (error) {
      console.error("[native fetch] request failed", error);
      throw new TypeError("Failed to fetch");
    }
  };

  anyGlobal.fetch = nativeFetch;
  anyGlobal.__mbsNativeFetchInstalled = true;
}

if (typeof globalThis !== "undefined") {
  installNativeFetchPolyfill();
}

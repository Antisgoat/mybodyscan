import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { ensureAppCheck } from "@/lib/appCheck";
import { apiFetch } from "@/lib/apiFetch";

type FallbackSpec = {
  callableName: string;
  httpPath: string;
  method?: "GET" | "POST";
  mapHttpToClient: (r: any) => any;
  mapRequestToHttp?: (payload: unknown) => Record<string, unknown> | undefined;
};

let callableHttpFallbackActive = false;
const fallbackListeners = new Set<(active: boolean) => void>();

function notifyFallbackListeners() {
  for (const listener of fallbackListeners) {
    try {
      listener(callableHttpFallbackActive);
    } catch (error) {
      console.warn("backend_fallback_listener_error", error);
    }
  }
}

function isAppCheckLikeError(err: any): boolean {
  const code = err?.code || err?.error?.status || "";
  return [
    "app_check_required",
    "failed-precondition",
    "permission-denied",
    "unauthenticated",
  ].some((key) => String(code).includes(key));
}

export async function callWithHttpFallback<TReq = unknown, TRes = unknown>(
  spec: FallbackSpec,
  payload?: TReq,
): Promise<TRes> {
  try {
    await ensureAppCheck();
    const fn = httpsCallable<TReq, TRes>(functions, spec.callableName);
    const { data } = await fn(payload as TReq);
    return data as TRes;
  } catch (err: any) {
    if (!isAppCheckLikeError(err)) throw err;
    callableHttpFallbackActive = true;
    notifyFallbackListeners();
    const method = spec.method || "POST";
    const httpPayload = spec.mapRequestToHttp ? spec.mapRequestToHttp(payload) : payload;
    const init: RequestInit = {
      method,
      headers: { "Content-Type": "application/json" },
    };
    let path = spec.httpPath;
    if (method === "POST") {
      (init as any).body = JSON.stringify(httpPayload ?? {});
    } else if (method === "GET" && httpPayload && typeof httpPayload === "object") {
      const params = new URLSearchParams();
      Object.entries(httpPayload as Record<string, unknown>).forEach(([key, value]) => {
        if (value == null) return;
        params.append(key, String(value));
      });
      const qs = params.toString();
      if (qs) {
        path = `${path}${path.includes("?") ? "&" : "?"}${qs}`;
      }
    }
    try {
      const response = await apiFetch(path, init);
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        (error as Error & { httpStatus?: number }).httpStatus = response.status;
        throw error;
      }
      const contentType = response.headers.get("Content-Type") || "";
      const payloadJson = contentType.includes("application/json")
        ? await response.json().catch(() => ({}))
        : await response.text();
      return spec.mapHttpToClient(payloadJson);
    } catch (httpError) {
      const error = httpError instanceof Error ? httpError : new Error(String(httpError));
      (error as Error & { httpFallbackAttempted?: boolean }).httpFallbackAttempted = true;
      throw error;
    }
  }
}

export function isCallableHttpFallbackActive() {
  return callableHttpFallbackActive;
}

export function subscribeCallableHttpFallback(listener: (active: boolean) => void) {
  fallbackListeners.add(listener);
  listener(callableHttpFallbackActive);
  return () => {
    fallbackListeners.delete(listener);
  };
}

export const backend = {
  async createCheckout(input: {
    priceId: string;
    mode: "payment" | "subscription";
    promoCode?: string;
  }) {
    return callWithHttpFallback<typeof input, { sessionId?: string; url?: string }>(
      {
        callableName: "createCheckout",
        httpPath: "/api/createCheckout",
        method: "POST",
        mapHttpToClient: (json: any) => ({
          sessionId: json?.sessionId || json?.id || null,
          url: json?.url ?? null,
        }),
      },
      input,
    );
  },

  async coachChat(input: { message: string }) {
    return callWithHttpFallback<typeof input, { text: string }>(
      {
        callableName: "coachChat",
        httpPath: "/api/coach/chat",
        method: "POST",
        mapHttpToClient: (json: any) => ({ text: json?.text ?? json?.answer ?? json?.reply ?? "" }),
      },
      input,
    );
  },

  async nutritionSearch(input: { q: string }) {
    return callWithHttpFallback<typeof input, { items: any[] }>(
      {
        callableName: "nutritionSearch",
        httpPath: "/api/nutrition/search",
        method: "GET",
        mapHttpToClient: (json: any) => ({ items: json?.items ?? json?.results ?? [] }),
      },
      input,
    );
  },

  async nutritionBarcode(input: { upc: string }) {
    return callWithHttpFallback<typeof input, { item?: any; items?: any[] }>(
      {
        callableName: "nutritionBarcode",
        httpPath: "/api/nutrition/barcode",
        method: "GET",
        mapRequestToHttp: (payload) => {
          const body = (payload as { upc?: string })?.upc;
          return body ? { code: body } : undefined;
        },
        mapHttpToClient: (json: any) => ({ item: json?.item, items: json?.items ?? json?.results }),
      },
      input,
    );
  },
};

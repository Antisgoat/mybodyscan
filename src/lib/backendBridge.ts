import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { apiFetch } from "@/lib/apiFetch";

type FallbackSpec = {
  callableName: string;
  httpPath: string;
  method?: "GET" | "POST";
  mapHttpToClient: (r: any) => any;
  mapRequestToHttp?: (payload: unknown) => Record<string, unknown> | undefined;
};

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
    const fn = httpsCallable<TReq, TRes>(functions, spec.callableName);
    const { data } = await fn(payload as TReq);
    return data as TRes;
  } catch (err: any) {
    if (!isAppCheckLikeError(err)) throw err;
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
    const json = await apiFetch(path, init);
    return spec.mapHttpToClient(json);
  }
}

export const backend = {
  async createCheckout(input: {
    priceId: string;
    mode: "payment" | "subscription";
    promoCode?: string;
  }) {
    return callWithHttpFallback<typeof input, { sessionId: string }>(
      {
        callableName: "createCheckout",
        httpPath: "/api/billing/create-checkout-session",
        method: "POST",
        mapHttpToClient: (json: any) => ({ sessionId: json?.sessionId || json?.id }),
      },
      input,
    );
  },

  async coachChat(input: { message: string }) {
    return callWithHttpFallback<typeof input, { reply: string }>(
      {
        callableName: "coachChat",
        httpPath: "/api/coach/chat",
        method: "POST",
        mapHttpToClient: (json: any) => ({ reply: json?.reply ?? json?.answer ?? "" }),
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

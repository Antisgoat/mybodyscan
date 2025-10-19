import { auth } from "@/lib/firebase";
import { toast } from "@/hooks/use-toast";
import { fnUrl, FUNCTIONS_BASE, HAS_USDA } from "@/lib/env";
import type { FoodItem, NutritionSource, ServingOption } from "@/lib/nutrition/types";
import { getAppCheckToken } from "@/appCheck";
import {
  activateOfflineDemo,
  offlineCoachResponse,
  offlineNutritionSearch,
  shouldFallbackToOffline,
} from "@/lib/demoOffline";

const API_FUNCTION_MAP: Record<string, string> = {
  "/api/nutrition/search": "nutritionSearch",
  "/api/nutrition/barcode": "nutritionBarcode",
  "/api/coach/chat": "coachChat",
  "/api/scan/start": "startScanSession",
  "/api/scan/submit": "submitScan",
};

export function resolveApiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (!FUNCTIONS_BASE) {
    return normalized;
  }
  const [pathname, query = ""] = normalized.split("?");
  const functionId = API_FUNCTION_MAP[pathname];
  const targetPath = functionId ? `/${functionId}` : pathname;
  const base = fnUrl(targetPath);
  if (!base) {
    return normalized;
  }
  return query ? `${base}?${query}` : base;
}

export function nutritionFnUrl(params?: Record<string, string>) {
  const base = fnUrl("/nutritionSearch");
  if (!base) return "";
  const url = new URL(base);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }
  return url.toString();
}

type NutritionSearchPayload = {
  items?: unknown[];
  primarySource?: "USDA" | "OFF";
  fallbackUsed?: boolean;
  sourceErrors?: Record<string, unknown>;
};

export async function nutritionSearch(
  query: string,
  init?: RequestInit,
  options?: { forceOpenFoodFacts?: boolean },
): Promise<NutritionSearchPayload> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { items: [] };
  }
  const params = new URLSearchParams({ q: trimmed });
  if (options?.forceOpenFoodFacts) {
    params.set("source", "off");
  }
  const url = resolveApiUrl(`/api/nutrition/search?${params.toString()}`);
  const headers = new Headers(init?.headers ?? undefined);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
  const idTokenPromise: Promise<string | null> = headers.has("Authorization")
    ? Promise.resolve<string | null>(null)
    : Promise.resolve(auth.currentUser ? auth.currentUser.getIdToken() : null);
  const [idToken, appCheckToken] = await Promise.all([idTokenPromise, getAppCheckToken()]);
  if (appCheckToken) headers.set("X-Firebase-AppCheck", appCheckToken);
  if (idToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${idToken}`);
  }
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers,
      credentials: "include",
      method: "GET",
    });
  } catch (error) {
    if (shouldFallbackToOffline(error)) {
      activateOfflineDemo("nutrition");
      return offlineNutritionSearch(trimmed);
    }
    throw error;
  }
  if (!response.ok) {
    if (shouldFallbackToOffline({ status: response.status })) {
      activateOfflineDemo("nutrition");
      return offlineNutritionSearch(trimmed);
    }
    const err: any = new Error(`rewrite_status_${response.status}`);
    err.status = response.status;
    throw err;
  }
  return (await response.json()) as NutritionSearchPayload;
}

export async function coachChat(payload: { message: string }) {
  const message = payload.message?.trim();
  if (!message) {
    const error: any = new Error("message_required");
    error.code = "message_required";
    throw error;
  }
  const user = auth.currentUser;
  if (!user) {
    const error: any = new Error("auth_required");
    error.code = "auth_required";
    throw error;
  }
  const [idToken, appCheckToken] = await Promise.all([user.getIdToken(), getAppCheckToken()]);
  if (!appCheckToken) {
    const error: any = new Error("app_check_unavailable");
    error.code = "app_check_unavailable";
    throw error;
  }
  const url = resolveApiUrl(`/api/coach/chat`);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
        ...(appCheckToken ? { "X-Firebase-AppCheck": appCheckToken } : {}),
      },
      credentials: "include",
      body: JSON.stringify({ message, text: message }),
    });
  } catch (error) {
    if (shouldFallbackToOffline(error)) {
      activateOfflineDemo("coach");
      return offlineCoachResponse(message);
    }
    throw error;
  }
  if (!response.ok) {
    if (shouldFallbackToOffline({ status: response.status })) {
      activateOfflineDemo("coach");
      return offlineCoachResponse(message);
    }
    const data = await response.json().catch(() => ({}));
    const error: any = new Error(typeof data?.error === "string" ? data.error : "coach_chat_failed");
    error.status = response.status;
    throw error;
  }
  return response.json();
}

const NUTRITION_SEARCH_TIMEOUT_MS = 5000;

function normalizeServingOption(raw: any, index: number): ServingOption | null {
  const grams = Number(raw?.grams);
  if (!Number.isFinite(grams) || grams <= 0) return null;
  const label =
    typeof raw?.label === "string" && raw.label.trim().length
      ? raw.label.trim()
      : `${Math.round(grams * 100) / 100} g`;
  const idRaw = raw?.id;
  const id =
    typeof idRaw === "string" && idRaw.trim().length
      ? idRaw.trim()
      : typeof idRaw === "number"
      ? String(idRaw)
      : `srv-${index}`;
  return {
    id,
    label,
    grams: Math.round(grams * 100) / 100,
    isDefault: Boolean(raw?.isDefault),
  };
}

function normalizeSource(rawSource: unknown): NutritionSource {
  if (rawSource === "OFF" || rawSource === "Open Food Facts") {
    return "OFF";
  }
  return "USDA";
}

function sanitizeFoodItem(raw: any): FoodItem {
  const brand = typeof raw?.brand === "string" && raw.brand.trim().length ? raw.brand.trim() : null;

  const base = raw?.basePer100g ?? {};
  const basePer100g = {
    kcal: Number(base?.kcal) || 0,
    protein: Number(base?.protein) || 0,
    carbs: Number(base?.carbs) || 0,
    fat: Number(base?.fat) || 0,
  };

  const servings = Array.isArray(raw?.servings)
    ? (raw.servings as any[])
        .map((option, index) => normalizeServingOption(option, index))
        .filter((option): option is ServingOption => Boolean(option))
    : [];

  if (!servings.length) {
    servings.push({ id: "100g", label: "100 g", grams: 100, isDefault: true });
  }

  if (!servings.some((option) => option.isDefault)) {
    servings[0]!.isDefault = true;
  }

  const servingRaw = raw?.serving ?? {};
  const perServingRaw = raw?.per_serving ?? {};
  const per100Raw = raw?.per_100g ?? undefined;

  const defaultServing = servings.find((option) => option.isDefault) ?? servings[0];
  const servingGrams = typeof raw?.servingGrams === "number"
    ? raw.servingGrams
    : defaultServing?.grams ?? null;
  const per: "serving" | "100g" = raw?.per === "100g" ? "100g" : servingGrams === 100 ? "100g" : "serving";

  const source = normalizeSource(raw?.source);
  const resolvedPerServingKcal =
    typeof raw?.kcal === "number"
      ? raw.kcal
      : typeof perServingRaw?.kcal === "number"
      ? perServingRaw.kcal
      : per === "100g"
      ? basePer100g.kcal
      : null;
  const resolvedPerServingProtein =
    typeof raw?.protein === "number"
      ? raw.protein
      : typeof perServingRaw?.protein_g === "number"
      ? perServingRaw.protein_g
      : per === "100g"
      ? basePer100g.protein
      : null;
  const resolvedPerServingCarbs =
    typeof raw?.carbs === "number"
      ? raw.carbs
      : typeof perServingRaw?.carbs_g === "number"
      ? perServingRaw.carbs_g
      : per === "100g"
      ? basePer100g.carbs
      : null;
  const resolvedPerServingFat =
    typeof raw?.fat === "number"
      ? raw.fat
      : typeof perServingRaw?.fat_g === "number"
      ? perServingRaw.fat_g
      : per === "100g"
      ? basePer100g.fat
      : null;

  return {
    id: String(
      raw?.id ??
        raw?.fdcId ??
        raw?.gtin ??
        (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `food-${Math.random().toString(36).slice(2, 10)}`),
    ),
    name:
      typeof raw?.name === "string" && raw.name.trim().length ? raw.name.trim() : "Food",
    brand,
    source,
    kcal: resolvedPerServingKcal ?? basePer100g.kcal,
    protein: resolvedPerServingProtein ?? basePer100g.protein,
    carbs: resolvedPerServingCarbs ?? basePer100g.carbs,
    fat: resolvedPerServingFat ?? basePer100g.fat,
    servingGrams,
    per,
    basePer100g,
    servings,
    serving: {
      qty: typeof servingRaw?.qty === "number" ? servingRaw.qty : null,
      unit: typeof servingRaw?.unit === "string" ? servingRaw.unit : null,
      text:
        typeof servingRaw?.text === "string" && servingRaw.text.trim().length
          ? servingRaw.text.trim()
          : undefined,
    },
    per_serving: {
      kcal: typeof perServingRaw?.kcal === "number" ? perServingRaw.kcal : null,
      protein_g:
        typeof perServingRaw?.protein_g === "number" ? perServingRaw.protein_g : null,
      carbs_g:
        typeof perServingRaw?.carbs_g === "number" ? perServingRaw.carbs_g : null,
      fat_g: typeof perServingRaw?.fat_g === "number" ? perServingRaw.fat_g : null,
    },
    per_100g: per100Raw
      ? {
          kcal: typeof per100Raw?.kcal === "number" ? per100Raw.kcal : null,
          protein_g:
            typeof per100Raw?.protein_g === "number" ? per100Raw.protein_g : null,
          carbs_g: typeof per100Raw?.carbs_g === "number" ? per100Raw.carbs_g : null,
          fat_g: typeof per100Raw?.fat_g === "number" ? per100Raw.fat_g : null,
        }
      : undefined,
    fdcId:
      typeof raw?.fdcId === "number"
        ? raw.fdcId
        : typeof raw?.fdcId === "string" && raw.fdcId.trim().length && !Number.isNaN(Number(raw.fdcId))
        ? Number(raw.fdcId)
        : undefined,
    gtin:
      typeof raw?.gtin === "string" && raw.gtin.trim().length
        ? raw.gtin.trim()
        : undefined,
    raw: raw?.raw ?? raw,
  };
}

export async function fetchFoods(q: string): Promise<{
  items: FoodItem[];
  primarySource: "USDA" | "OFF" | null;
  fallbackUsed: boolean;
  sourceErrors: Record<string, unknown>;
}> {
  const query = q?.trim();
  if (!query) {
    return { items: [], primarySource: null, fallbackUsed: false, sourceErrors: {} };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NUTRITION_SEARCH_TIMEOUT_MS);

  try {
    let payload: NutritionSearchPayload | undefined;

    try {
      payload = await nutritionSearch(query, { signal: controller.signal }, {
        forceOpenFoodFacts: !HAS_USDA,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
      const fallbackBase = nutritionFnUrl({
        q: query,
        ...(HAS_USDA ? {} : { source: "off" }),
      });
      if (!fallbackBase) {
        payload = { items: [] } as NutritionSearchPayload;
      } else {
        const [fallbackIdToken, fallbackAppCheckToken] = await Promise.all([
          auth.currentUser ? auth.currentUser.getIdToken() : Promise.resolve<string | null>(null),
          getAppCheckToken(),
        ]);
        const fallbackHeaders = new Headers({
          Accept: "application/json",
        });
        if (fallbackAppCheckToken) {
          fallbackHeaders.set("X-Firebase-AppCheck", fallbackAppCheckToken);
        }
        if (fallbackIdToken) {
          fallbackHeaders.set("Authorization", `Bearer ${fallbackIdToken}`);
        }
        const response = await fetch(fallbackBase, {
          method: "GET",
          signal: controller.signal,
          headers: fallbackHeaders,
        });
        if (!response.ok) {
          const fallbackError: any = new Error(`fn_status_${response.status}`);
          fallbackError.status = response.status;
          throw fallbackError;
        }
        payload = (await response.json().catch(() => ({ items: [] as any[] }))) as NutritionSearchPayload;
      }
    }

    const items = Array.isArray(payload?.items) ? payload!.items.map(sanitizeFoodItem) : [];
    const primarySource =
      payload?.primarySource === "USDA" || payload?.primarySource === "OFF"
        ? payload.primarySource
        : (items[0]?.source as NutritionSource | undefined) ?? null;
    return {
      items,
      primarySource,
      fallbackUsed: Boolean(payload?.fallbackUsed),
      sourceErrors: payload?.sourceErrors ?? {},
    };
  } finally {
    clearTimeout(timer);
  }
}

async function authedFetch(path: string, init?: RequestInit) {
  const url = fnUrl(path);
  if (!url) {
    toast({ title: "Server not configured" });
    return new Response(null, { status: 503 });
  }
  const t = await auth.currentUser?.getIdToken();
  if (!t) throw new Error("Authentication required");
  return fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${t}`,
      ...(init?.headers || {}),
    },
  });
}

export async function startScan(params?: Record<string, unknown>) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error("Authentication required");
  }
  const response = await fetch(resolveApiUrl("/api/scan/start"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(params ?? {}),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "scan_start_failed");
  }
  return (await response.json()) as { scanId: string };
}

export async function openStripeCheckout(priceId: string, plan: string, mode: "payment" | "subscription") {
  const r = await authedFetch(`/createCheckout?priceId=${encodeURIComponent(priceId)}&plan=${encodeURIComponent(plan)}&mode=${mode}`);
  const { url } = await r.json();
  if (url) window.location.href = url;
}

export async function openStripeCheckoutByProduct(productId: string) {
  const r = await authedFetch(`/createCheckout?priceId=${encodeURIComponent(productId)}`);
  const { url } = await r.json();
  if (url) window.location.href = url;
}

export async function openStripePortal() {
  const r = await authedFetch(`/createCustomerPortal`);
  const { url } = await r.json();
  if (url) window.open(url, "_blank", "noopener,noreferrer");
}

async function handleJsonResponse(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export async function beginPaidScan(payload: {
  scanId: string;
  hashes: string[];
  gateScore: number;
  mode: "2" | "4";
}) {
  const response = await authedFetch(`/beginPaidScan`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const data = await handleJsonResponse(response);
  if (!response.ok) {
    const message = data?.error || data?.reason || "authorization_failed";
    throw new Error(message);
  }
  return data as { ok: boolean; remainingCredits?: number };
}

export async function recordGateFailure() {
  const response = await authedFetch(`/recordGateFailure`, { method: "POST" });
  const data = await handleJsonResponse(response);
  if (!response.ok) {
    throw new Error(data?.error || "gate_failure_not_recorded");
  }
  return data as { ok: boolean; remaining?: number };
}

export async function refundIfNoResult(scanId: string) {
  const response = await authedFetch(`/refundIfNoResult`, {
    method: "POST",
    body: JSON.stringify({ scanId }),
  });
  const data = await handleJsonResponse(response);
  if (!response.ok) {
    throw new Error(data?.error || "refund_failed");
  }
  return data as { ok: boolean; refunded: boolean };
}
export { authedFetch };

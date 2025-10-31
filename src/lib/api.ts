import { toast } from "@/hooks/use-toast";
import { fnUrl } from "@/lib/env";
import type { FoodItem, ServingOption } from "@/lib/nutrition/types";
import { auth as firebaseAuth } from "@/lib/firebase";
import { ensureAppCheck, getAppCheckHeader } from "@/lib/appCheck";
import type { Auth, User } from "firebase/auth";
import { openExternal } from "./links";

async function getAuthContext(): Promise<{ auth: Auth; user: User | null }> {
  return { auth: firebaseAuth, user: firebaseAuth.currentUser };
}

async function requireAuthContext(): Promise<{ auth: Auth; user: User }> {
  const { auth, user } = await getAuthContext();
  if (!user) {
    const error: any = new Error("auth_required");
    error.code = "auth_required";
    throw error;
  }
  return { auth, user };
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

export async function nutritionSearch(
  query: string,
  init?: RequestInit,
): Promise<{ items?: unknown[] }> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { items: [] };
  }
  const url = `/api/nutrition/search?q=${encodeURIComponent(trimmed)}`;
  const headers = new Headers(init?.headers ?? undefined);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
  const idTokenPromise: Promise<string | null> = headers.has("Authorization")
    ? Promise.resolve<string | null>(null)
    : (async () => {
        const { user } = await getAuthContext();
        return user ? user.getIdToken() : null;
      })();
  await ensureAppCheck();
  const [idToken, appCheckHeaders] = await Promise.all([idTokenPromise, getAppCheckHeader()]);
  if (idToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${idToken}`);
  }
  if (appCheckHeaders["X-Firebase-AppCheck"]) {
    headers.set("X-Firebase-AppCheck", appCheckHeaders["X-Firebase-AppCheck"]);
  }
  const response = await fetch(url, {
    ...init,
    headers,
    credentials: "include",
    method: "GET",
  });
  if (!response.ok) {
    const err: any = new Error(`rewrite_status_${response.status}`);
    err.status = response.status;
    throw err;
  }
  return response.json();
}

const coachChatInFlight = new Map<string, AbortController>();

export async function coachChat(payload: { message: string }, options: { signal?: AbortSignal } = {}) {
  const message = payload.message?.trim();
  if (!message) {
    const error: any = new Error("message_required");
    error.code = "message_required";
    throw error;
  }
  const { user } = await requireAuthContext();
  const existing = coachChatInFlight.get(user.uid);
  if (existing && !existing.signal.aborted) {
    const error: any = new Error("coach_chat_in_flight");
    error.code = "coach_chat_in_flight";
    throw error;
  }
  await ensureAppCheck();
  const [idToken, appCheckHeaders] = await Promise.all([user.getIdToken(), getAppCheckHeader()]);
  const controller = new AbortController();
  coachChatInFlight.set(user.uid, controller);

  let removeListener: (() => void) | undefined;
  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort(options.signal.reason as any);
    } else {
      const abortListener = () => controller.abort(options.signal?.reason as any);
      options.signal.addEventListener("abort", abortListener, { once: true });
      removeListener = () => options.signal?.removeEventListener("abort", abortListener);
    }
  }

  try {
    const response = await fetch(`/api/coach/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
        ...(appCheckHeaders || {}),
      },
      credentials: "include",
      body: JSON.stringify({ message, text: message }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const error: any = new Error(typeof data?.error === "string" ? data.error : "coach_chat_failed");
      error.status = response.status;
      throw error;
    }
    return response.json();
  } finally {
    removeListener?.();
    coachChatInFlight.delete(user.uid);
  }
}

const NUTRITION_SEARCH_TIMEOUT_MS = 6000;

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
    source: raw?.source === "Open Food Facts" ? "Open Food Facts" : "USDA",
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

export async function fetchFoods(q: string): Promise<FoodItem[]> {
  const query = q?.trim();
  if (!query) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NUTRITION_SEARCH_TIMEOUT_MS);

  try {
    let payload: { items?: unknown[] } | undefined;

    try {
      payload = await nutritionSearch(query, { signal: controller.signal });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
      const fallbackBase = nutritionFnUrl({ q: query });
      if (!fallbackBase) {
        payload = { items: [] } as any;
      } else {
        const [fallbackIdToken] = await Promise.all([
          (async () => {
            const { user } = await getAuthContext();
            return user ? user.getIdToken() : null;
          })(),
        ]);
        const fallbackHeaders = new Headers({
          Accept: "application/json",
        });
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
        payload = await response.json().catch(() => ({ items: [] as any[] }));
      }
    }

    if (!Array.isArray(payload?.items)) {
      return [];
    }
    return payload.items.map(sanitizeFoodItem);
  } finally {
    clearTimeout(timer);
  }
}

const APP_CHECK_PATH_PREFIXES = ["/api/scan", "/api/coach", "/api/nutrition"] as const;

async function authedFetch(path: string, init?: RequestInit) {
  const url = fnUrl(path);
  if (!url) {
    toast({ title: "Server not configured" });
    return new Response(null, { status: 503 });
  }
  const { user } = await requireAuthContext();
  const t = await user.getIdToken();
  const needsAppCheck = APP_CHECK_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
  let appCheckHeaders: Record<string, string> = {};
  if (needsAppCheck) {
    await ensureAppCheck();
    appCheckHeaders = await getAppCheckHeader();
  }
  return fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${t}`,
      ...appCheckHeaders,
      ...(init?.headers || {}),
    },
  });
}

export async function startScan(params?: Record<string, unknown>) {
  const { user } = await requireAuthContext();
  const token = await user.getIdToken();
  await ensureAppCheck();
  const appCheckHeaders = await getAppCheckHeader();
  const response = await fetch("/api/scan/start", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(appCheckHeaders["X-Firebase-AppCheck"]
        ? { "X-Firebase-AppCheck": appCheckHeaders["X-Firebase-AppCheck"] }
        : {}),
    },
    body: JSON.stringify(params ?? {}),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "scan_start_failed");
  }
  return (await response.json()) as { scanId: string };
}

export async function openStripeCheckout(priceId: string) {
  const r = await authedFetch(`/createCheckout`, {
    method: "POST",
    body: JSON.stringify({ priceId }),
  });
  const { url } = await r.json();
  if (url) openExternal(url);
}

export async function openStripeCheckoutByProduct(productId: string) {
  const r = await authedFetch(`/createCheckout`, {
    method: "POST",
    body: JSON.stringify({ priceId: productId }),
  });
  const { url } = await r.json();
  if (url) openExternal(url);
}

export async function openStripePortal() {
  const r = await authedFetch(`/createCustomerPortal`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  const { url } = await r.json();
  if (url) openExternal(url);
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

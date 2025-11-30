import { toast } from "@/hooks/use-toast";
import { fnUrl } from "@/lib/env";
import type { FoodItem, ServingOption } from "@/lib/nutrition/types";
import { auth as firebaseAuth } from "@/lib/firebase";
import { ensureAppCheck, getAppCheckTokenHeader } from "@/lib/appCheck";
import { sanitizeFoodItem } from "@/features/nutrition/sanitize";
import type { Auth, User } from "firebase/auth";
import { apiFetchJson } from "./apiFetch";
import { openCustomerPortal as openPaymentsPortal, startCheckout as startCheckoutFlow } from "./payments";
import { isDemo } from "./demo";
import { mockBarcodeLookup, mockStartScan } from "./demoApiMocks";
import { authedJsonPost } from "./authedFetch";

const PRICE_IDS = {
  one: (import.meta.env.VITE_PRICE_ONE ?? "").trim(),
  monthly: (import.meta.env.VITE_PRICE_MONTHLY ?? "").trim(),
  yearly: (import.meta.env.VITE_PRICE_YEARLY ?? "").trim(),
  extra: (import.meta.env.VITE_PRICE_EXTRA ?? "").trim(),
} as const;

const CHECKOUT_MODES: Record<"one" | "monthly" | "yearly" | "extra", "payment" | "subscription"> = {
  one: "payment",
  monthly: "subscription",
  yearly: "subscription",
  extra: "payment",
};

function showDemoPreviewToast(description?: string) {
  toast({ title: "Demo preview — sign up to use this feature.", description });
}

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

export async function billingCheckout(
  plan: "one" | "monthly" | "yearly" | "extra",
): Promise<{ sessionId: string; url: string | null }> {
  if (!plan) {
    throw new Error("invalid_plan");
  }
  if (isDemo()) {
    const error: any = new Error("demo_blocked");
    error.code = "demo_blocked";
    throw error;
  }
  const priceId = PRICE_IDS[plan];
  if (!priceId) {
    const error: any = new Error("plan_unconfigured");
    error.code = "plan_unconfigured";
    throw error;
  }

  const { user } = await getAuthContext();
  if (!user) {
    const error: any = new Error("auth_required");
    error.code = "auth_required";
    throw error;
  }

  let payload: any;
  try {
    payload = await apiFetchJson("/billing/create-checkout-session", {
      method: "POST",
      body: JSON.stringify({ priceId, mode: CHECKOUT_MODES[plan] }),
    });
  } catch (error) {
    console.error("billing_checkout_error", error);
    throw error;
  }

  const sessionId = typeof payload?.sessionId === "string" ? payload.sessionId : "";
  if (!sessionId) {
    console.error("billing_checkout_missing_session", payload);
    const error: any = new Error("checkout_session_missing");
    error.code = "checkout_session_missing";
    throw error;
  }

  return { sessionId, url: typeof payload?.url === "string" ? payload.url : null };
}

export function nutritionFnUrl(params?: Record<string, string>) {
  const base = fnUrl("/nutrition/search");
  if (!base) return "";
  const url = new URL(base);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }
  return url.toString();
}

type NutritionSearchResponse = {
  results?: unknown[];
  items?: unknown[];
  source?: string | null;
  message?: string;
};

const DEMO_NUTRITION_RESULTS = [
  {
    id: "demo-grilled-chicken",
    name: "Grilled Chicken Breast (sample)",
    brand: "Demo meal",
    calories: 165,
    protein: 31,
    carbs: 0,
    fat: 4,
    source: "demo",
  },
  {
    id: "demo-chicken-salad",
    name: "Chicken Salad (sample)",
    brand: "Demo meal",
    calories: 240,
    protein: 20,
    carbs: 8,
    fat: 14,
    source: "demo",
  },
] satisfies Array<Record<string, unknown>>;

export async function nutritionSearch(
  query: string,
  init?: RequestInit,
): Promise<NutritionSearchResponse> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { results: [] };
  }
  if (isDemo()) {
    showDemoPreviewToast("Sample nutrition results are shown in demo mode.");
    return {
      results: DEMO_NUTRITION_RESULTS.map((item) => ({ ...item })),
      source: "demo",
      message: "demo_results",
    } satisfies NutritionSearchResponse;
  }

  const headers = new Headers(init?.headers ?? undefined);
  headers.set("Accept", "application/json");

  const qs = new URLSearchParams({ q: trimmed }).toString();

  let payload: NutritionSearchResponse | null = null;
  try {
    payload = (await apiFetchJson(`/nutrition/search?${qs}`, {
      method: "GET",
      signal: init?.signal,
      headers,
    })) as NutritionSearchResponse;
  } catch (error) {
    console.error("nutrition_search_http_error", error);
    throw error;
  }

  if (payload?.items && !payload.results) {
    payload.results = payload.items;
  }

  if (Array.isArray(payload?.results)) {
    payload.results = payload.results
      .map((item) => {
        const sanitized = sanitizeFoodItem(item);
        if (!sanitized) return null;
        return { ...item, ...sanitized };
      })
      .filter((item): item is Record<string, unknown> => Boolean(item));
  }

  return payload ?? { results: [] };
}

export async function nutritionBarcodeLookup(
  code: string,
  init?: RequestInit,
): Promise<NutritionSearchResponse> {
  const trimmed = code.trim();
  if (!trimmed) {
    return { results: [] };
  }
  if (isDemo()) {
    showDemoPreviewToast("Sample barcode matches are shown in demo mode.");
    return mockBarcodeLookup(trimmed);
  }
  const headers = new Headers(init?.headers ?? undefined);
  headers.set("Accept", "application/json");

  const query = new URLSearchParams({ code: trimmed }).toString();

  let payload: NutritionSearchResponse | null = null;
  try {
    payload = (await apiFetchJson(`/nutrition/barcode?${query}`, {
      ...init,
      headers,
      method: "GET",
    })) as NutritionSearchResponse;
  } catch (error) {
    console.error("nutrition_barcode_http_error", error);
    throw error;
  }

  if (payload?.items && !payload.results) {
    payload.results = payload.items;
  }

  if (Array.isArray(payload?.results)) {
    payload.results = payload.results
      .map((item) => {
        const sanitized = sanitizeFoodItem(item);
        if (!sanitized) return null;
        return { ...item, ...sanitized };
      })
      .filter((item): item is Record<string, unknown> => Boolean(item));
  }

  return payload ?? {};
}

export async function coachSend(message: string, options: { signal?: AbortSignal } = {}): Promise<string> {
  const trimmed = message.trim();
  if (!trimmed) {
    throw new Error("message_required");
  }

  const user = firebaseAuth.currentUser;
  if (!user && !isDemo()) {
    const authError: any = new Error("auth_required");
    authError.code = "auth_required";
    throw authError;
  }

  let payload: any = null;
  try {
    payload = await apiFetchJson("/coach/chat", {
      method: "POST",
      body: JSON.stringify({ message: trimmed, demo: isDemo() }),
      signal: options.signal,
    });
  } catch (error) {
    console.error("coach_send_http_error", error);
    throw error;
  }

  const reply = typeof payload?.reply === "string" ? payload.reply.trim() : "";
  if (!reply) {
    throw new Error("coach_send_failed");
  }
  return reply;
}

const NUTRITION_SEARCH_TIMEOUT_MS = 6000;
let nutritionSearchController: AbortController | null = null;

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

function normalizeFoodItem(raw: any): FoodItem {
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

  if (nutritionSearchController) {
    nutritionSearchController.abort();
  }

  const controller = new AbortController();
  nutritionSearchController = controller;
  const timer = setTimeout(() => controller.abort(), NUTRITION_SEARCH_TIMEOUT_MS);

  try {
    let payload: NutritionSearchResponse | undefined;

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
        if (!fallbackIdToken) {
          const authError: any = new Error("auth_required");
          authError.code = "auth_required";
          throw authError;
        }
        await ensureAppCheck();
        const fallbackAppCheckHeaders = await getAppCheckTokenHeader();
        Object.entries(fallbackAppCheckHeaders).forEach(([key, value]) => {
          fallbackHeaders.set(key, value);
        });
        const response = await fetch(fallbackBase, {
          method: "GET",
          signal: controller.signal,
          headers: fallbackHeaders,
          credentials: "include",
        });
        if (!response.ok) {
          const fallbackError: any = new Error(`fn_status_${response.status}`);
          fallbackError.status = response.status;
          throw fallbackError;
        }
        payload = await response.json().catch(() => ({ results: [] as any[] }));
      }
    }

    if (!Array.isArray(payload?.results)) {
      return [];
    }
    return payload.results.map(normalizeFoodItem);
  } finally {
    clearTimeout(timer);
    if (nutritionSearchController === controller) {
      nutritionSearchController = null;
    }
  }
}

async function authedFetch(path: string, init?: RequestInit) {
  const url = fnUrl(path);
  if (!url) {
    toast({ title: "Server not configured" });
    return new Response(null, { status: 503 });
  }
  const { user } = await requireAuthContext();
  const t = await user.getIdToken();
  const headers = new Headers(init?.headers ?? undefined);
  headers.set("Content-Type", headers.get("Content-Type") || "application/json");
  headers.set("Authorization", `Bearer ${t}`);
  await ensureAppCheck();
  const appCheckHeaders = await getAppCheckTokenHeader();
  Object.entries(appCheckHeaders).forEach(([key, value]) => {
    headers.set(key, value);
  });
  return fetch(url, {
    ...init,
    headers,
    credentials: "include",
  });
}

export async function startScan(params?: Record<string, unknown>) {
  if (isDemo()) {
    showDemoPreviewToast("Scans require an account. Showing sample data.");
    const mock = mockStartScan(params);
    return { scanId: mock.scanId };
  }
  try {
    const payload = (await apiFetchJson("/scan/start", {
      method: "POST",
      body: JSON.stringify(params ?? {}),
    })) as { scanId?: string };
    if (typeof payload?.scanId !== "string") {
      throw new Error("scan_start_failed");
    }
    return { scanId: payload.scanId };
  } catch (error: any) {
    if (error instanceof Error && error.message) {
      throw error;
    }
    throw new Error("scan_start_failed");
  }
}

export async function openStripeCheckout(priceId: string) {
  await startCheckoutFlow(priceId);
}

export async function openStripeCheckoutByProduct(productId: string) {
  await startCheckoutFlow(productId);
}

export async function openStripePortal() {
  await openPaymentsPortal();
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
  if (isDemo()) {
    showDemoPreviewToast("Demo preview — paid scans are disabled.");
    const mock = mockStartScan(payload);
    return { ok: true, remainingCredits: 0, scanId: mock.scanId, resultId: mock.resultId };
  }
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
  if (isDemo()) {
    return { ok: true, remaining: 0 };
  }
  const response = await authedFetch(`/recordGateFailure`, { method: "POST" });
  const data = await handleJsonResponse(response);
  if (!response.ok) {
    throw new Error(data?.error || "gate_failure_not_recorded");
  }
  return data as { ok: boolean; remaining?: number };
}

export async function refundIfNoResult(scanId: string) {
  if (isDemo()) {
    return { ok: true, refunded: false };
  }
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

export async function createCheckout(kind: "scan" | "sub_monthly" | "sub_annual", credits = 1) {
  await requireAuthContext();
  try {
    return (await apiFetchJson("/api/createCheckout", {
      method: "POST",
      body: JSON.stringify({ kind, credits }),
    })) as { url: string; id: string };
  } catch (error) {
    throw error instanceof Error ? error : new Error("checkout_failed");
  }
}

export async function createCustomerPortal() {
  await requireAuthContext();
  try {
    return (await apiFetchJson("/api/createCustomerPortal", {
      method: "POST",
      body: JSON.stringify({}),
    })) as { url: string };
  } catch (error) {
    throw error instanceof Error ? error : new Error("portal_failed");
  }
}
export { authedFetch };

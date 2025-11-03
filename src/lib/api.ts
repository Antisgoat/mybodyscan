import { toast } from "@/hooks/use-toast";
import { fnUrl } from "@/lib/env";
import type { FoodItem, ServingOption } from "@/lib/nutrition/types";
import { auth as firebaseAuth } from "@/lib/firebase";
import { ensureAppCheck, getAppCheckHeader } from "@/lib/appCheck";
import type { Auth, User } from "firebase/auth";
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

  const token = await user.getIdToken();
  const url = fnUrl("/billing/create-checkout-session");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ priceId, mode: CHECKOUT_MODES[plan] }),
  });

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    console.error("billing_checkout_error", payload);
    const message = typeof payload?.error === "string" ? payload.error : `checkout_status_${response.status}`;
    const error: any = new Error(message);
    error.status = response.status;
    error.body = payload;
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

  const endpoint = fnUrl("/nutrition/search");
  const url = new URL(endpoint);
  url.searchParams.set("q", trimmed);

  const headers = new Headers({ Accept: "application/json" });
  const user = firebaseAuth.currentUser;
  if (user) {
    try {
      const token = await user.getIdToken();
      headers.set("Authorization", `Bearer ${token}`);
    } catch (error) {
      console.warn("nutrition_search_token_failed", error);
    }
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    signal: init?.signal,
    headers,
  });

  let payload: NutritionSearchResponse | null = null;
  try {
    payload = (await response.json()) as NutritionSearchResponse;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    console.error("nutrition_search_http_error", payload);
    const error: any = new Error(typeof payload?.error === "string" ? payload.error : `status_${response.status}`);
    error.status = response.status;
    error.body = payload;
    throw error;
  }

  if (payload?.items && !payload.results) {
    payload.results = payload.items;
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
  const endpoint = fnUrl("/nutrition/search");
  const url = new URL(endpoint);
  url.searchParams.set("barcode", trimmed);

  const headers = new Headers(init?.headers ?? undefined);
  headers.set("Accept", "application/json");

  const user = firebaseAuth.currentUser;
  if (user && !headers.has("Authorization")) {
    try {
      const token = await user.getIdToken();
      headers.set("Authorization", `Bearer ${token}`);
    } catch (error) {
      console.warn("nutrition_barcode_token_failed", error);
    }
  }

  const response = await fetch(url.toString(), {
    ...init,
    headers,
    method: "GET",
  });

  let payload: NutritionSearchResponse | null = null;
  try {
    payload = (await response.json()) as NutritionSearchResponse;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    console.error("nutrition_barcode_http_error", payload);
    const err: any = new Error(typeof payload?.error === "string" ? payload.error : `status_${response.status}`);
    err.status = response.status;
    err.body = payload;
    throw err;
  }

  if (payload?.items && !payload.results) {
    payload.results = payload.items;
  }

  return payload ?? {};
}

export async function coachSend(message: string, options: { signal?: AbortSignal } = {}): Promise<string> {
  const trimmed = message.trim();
  if (!trimmed) {
    throw new Error("message_required");
  }

  const url = fnUrl("/coach/chat");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const user = firebaseAuth.currentUser;
  if (!user && !isDemo()) {
    const authError: any = new Error("auth_required");
    authError.code = "auth_required";
    throw authError;
  }
  if (user) {
    const token = await user.getIdToken();
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ question: trimmed, demo: isDemo() }),
    signal: options.signal,
  });

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    console.error("coach_send_http_error", payload);
    const error: any = new Error(typeof payload?.error === "string" ? payload.error : "coach_send_failed");
    error.status = response.status;
    error.code = payload?.error ?? error.message;
    throw error;
  }

  const reply = typeof payload?.answer === "string" ? payload.answer.trim() : "";
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
        const fallbackAppCheck = await getAppCheckHeader();
        if (fallbackAppCheck["X-Firebase-AppCheck"]) {
          fallbackHeaders.set("X-Firebase-AppCheck", fallbackAppCheck["X-Firebase-AppCheck"]);
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
  if (isDemo()) {
    showDemoPreviewToast("Scans require an account. Showing sample data.");
    const mock = mockStartScan(params);
    return { scanId: mock.scanId };
  }
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
  const { user } = await requireAuthContext();
  const token = await user.getIdToken();
  const response = await fetch("/api/createCheckout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ kind, credits }),
  });
  if (!response.ok) {
    const payload = await handleJsonResponse(response);
    const message = (payload as { error?: string })?.error || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return (await response.json()) as { url: string; id: string };
}

export async function createCustomerPortal() {
  const { user } = await requireAuthContext();
  const token = await user.getIdToken();
  const response = await fetch(fnUrl("/billing/portal"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({}),
  });
  if (!response.ok) {
    const payload = await handleJsonResponse(response);
    const message = (payload as { error?: string })?.error || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return (await response.json()) as { url: string };
}
export { authedFetch };

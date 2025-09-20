import { BASE as FUNCTIONS_BASE_URL } from "@/lib/api";

const USE_MOCKS = import.meta.env.DEV || import.meta.env.VITE_USE_SERVER_MOCKS === "1";
const TIMEOUT_MS = 3000;

export interface NutritionItem {
  id: string;
  name: string;
  brand?: string;
  upc?: string;
  source: "USDA" | "OFF" | "mock";
  serving: {
    text: string | null;
  };
  perServing: {
    kcal?: number | null;
    protein_g?: number | null;
    carbs_g?: number | null;
    fat_g?: number | null;
  };
  per100g?: NutritionItem["perServing"];
}

function withTimeout(promise: Promise<Response>) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  return promise.finally(() => clearTimeout(timer));
}

function normalizeItem(raw: any, source: "USDA" | "OFF"): NutritionItem {
  return {
    id: String(raw.id ?? crypto.randomUUID()),
    name: raw.name ?? "Food",
    brand: raw.brand ?? undefined,
    upc: raw.upc ?? undefined,
    source,
    serving: { text: raw.serving ?? null },
    perServing: {
      kcal: raw.per_serving?.kcal ?? null,
      protein_g: raw.per_serving?.protein_g ?? null,
      carbs_g: raw.per_serving?.carbs_g ?? null,
      fat_g: raw.per_serving?.fat_g ?? null,
    },
    per100g: raw.per_100g
      ? {
          kcal: raw.per_100g?.kcal ?? null,
          protein_g: raw.per_100g?.protein_g ?? null,
          carbs_g: raw.per_100g?.carbs_g ?? null,
          fat_g: raw.per_100g?.fat_g ?? null,
        }
      : undefined,
  };
}

function mockList(query: string): NutritionItem[] {
  const base = query || "sample";
  return [
    {
      id: `mock-${base}-1`,
      name: `${base} (USDA Mock)`,
      brand: "MyBodyScan",
      source: "mock",
      upc: undefined,
      serving: { text: "100 g" },
      perServing: { kcal: 180, protein_g: 20, carbs_g: 15, fat_g: 6 },
      per100g: { kcal: 180, protein_g: 20, carbs_g: 15, fat_g: 6 },
    },
    {
      id: `mock-${base}-2`,
      name: `${base} (OFF Mock)`,
      brand: "Sample Foods",
      source: "mock",
      upc: undefined,
      serving: { text: "1 serving" },
      perServing: { kcal: 210, protein_g: 18, carbs_g: 22, fat_g: 7 },
      per100g: undefined,
    },
  ];
}

async function callFunctions(path: string, options?: RequestInit) {
  if (!FUNCTIONS_BASE_URL) {
    throw new Error("functions_url_missing");
  }
  return withTimeout(
    fetch(`${FUNCTIONS_BASE_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers || {}),
      },
    })
  );
}

export async function searchFoods(query: string): Promise<NutritionItem[]> {
  if (!query) return [];
  if (USE_MOCKS && !FUNCTIONS_BASE_URL) {
    return mockList(query);
  }
  try {
    const response = await callFunctions(`/nutritionSearch?q=${encodeURIComponent(query)}`);
    if (!response.ok) {
      throw new Error(`search_${response.status}`);
    }
    const data = await response.json();
    if (!Array.isArray(data?.items)) {
      return USE_MOCKS ? mockList(query) : [];
    }
    return data.items.map((item: any) => normalizeItem(item, item.source === "OFF" ? "OFF" : "USDA"));
  } catch (error) {
    console.error("nutrition_search_error", error);
    if (USE_MOCKS) return mockList(query);
    throw error;
  }
}

export async function lookupBarcode(code: string): Promise<NutritionItem | null> {
  if (!code) return null;
  if (USE_MOCKS && !FUNCTIONS_BASE_URL) {
    return mockList(code)[0];
  }
  try {
    const response = await callFunctions(`/nutritionBarcode?code=${encodeURIComponent(code)}`);
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`barcode_${response.status}`);
    }
    const data = await response.json();
    if (!data?.item) return null;
    return normalizeItem(data.item, data.item.source === "OFF" ? "OFF" : "USDA");
  } catch (error) {
    console.error("nutrition_barcode_error", error);
    if (USE_MOCKS) return mockList(code)[0];
    throw error;
  }
}

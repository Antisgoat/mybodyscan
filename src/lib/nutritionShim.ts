import { FUNCTIONS_BASE, fnUrl } from "@/lib/env";

const USE_MOCKS = Boolean(import.meta.env.DEV) && !FUNCTIONS_BASE;
const TIMEOUT_MS = 3000;

export type NutritionSource = "USDA" | "OFF";

export interface NormalizedItem {
  id: string;
  name: string;
  brand?: string;
  source: NutritionSource;
  gtin?: string;
  fdcId?: number;
  serving: {
    qty: number | null;
    unit: string | null;
    text?: string | null;
  };
  per_serving: {
    kcal?: number | null;
    protein_g?: number | null;
    carbs_g?: number | null;
    fat_g?: number | null;
  };
  per_100g?: NormalizedItem["per_serving"];
}

function toNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? Number(num.toFixed(2)) : null;
}

function normalizeItem(raw: any): NormalizedItem {
  const serving = raw?.serving || {};
  const perServing = raw?.per_serving || {};
  const per100g = raw?.per_100g || raw?.per100g || undefined;
  const generatedId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `food-${Math.random().toString(36).slice(2, 10)}`;
  return {
    id: String(raw?.id ?? generatedId),
    name: typeof raw?.name === "string" ? raw.name : "Food",
    brand: typeof raw?.brand === "string" ? raw.brand : undefined,
    source: raw?.source === "OFF" ? "OFF" : "USDA",
    gtin: typeof raw?.gtin === "string" ? raw.gtin : typeof raw?.upc === "string" ? raw.upc : undefined,
    fdcId: toNumber(raw?.fdcId) ?? undefined,
    serving: {
      qty: toNumber(serving.qty ?? serving.quantity),
      unit: typeof serving.unit === "string" ? serving.unit : null,
      text: typeof serving.text === "string" ? serving.text : undefined,
    },
    per_serving: {
      kcal: toNumber(perServing.kcal),
      protein_g: toNumber(perServing.protein_g),
      carbs_g: toNumber(perServing.carbs_g),
      fat_g: toNumber(perServing.fat_g),
    },
    per_100g: per100g
      ? {
          kcal: toNumber(per100g.kcal),
          protein_g: toNumber(per100g.protein_g),
          carbs_g: toNumber(per100g.carbs_g),
          fat_g: toNumber(per100g.fat_g),
        }
      : undefined,
  };
}

function mockList(query: string): NormalizedItem[] {
  const base = query || "sample";
  return [
    {
      id: `mock-${base}-1`,
      name: `${base} (USDA Mock)` ,
      brand: "MyBodyScan",
      source: "USDA",
      serving: { qty: 100, unit: "g", text: "100 g" },
      per_serving: { kcal: 180, protein_g: 20, carbs_g: 15, fat_g: 6 },
      per_100g: { kcal: 180, protein_g: 20, carbs_g: 15, fat_g: 6 },
    },
    {
      id: `mock-${base}-2`,
      name: `${base} (OFF Mock)`,
      brand: "Sample Foods",
      source: "OFF",
      serving: { qty: 1, unit: "serving", text: "1 serving" },
      per_serving: { kcal: 210, protein_g: 18, carbs_g: 22, fat_g: 7 },
      per_100g: undefined,
    },
  ];
}

async function callFunctions(path: string, init?: RequestInit): Promise<Response | null> {
  const url = fnUrl(path);
  if (!url) {
    return null;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
  } catch (error) {
    clearTimeout(timer);
    throw error;
  }
}

export async function searchFoods(query: string): Promise<NormalizedItem[]> {
  if (!query?.trim()) return [];
  if (USE_MOCKS) {
    const mock = mockList(query.trim());
    if (!FUNCTIONS_BASE) {
      return mock;
    }
  }
  try {
    const response = await callFunctions(`/nutritionSearch?q=${encodeURIComponent(query.trim())}`);
    if (!response) {
      return USE_MOCKS ? mockList(query.trim()) : [];
    }
    if (!response.ok) {
      if (USE_MOCKS) return mockList(query.trim());
      return [];
    }
    const data = await response.json();
    if (!Array.isArray(data?.items)) {
      return USE_MOCKS ? mockList(query.trim()) : [];
    }
    return data.items.map((item: any) => normalizeItem(item));
  } catch (error) {
    console.error("nutrition_search_error", error);
    return USE_MOCKS ? mockList(query.trim()) : [];
  }
}

export async function lookupBarcode(code: string): Promise<NormalizedItem | null> {
  if (!code?.trim()) return null;
  if (USE_MOCKS) {
    const list = mockList(code.trim());
    if (!FUNCTIONS_BASE) {
      return list[0] ?? null;
    }
  }
  try {
    const response = await callFunctions(`/nutritionBarcode?code=${encodeURIComponent(code.trim())}`);
    if (!response) {
      return USE_MOCKS ? mockList(code.trim())[0] ?? null : null;
    }
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      if (USE_MOCKS) return mockList(code.trim())[0] ?? null;
      return null;
    }
    const data = await response.json();
    if (!data?.item) {
      return null;
    }
    return normalizeItem(data.item);
  } catch (error) {
    console.error("nutrition_barcode_error", error);
    return USE_MOCKS ? mockList(code.trim())[0] ?? null : null;
  }
}

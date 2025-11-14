import { apiPost } from "@/lib/http";
import { sanitizeFoodItem } from "@/lib/nutrition/sanitize";

export type FoodItem = {
  id?: string;
  name: string;
  brand?: string | null;
  calories?: number | null;  // kcal per serving
  protein?: number | null;   // g per serving
  carbs?: number | null;     // g per serving
  fat?: number | null;       // g per serving
  servingSize?: number | null;
  servingUnit?: string | null;
  source?: string | null;    // "USDA" | "OFF" | "INTERNAL" | ...
  barcode?: string | null;
  raw?: any;                 // debug/inspection
};

/** Heuristic normalizer so UI is resilient to upstream sources */
export function normalizeFoodItem(x: any): FoodItem {
  const base = sanitizeFoodItem(x);
  const sourceRaw = typeof x?.source === "string" ? x.source : x?.provider;
  const source = typeof sourceRaw === "string" && sourceRaw.length ? sourceRaw : null;
  const barcode = typeof x?.barcode === "string" ? x.barcode : typeof x?.code === "string" ? x.code : null;
  return {
    id: base.id,
    name: base.name,
    brand: base.brand ?? null,
    calories: base.calories ?? null,
    protein: base.protein ?? null,
    carbs: base.carbs ?? null,
    fat: base.fat ?? null,
    servingSize: base.serving ?? null,
    servingUnit: base.unit ?? null,
    source: source,
    barcode,
    raw: x,
  };
}

export async function nutritionSearch(q: string): Promise<FoodItem[]> {
  const data: any = await apiPost("/api/nutrition/search", { q });

  const arr = Array.isArray(data) ? data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : Array.isArray(data.data) ? data.data
    : [];

  return arr.map(normalizeFoodItem);
}

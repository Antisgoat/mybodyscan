import { apiFetchWithFallback } from "@/lib/http";
import { sanitizeFoodItem, type FoodItem } from "@/lib/nutrition/sanitize";
import { preferRewriteUrl } from "@/lib/api/urls";

export function normalizeFoodItem(x: any): FoodItem {
  return sanitizeFoodItem(x);
}

export async function nutritionSearch(q: string): Promise<FoodItem[]> {
  const url = preferRewriteUrl("nutritionSearch");
  const data: any = await apiFetchWithFallback("nutritionSearch", url, { method: "POST", body: { q } });

  const arr = Array.isArray(data) ? data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : Array.isArray(data.data) ? data.data
    : [];

  return arr.map(sanitizeFoodItem);
}

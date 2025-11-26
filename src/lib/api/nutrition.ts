import { apiFetch } from "@/lib/http";
import { sanitizeFoodItem, type FoodItem } from "@/lib/nutrition/sanitize";
import { resolveFunctionUrl } from "@/lib/api/functionsBase";

export function normalizeFoodItem(x: any): FoodItem {
  return sanitizeFoodItem(x);
}

export async function nutritionSearch(q: string): Promise<FoodItem[]> {
  const url = `${resolveFunctionUrl("VITE_API_BASE_URL", "api").replace(/\/$/, "")}/nutrition/search`;
  const data: any = await apiFetch(url, { method: "POST", body: { q } });

  const arr = Array.isArray(data) ? data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : Array.isArray(data.data) ? data.data
    : [];

  return arr.map(sanitizeFoodItem);
}

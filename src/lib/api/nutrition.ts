import { apiPost } from "@/lib/http";
import { sanitizeFoodItem, type FoodItem } from "@/lib/nutrition/sanitize";

export function normalizeFoodItem(x: any): FoodItem {
  return sanitizeFoodItem(x);
}

export async function nutritionSearch(q: string): Promise<FoodItem[]> {
  const data: any = await apiPost("/api/nutrition/search", { q });

  const arr = Array.isArray(data) ? data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : Array.isArray(data.data) ? data.data
    : [];

  return arr.map(sanitizeFoodItem);
}

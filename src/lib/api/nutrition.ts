import { apiFetchJson } from "@/lib/apiFetch";
import { sanitizeFoodItem, type FoodItem } from "@/lib/nutrition/sanitize";

export async function searchNutrition(term: string): Promise<FoodItem[]> {
  const trimmed = term.trim();
  const payload = await apiFetchJson<{ items?: unknown; results?: unknown }>("/nutrition/search", {
    method: "POST",
    body: JSON.stringify({ query: trimmed }),
  });

  const items = (payload?.items ?? payload?.results ?? []) as any[];
  return Array.isArray(items) ? items.map(sanitizeFoodItem).filter(Boolean) : [];
}

import { apiFetchJson } from "@/lib/apiFetch";
import { sanitizeFoodItem, type FoodItem } from "@/lib/nutrition/sanitize";

export interface DailyLogResponse {
  date: string;
  totals: any;
  meals: any[];
  source?: string;
}

export interface NutritionHistoryResponse {
  days: { date: string; totals: DailyLogResponse["totals"] }[];
}

export async function searchNutrition(term: string): Promise<FoodItem[]> {
  const trimmed = term.trim();
  const payload = await apiFetchJson<{ items?: unknown }>("/nutrition/search", {
    method: "POST",
    body: JSON.stringify({ query: trimmed }),
  });

  const items = (payload?.items ?? []) as any[];
  const normalized = Array.isArray(items) ? items.map(sanitizeFoodItem).filter(Boolean) : [];
  return normalized;
}

export async function fetchDailyLog(date?: string): Promise<DailyLogResponse> {
  const params = new URLSearchParams();
  if (date) {
    params.set("date", date);
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiFetchJson<DailyLogResponse>(`/nutrition/daily-log${suffix}`, { method: "GET" });
}

export async function fetchNutritionHistory(days?: number, anchorDate?: string): Promise<NutritionHistoryResponse> {
  const params = new URLSearchParams();
  if (days != null) {
    params.set("days", String(days));
  }
  if (anchorDate) {
    params.set("anchorDate", anchorDate);
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiFetchJson<NutritionHistoryResponse>(`/nutrition/history${suffix}`, { method: "GET" });
}

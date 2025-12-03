import { preferRewriteUrl } from "@/lib/api/urls";
import { apiFetchWithFallback } from "@/lib/http";
import { apiFetchJson } from "@/lib/apiFetch";
import { sanitizeFoodItem, type FoodItem } from "@/lib/nutrition/sanitize";

export type NutritionSearchRequest = {
  query: string;
  page?: number;
  pageSize?: number;
  sourcePreference?: "usda-first" | "off-first" | "combined";
};

export type NutritionSearchResponse =
  | { status: "ok"; results: FoodItem[]; source?: string | null; message?: string | null }
  | { status: "upstream_error"; results: FoodItem[]; message?: string | null };

export interface DailyLogResponse {
  date: string;
  totals: any;
  meals: any[];
  source?: string;
}

export interface NutritionHistoryResponse {
  days: { date: string; totals: DailyLogResponse["totals"] }[];
}

const NUTRITION_SEARCH_URL = preferRewriteUrl("nutritionSearch");

export async function nutritionSearch(
  term: string,
  init?: { page?: number; pageSize?: number; sourcePreference?: "usda-first" | "off-first" | "combined"; signal?: AbortSignal },
): Promise<NutritionSearchResponse> {
  const trimmed = term.trim();
  if (!trimmed) {
    return { status: "ok", results: [] };
  }

  const body: NutritionSearchRequest = { query: trimmed };
  if (init?.page != null) body.page = init.page;
  if (init?.pageSize != null) body.pageSize = init.pageSize;
  if (init?.sourcePreference) body.sourcePreference = init.sourcePreference;

  const payload = (await apiFetchWithFallback<NutritionSearchResponse>("nutritionSearch", NUTRITION_SEARCH_URL, {
    method: "POST",
    body,
    signal: init?.signal,
  })) as NutritionSearchResponse;

  const normalized = Array.isArray(payload?.results)
    ? payload.results.map(sanitizeFoodItem).filter(Boolean)
    : [];

  if (!payload || payload.status === "upstream_error") {
    return {
      status: "upstream_error",
      results: normalized,
      message: payload?.message ?? "Food database temporarily unavailable; please try again later.",
    } satisfies NutritionSearchResponse;
  }

  return {
    status: "ok",
    results: normalized,
    source: payload.source ?? null,
    message: payload.message ?? null,
  } satisfies NutritionSearchResponse;
}

export const searchNutrition = nutritionSearch;

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

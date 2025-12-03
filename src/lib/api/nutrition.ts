import { FirebaseError } from "firebase/app";
import { httpsCallable } from "firebase/functions";
import { apiFetchJson } from "@/lib/apiFetch";
import { sanitizeFoodItem, type FoodItem } from "@/lib/nutrition/sanitize";
import { ensureAppCheck } from "@/lib/appCheck";
import { functions } from "@/lib/firebase";

export type NutritionSearchRequest = {
  query: string;
  page?: number;
  pageSize?: number;
  sourcePreference?: "usda-first" | "off-first" | "combined";
};

export type NutritionSearchResponse =
  | { status: "ok"; results: FoodItem[]; source?: string | null; message?: string | null; debugId?: string | null }
  | { status: "upstream_error"; results: FoodItem[]; message?: string | null; debugId?: string | null };

export interface DailyLogResponse {
  date: string;
  totals: any;
  meals: any[];
  source?: string;
}

export interface NutritionHistoryResponse {
  days: { date: string; totals: DailyLogResponse["totals"] }[];
}

const nutritionSearchCallable = httpsCallable<NutritionSearchRequest, NutritionSearchResponse>(functions, "nutritionSearch");

function extractDebugId(error: FirebaseError): string | undefined {
  const serverResponse = error.customData?.serverResponse;
  const details = (serverResponse as any)?.details;
  if (details && typeof details === "object") {
    return details.debugId || details?.details?.debugId;
  }
  return undefined;
}

function normalizeNutritionError(error: unknown): Error {
  if (error instanceof FirebaseError) {
    const code = error.code ?? "";
    let message = "Unable to load nutrition results right now.";
    if (code.includes("invalid-argument")) {
      message = "Search query must not be empty.";
    } else if (code.includes("resource-exhausted")) {
      message = "You’re searching too quickly. Please slow down.";
    } else if (code.includes("unavailable") || code.includes("internal")) {
      message = "Food database temporarily unavailable; please try again later.";
    }
    const err = new Error(message);
    (err as Error & { code?: string; debugId?: string }).code = code || error.name;
    (err as Error & { code?: string; debugId?: string }).debugId = extractDebugId(error);
    return err;
  }
  if (error instanceof Error) return error;
  return new Error("Unable to load nutrition results right now.");
}

export async function nutritionSearch(
  term: string,
  init?: { page?: number; pageSize?: number; sourcePreference?: "usda-first" | "off-first" | "combined" },
): Promise<NutritionSearchResponse> {
  const trimmed = term.trim();
  if (!trimmed) {
    return { status: "ok", results: [] };
  }

  const body: NutritionSearchRequest = { query: trimmed };
  if (init?.page != null) body.page = init.page;
  if (init?.pageSize != null) body.pageSize = init.pageSize;
  if (init?.sourcePreference) body.sourcePreference = init.sourcePreference;

  await ensureAppCheck();

  try {
    const result = await nutritionSearchCallable(body);
    const payload = (result?.data ?? result) as NutritionSearchResponse;
    const normalized = Array.isArray(payload?.results)
      ? payload.results.map(sanitizeFoodItem).filter(Boolean)
      : [];

    if (!payload || payload.status === "upstream_error") {
      return {
        status: "upstream_error",
        results: normalized,
        message: payload?.message ?? "Food database temporarily unavailable; please try again later.",
        debugId: payload?.debugId ?? null,
      };
    }

    return {
      status: "ok",
      results: normalized,
      source: payload.source ?? null,
      message: payload.message ?? null,
      debugId: payload.debugId ?? null,
    };
  } catch (error) {
    throw normalizeNutritionError(error);
  }
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

import { sanitizeFoodItem as normalizeNutritionItem } from "@/features/nutrition/sanitize";
import { nutritionSearch as requestNutritionSearch, nutritionBarcodeLookup as requestNutritionBarcode } from "./api";
import { netError } from "./net";

type RequestOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

type BackendNutritionResponse = {
  results?: unknown[];
  source?: string;
  message?: string;
};

/** Normalized food shape returned to UI. */
export type FoodItem = {
  id: string; // stable id (usda:fdcId:<id> or off:barcode:<code>)
  name: string; // product or description
  brand?: string;
  calories?: number; // per 100g or per serving if available (best-effort)
  protein?: number; // grams
  fat?: number; // grams
  carbs?: number; // grams
  source: "usda" | "off";
};

export function sanitizeSearchTerm(q: string): string {
  return q.trim().replace(/\s+/g, " ").slice(0, 80);
}

export type SearchResult = {
  items: FoodItem[];
  status: string; // short user-friendly status ("Searching USDA…", "Trying Open Food Facts…", "No results", etc.)
};

/* ------------------ Tiny utilities ------------------ */

const CACHE_MAX = 100;
const CACHE_TTL_MS = 5 * 60 * 1000;

type CacheEntry = { v: unknown; t: number };
const cache = new Map<string, CacheEntry>();

const BARCODE_TIMEOUT_MS = 5_000;

function cacheGet<T>(k: string): T | undefined {
  const e = cache.get(k);
  if (!e) return;
  if (Date.now() - e.t > CACHE_TTL_MS) {
    cache.delete(k);
    return;
  }
  return e.v as T;
}
function cacheSet(k: string, v: unknown) {
  cache.set(k, { v, t: Date.now() });
  if (cache.size > CACHE_MAX) {
    const firstKey = cache.keys().next().value;
    if (firstKey) {
      cache.delete(firstKey);
    }
  }
}

function n(x: unknown): number | undefined {
  const v = typeof x === "string" && x.trim() === "" ? NaN : Number(x);
  return Number.isFinite(v) ? v : undefined;
}

/* ------------------ Public API ------------------ */

function normalizeFoodItem(raw: any): FoodItem {
  const idSource = raw?.id ?? raw?.uid ?? raw?.fdcId ?? raw?.code;
  const id = typeof idSource === "string" && idSource.trim().length
    ? idSource.trim()
    : typeof idSource === "number"
    ? String(idSource)
    : `food-${Math.random().toString(36).slice(2, 10)}`;

  const normalized = normalizeNutritionItem(raw) ?? {};
  const name = typeof normalized.name === "string" && normalized.name.trim().length
    ? normalized.name.trim()
    : typeof raw?.name === "string"
    ? raw.name.trim()
    : typeof raw?.description === "string"
    ? raw.description.trim()
    : "";
  const brand = normalized.brand ? normalized.brand : typeof raw?.brand === "string" ? raw.brand.trim() : undefined;
  const sourceRaw = typeof raw?.source === "string" ? raw.source.toLowerCase() : "";
  const source: FoodItem["source"] = sourceRaw === "off" || sourceRaw === "open food facts" ? "off" : "usda";

  return {
    id,
    name,
    brand,
    calories: normalized.kcal ?? (Number.isFinite(Number(raw?.calories)) ? Number(raw.calories) : undefined),
    protein: normalized.protein_g ?? (Number.isFinite(Number(raw?.protein)) ? Number(raw.protein) : undefined),
    carbs: normalized.carbs_g ?? (Number.isFinite(Number(raw?.carbs)) ? Number(raw.carbs) : undefined),
    fat: normalized.fat_g ?? (Number.isFinite(Number(raw?.fat)) ? Number(raw.fat) : undefined),
    source,
  };
}

/** Search foods by free text via backend function. Cached 5m. */
export async function searchFoods(q: string, options: RequestOptions = {}): Promise<SearchResult> {
  const cacheKey = `search:${q.toLowerCase()}`;
  const cached = cacheGet<SearchResult>(cacheKey);
  if (cached) return cached;

  const trimmed = q.trim();
  if (!trimmed) {
    const empty: SearchResult = { items: [], status: "Enter a search term to begin." };
    cacheSet(cacheKey, empty);
    return empty;
  }

  let payload: BackendNutritionResponse | undefined;
  try {
    payload = await requestNutritionSearch(trimmed, { signal: options.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    if ((error as { code?: string } | undefined)?.code === "auth_required") {
      throw error;
    }
    netError("Nutrition request failed.");
    payload = { results: [] };
  }

  const items = Array.isArray(payload?.results)
    ? (payload!.results as unknown[])
        .map(normalizeFoodItem)
        .filter((item): item is FoodItem => Boolean(item.name))
    : [];

  const statusMessage = payload?.message === "no_results"
    ? 'No results. Try "chicken breast" or a known barcode.'
    : payload?.source
      ? `Source: ${payload.source}`
      : items.length
        ? "Done."
        : "No results.";

  const result: SearchResult = { items, status: statusMessage };
  if (!options.signal?.aborted) {
    cacheSet(cacheKey, result);
  }
  return result;
}

/** Lookup by barcode (GTIN/UPC/EAN) via backend function. Cached 5m. */
export async function lookupBarcode(code: string, options: RequestOptions = {}): Promise<SearchResult> {
  const cacheKey = `barcode:${code}`;
  const cached = cacheGet<SearchResult>(cacheKey);
  if (cached) return cached;

  const trimmed = code.trim();
  if (!trimmed) {
    const empty: SearchResult = { items: [], status: "Enter a barcode to search." };
    cacheSet(cacheKey, empty);
    return empty;
  }

  let payload: BackendNutritionResponse | undefined;
  try {
    payload = await requestNutritionBarcode(trimmed, { signal: options.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    if ((error as { code?: string } | undefined)?.code === "auth_required") {
      throw error;
    }
    netError("Nutrition request failed.");
    payload = { results: [] };
  }

  const items = Array.isArray(payload?.results)
    ? (payload!.results as unknown[])
        .map(normalizeFoodItem)
        .filter((item): item is FoodItem => Boolean(item.name))
    : [];

  const statusMessage = payload?.message === "no_results"
    ? "No barcode match found."
    : payload?.source
      ? `Source: ${payload.source}`
      : items.length
        ? "Found."
        : "No barcode match found.";

  const result: SearchResult = { items, status: statusMessage };
  if (!options.signal?.aborted) {
    cacheSet(cacheKey, result);
  }
  return result;
}

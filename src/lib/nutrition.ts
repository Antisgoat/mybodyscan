import { USDA_API_KEY, OFF_ENABLED } from "./flags";
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

function isAbortError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof DOMException && error.name === "AbortError") return true;
  return error instanceof Error && error.name === "AbortError";
}

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

async function fetchJson(url: string, opts: RequestInit = {}, options: RequestOptions = {}): Promise<any> {
  const { timeoutMs = 10_000, signal } = options;
  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), timeoutMs);

  let removeListener: (() => void) | undefined;
  if (signal) {
    if (signal.aborted) {
      ctrl.abort(signal.reason as any);
    } else {
      const abortListener = () => ctrl.abort(signal.reason as any);
      signal.addEventListener("abort", abortListener, { once: true });
      removeListener = () => signal.removeEventListener("abort", abortListener);
    }
  }

  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeoutId);
    removeListener?.();
  }
}

function n(x: unknown): number | undefined {
  const v = typeof x === "string" && x.trim() === "" ? NaN : Number(x);
  return Number.isFinite(v) ? v : undefined;
}

/* ------------------ USDA adapters ------------------ */

const USDA_BASE = "https://api.nal.usda.gov/fdc/v1";

async function usdaSearch(q: string, options: RequestOptions = {}): Promise<FoodItem[]> {
  if (!USDA_API_KEY) return [];
  const url = `${USDA_BASE}/foods/search?api_key=${encodeURIComponent(USDA_API_KEY)}&query=${encodeURIComponent(q)}&pageSize=25`;
  const data = await fetchJson(url, {}, options).catch((error) => {
    if (isAbortError(error)) throw error;
    netError("Nutrition request failed.");
    return null;
  });
  if (!data || !Array.isArray(data.foods)) return [];
  return data.foods
    .map((f: any): FoodItem => {
      const macro = extractUsdaMacros(f?.foodNutrients);
      return {
        id: `usda:fdcId:${f?.fdcId}`,
        name: String(f?.description || "").trim(),
        brand: f?.brandOwner ? String(f.brandOwner) : undefined,
        calories: macro.calories,
        protein: macro.protein,
        fat: macro.fat,
        carbs: macro.carbs,
        source: "usda",
      };
    })
    .filter((x: FoodItem) => x.name.length > 0);
}

async function usdaGtin(gtin: string, options: RequestOptions = {}): Promise<FoodItem | null> {
  if (!USDA_API_KEY) return null;
  const url = `${USDA_BASE}/foods/search?api_key=${encodeURIComponent(USDA_API_KEY)}&query=${encodeURIComponent(gtin)}&pageSize=5`;
  const data = await fetchJson(url, {}, options).catch((error) => {
    if (isAbortError(error)) throw error;
    netError("Nutrition request failed.");
    return null;
  });
  const hit = Array.isArray(data?.foods)
    ? data.foods.find((f: any) => {
        const gtins: string[] = Array.isArray(f?.gtinUpc) ? f.gtinUpc : [f?.gtinUpc].filter(Boolean);
        return gtins.some((g: any) => String(g) === gtin);
      }) || data?.foods?.[0]
    : null;
  if (!hit) return null;
  const macro = extractUsdaMacros(hit?.foodNutrients);
  const name = String(hit?.description || "").trim();
  if (!name) return null;
  return {
    id: `usda:fdcId:${hit?.fdcId}`,
    name,
    brand: hit?.brandOwner ? String(hit.brandOwner) : undefined,
    calories: macro.calories,
    protein: macro.protein,
    fat: macro.fat,
    carbs: macro.carbs,
    source: "usda",
  };
}

function extractUsdaMacros(
  nutrients: any[],
): { calories?: number; protein?: number; fat?: number; carbs?: number } {
  if (!Array.isArray(nutrients)) return {};
  // FDC uses nutrient numbers or names; best-effort mapping
  // Energy (kcal), Protein, Total lipid (fat), Carbohydrate, by difference
  let calories: number | undefined;
  let protein: number | undefined;
  let fat: number | undefined;
  let carbs: number | undefined;

  for (const ntr of nutrients) {
    const name = String(ntr?.nutrientName || ntr?.name || "").toLowerCase();
    const unit = String(ntr?.unitName || ntr?.unit || "").toLowerCase();
    const val = n(ntr?.value ?? ntr?.amount);
    if (name.includes("energy") || name.includes("kcal")) {
      if (unit === "kcal" || unit === "kcal_th") calories = val ?? calories;
    } else if (name.startsWith("protein")) {
      protein = val ?? protein;
    } else if (name.includes("fat") && !name.includes("saturated")) {
      fat = val ?? fat;
    } else if (name.includes("carbohydrate")) {
      carbs = val ?? carbs;
    }
  }
  return { calories, protein, fat, carbs };
}

/* ------------------ Open Food Facts adapters ------------------ */

const OFF_SEARCH = "https://world.openfoodfacts.org/cgi/search.pl";
const OFF_PRODUCT = "https://world.openfoodfacts.org/api/v2/product";

async function offSearch(q: string, options: RequestOptions = {}): Promise<FoodItem[]> {
  if (!OFF_ENABLED) return [];
  const url = `${OFF_SEARCH}?search_terms=${encodeURIComponent(q)}&search_simple=1&json=1&page_size=25`;
  const data = await fetchJson(url, {}, options).catch((error) => {
    if (isAbortError(error)) throw error;
    netError("Nutrition request failed.");
    return null;
  });
  if (!data || !Array.isArray(data.products)) return [];
  return data.products
    .map((p: any): FoodItem => {
      const macro = extractOffMacros(p);
      return {
        id: `off:barcode:${p?.code || p?.id || ""}`,
        name: String(p?.product_name || p?.generic_name || "").trim(),
        brand: Array.isArray(p?.brands_tags) ? p.brands_tags[0] : p?.brands || undefined,
        calories: macro.calories,
        protein: macro.protein,
        fat: macro.fat,
        carbs: macro.carbs,
        source: "off",
      };
    })
    .filter((x: FoodItem) => x.name.length > 0);
}

async function offBarcode(code: string, options: RequestOptions = {}): Promise<FoodItem | null> {
  if (!OFF_ENABLED) return null;
  const url = `${OFF_PRODUCT}/${encodeURIComponent(code)}.json`;
  const data = await fetchJson(url, {}, options).catch((error) => {
    if (isAbortError(error)) throw error;
    netError("Nutrition request failed.");
    return null;
  });
  const p = data?.product;
  if (!p) return null;
  const macro = extractOffMacros(p);
  const name = String(p?.product_name || p?.generic_name || "").trim();
  if (!name) return null;
  return {
    id: `off:barcode:${code}`,
    name,
    brand: Array.isArray(p?.brands_tags) ? p.brands_tags[0] : p?.brands || undefined,
    calories: macro.calories,
    protein: macro.protein,
    fat: macro.fat,
    carbs: macro.carbs,
    source: "off",
  };
}

function extractOffMacros(p: any): { calories?: number; protein?: number; fat?: number; carbs?: number } {
  const ntr = p?.nutriments || {};
  const calories = n(ntr["energy-kcal_100g"] ?? ntr["energy-kcal"]);
  const protein = n(ntr["proteins_100g"] ?? ntr["protein_100g"]);
  const fat = n(ntr["fat_100g"]);
  const carbs = n(ntr["carbohydrates_100g"]);
  return { calories, protein, fat, carbs };
}

/* ------------------ Public API ------------------ */

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
    ? (payload!.results as unknown[]).map(sanitizeFoodItem)
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
    ? (payload!.results as unknown[]).map(sanitizeFoodItem)
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

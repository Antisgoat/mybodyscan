import { USDA_API_KEY, OFF_ENABLED } from "./flags";
import { netError } from "./net";

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

async function fetchJson(url: string, opts: RequestInit = {}, timeoutMs = 10_000): Promise<any> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(id);
  }
}

function n(x: unknown): number | undefined {
  const v = typeof x === "string" && x.trim() === "" ? NaN : Number(x);
  return Number.isFinite(v) ? v : undefined;
}

/* ------------------ USDA adapters ------------------ */

const USDA_BASE = "https://api.nal.usda.gov/fdc/v1";

async function usdaSearch(q: string): Promise<FoodItem[]> {
  if (!USDA_API_KEY) return [];
  const url = `${USDA_BASE}/foods/search?api_key=${encodeURIComponent(USDA_API_KEY)}&query=${encodeURIComponent(q)}&pageSize=25`;
  const data = await fetchJson(url).catch(() => {
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

async function usdaGtin(gtin: string): Promise<FoodItem | null> {
  if (!USDA_API_KEY) return null;
  const url = `${USDA_BASE}/foods/search?api_key=${encodeURIComponent(USDA_API_KEY)}&query=${encodeURIComponent(gtin)}&pageSize=5`;
  const data = await fetchJson(url).catch(() => {
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

async function offSearch(q: string): Promise<FoodItem[]> {
  if (!OFF_ENABLED) return [];
  const url = `${OFF_SEARCH}?search_terms=${encodeURIComponent(q)}&search_simple=1&json=1&page_size=25`;
  const data = await fetchJson(url).catch(() => {
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

async function offBarcode(code: string): Promise<FoodItem | null> {
  if (!OFF_ENABLED) return null;
  const url = `${OFF_PRODUCT}/${encodeURIComponent(code)}.json`;
  const data = await fetchJson(url).catch(() => {
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

/** Search foods by free text. Tries USDA first; if empty/error, tries OFF. Cached 5m. */
export async function searchFoods(q: string): Promise<SearchResult> {
  const key = `search:${q.toLowerCase()}`;
  const cached = cacheGet<SearchResult>(key);
  if (cached) return cached;

  const statusParts: string[] = [];
  let items: FoodItem[] = [];

  if (!USDA_API_KEY && !OFF_ENABLED) {
    statusParts.push("Nutrition lookups unavailable. Add an API key in settings.");
  }

  if (USDA_API_KEY) {
    statusParts.push("Searching USDA…");
    try {
      items = await usdaSearch(q);
    } catch {
      netError("Nutrition request failed.");
    }
  }

  if (items.length === 0 && OFF_ENABLED) {
    statusParts.push("Trying Open Food Facts…");
    try {
      items = await offSearch(q);
    } catch {
      netError("Nutrition request failed.");
    }
  }

  if (items.length === 0) {
    statusParts.push('No results. Try "chicken breast" or a known barcode.');
  }

  const res: SearchResult = { items, status: statusParts.join(" ") || "Done." };
  cacheSet(key, res);
  return res;
}

/** Lookup by barcode (GTIN/UPC/EAN). Tries USDA GTIN then OFF. Cached 5m. */
export async function lookupBarcode(code: string): Promise<SearchResult> {
  const key = `barcode:${code}`;
  const cached = cacheGet<SearchResult>(key);
  if (cached) return cached;

  const statusParts: string[] = [];
  let item: FoodItem | null = null;

  if (!USDA_API_KEY && !OFF_ENABLED) {
    statusParts.push("Nutrition lookups unavailable. Add an API key in settings.");
  }

  if (USDA_API_KEY) {
    statusParts.push("Looking up in USDA…");
    try {
      item = await usdaGtin(code);
    } catch {
      netError("Nutrition request failed.");
    }
  }

  if (!item && OFF_ENABLED) {
    statusParts.push("Trying Open Food Facts…");
    try {
      item = await offBarcode(code);
    } catch {
      netError("Nutrition request failed.");
    }
  }

  const statusPartsWithResult = [...statusParts, item ? "Found." : "No match found."];
  const res: SearchResult = {
    items: item ? [item] : [],
    status: statusPartsWithResult.join(" ") || "Done.",
  };
  cacheSet(key, res);
  return res;
}

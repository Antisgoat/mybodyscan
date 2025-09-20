import { HttpsError, onRequest } from "firebase-functions/v2/https";
import type { Request } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { withCors } from "../middleware/cors.js";
import { softVerifyAppCheck } from "../middleware/appCheck.js";
import { requireAuth, verifyAppCheckSoft } from "../http.js";

const USDA_KEY = defineSecret("USDA_FDC_API_KEY");
const SEARCH_CACHE_TTL = 1000 * 60 * 5; // ~5 minutes

interface Nutrients {
  kcal?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
}

export interface NormalizedItem {
  id: string;
  name: string;
  brand?: string;
  gtin?: string;
  serving: {
    qty: number | null;
    unit: string | null;
    text?: string | null;
  };
  per_serving: Nutrients;
  per_100g?: Nutrients;
  source: "USDA" | "OFF";
  fdcId?: number;
}

interface CacheEntry {
  expires: number;
  value: NormalizedItem[];
}

const cache = new Map<string, CacheEntry>();

function parseNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? Number(num.toFixed(2)) : null;
}

function normalizeServing(qty: unknown, unit: unknown, fallbackText?: string | null) {
  const numeric = parseNumber(qty);
  const unitText = typeof unit === "string" && unit.trim().length ? unit.trim() : null;
  return {
    qty: numeric,
    unit: unitText,
    text: fallbackText ?? (numeric && unitText ? `${numeric} ${unitText}` : fallbackText ?? null),
  };
}

export function fromUsdaFood(food: any): NormalizedItem | null {
  if (!food) return null;
  const label = food.labelNutrients || {};
  const nutrients: Nutrients = {
    kcal: parseNumber(
      label.calories?.value ??
        food.foodNutrients?.find((n: any) => n.nutrientName === "Energy" && n.unitName === "KCAL")?.value,
    ),
    protein_g: parseNumber(label.protein?.value),
    carbs_g: parseNumber(label.carbohydrates?.value),
    fat_g: parseNumber(label.fat?.value),
  };

  const per100g: Nutrients = {
    kcal: parseNumber(
      food.foodNutrients?.find((n: any) => n.nutrientName === "Energy" && n.unitName === "KCAL")?.value,
    ),
    protein_g: parseNumber(food.foodNutrients?.find((n: any) => n.nutrientName === "Protein")?.value),
    carbs_g: parseNumber(
      food.foodNutrients?.find((n: any) => n.nutrientName === "Carbohydrate, by difference")?.value,
    ),
    fat_g: parseNumber(food.foodNutrients?.find((n: any) => n.nutrientName === "Total lipid (fat)")?.value),
  };

  const serving = normalizeServing(food.servingSize, food.servingSizeUnit, food.householdServingFullText);

  return {
    id: `usda-${food.fdcId}`,
    fdcId: Number(food.fdcId) || undefined,
    name: food.description || "USDA Food",
    brand: food.brandName || food.brandOwner || undefined,
    gtin: food.gtinUpc || undefined,
    serving,
    per_serving: nutrients,
    per_100g:
      per100g.kcal || per100g.protein_g || per100g.carbs_g || per100g.fat_g ? per100g : undefined,
    source: "USDA",
  };
}

export function fromOpenFoodFacts(product: any): NormalizedItem | null {
  if (!product) return null;
  const nutriments = product.nutriments || {};
  const perServing: Nutrients = {
    kcal: parseNumber(
      nutriments["energy-kcal_serving"] ??
        (nutriments.energy_serving ? nutriments.energy_serving / 4.184 : undefined),
    ),
    protein_g: parseNumber(nutriments.proteins_serving),
    carbs_g: parseNumber(nutriments.carbohydrates_serving),
    fat_g: parseNumber(nutriments.fat_serving),
  };
  const per100g: Nutrients = {
    kcal: parseNumber(
      nutriments["energy-kcal_100g"] ??
        (nutriments.energy_100g ? nutriments.energy_100g / 4.184 : undefined),
    ),
    protein_g: parseNumber(nutriments.proteins_100g),
    carbs_g: parseNumber(nutriments.carbohydrates_100g),
    fat_g: parseNumber(nutriments.fat_100g),
  };

  const serving = normalizeServing(product.serving_quantity, product.serving_size_unit, product.serving_size);

  return {
    id: product.id ? `off-${product.id}` : `off-${product.code}`,
    name: product.product_name || product.generic_name || "OpenFoodFacts item",
    brand: product.brands || product.brand_owner || undefined,
    gtin: product.code || product.gtin || undefined,
    serving,
    per_serving: perServing,
    per_100g:
      per100g.kcal || per100g.protein_g || per100g.carbs_g || per100g.fat_g ? per100g : undefined,
    source: "OFF",
  };
}

async function queryUsda(apiKey: string, queryText: string) {
  const response = await fetch("https://api.nal.usda.gov/fdc/v1/foods/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: queryText, pageSize: 20, requireAllWords: false }),
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) {
    throw new Error(`usda_${response.status}`);
  }
  const data = await response.json();
  if (!Array.isArray(data?.foods)) return [] as NormalizedItem[];
  return data.foods.map(fromUsdaFood).filter(Boolean) as NormalizedItem[];
}

async function queryOff(queryText: string) {
  const response = await fetch(
    `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(queryText)}&search_simple=1&json=1&page_size=20`,
    { headers: { "User-Agent": "mybodyscan-functions" } },
  );
  if (!response.ok) {
    throw new Error(`off_${response.status}`);
  }
  const data = await response.json();
  if (!Array.isArray(data?.products)) return [] as NormalizedItem[];
  return data.products.map(fromOpenFoodFacts).filter(Boolean) as NormalizedItem[];
}

function dedupeItems(items: NormalizedItem[]) {
  const seen = new Map<string, NormalizedItem>();
  for (const item of items) {
    const key = item.gtin
      ? item.gtin
      : `${(item.brand || "").toLowerCase()}|${item.name.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.set(key, item);
    }
  }
  return Array.from(seen.values());
}

async function handler(req: Request, res: any) {
  await softVerifyAppCheck(req as any, res as any);
  await verifyAppCheckSoft(req);
  await requireAuth(req);

  const queryText = String(req.query?.q || req.body?.q || "").trim();
  if (!queryText) {
    throw new HttpsError("invalid-argument", "q required");
  }

  const now = Date.now();
  const cached = cache.get(queryText.toLowerCase());
  if (cached && cached.expires > now) {
    res.json({ items: cached.value, q: queryText, cached: true });
    return;
  }

  const usdaKey = USDA_KEY.value();
  let usdaResults: NormalizedItem[] = [];
  try {
    if (usdaKey) {
      usdaResults = await queryUsda(usdaKey, queryText);
    }
  } catch (error) {
    console.error("usda_search_error", error);
  }

  let offResults: NormalizedItem[] = [];
  if (!usdaResults.length || usdaResults.length < 5) {
    try {
      offResults = await queryOff(queryText);
    } catch (error) {
      console.error("off_search_error", error);
    }
  }

  const merged = dedupeItems([...usdaResults, ...offResults]);
  cache.set(queryText.toLowerCase(), { value: merged, expires: now + SEARCH_CACHE_TTL });
  res.json({ items: merged, q: queryText, cached: false });
}

export const nutritionSearch = onRequest({ secrets: [USDA_KEY] }, withCors(async (req, res) => {
  try {
    await handler(req as Request, res);
  } catch (error: any) {
    if (error instanceof HttpsError) {
      const status =
        error.code === "unauthenticated"
          ? 401
          : error.code === "invalid-argument"
          ? 400
          : 400;
      res.status(status).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: error?.message || "error" });
  }
}));

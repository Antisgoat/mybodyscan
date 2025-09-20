import { HttpsError, onRequest } from "firebase-functions/v2/https";
import type { Request } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { withCors } from "../middleware/cors";
import { softVerifyAppCheck } from "../middleware/appCheck";
import { requireAuth, verifyAppCheckSoft } from "../http";

const USDA_KEY = defineSecret("USDA_FDC_API_KEY");

export interface NormalizedItem {
  id: string;
  name: string;
  brand?: string;
  upc?: string;
  serving: string | null;
  per_serving: Nutrients;
  per_100g?: Nutrients;
  source: "USDA" | "OFF";
}

export interface Nutrients {
  kcal?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
}

export function parseNumber(value: any): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? Number(num.toFixed(2)) : null;
}

export function fromUsdaFood(food: any): NormalizedItem | null {
  if (!food) return null;
  const label = food.labelNutrients || {};
  const perServing: Nutrients = {
    kcal: parseNumber(label.calories?.value ?? food.foodNutrients?.find((n: any) => n.nutrientName === "Energy")?.value),
    protein_g: parseNumber(label.protein?.value),
    carbs_g: parseNumber(label.carbohydrates?.value),
    fat_g: parseNumber(label.fat?.value),
  };
  const per100g: Nutrients = {
    kcal: parseNumber(food.foodNutrients?.find((n: any) => n.nutrientName === "Energy" && n.unitName === "KCAL")?.value),
    protein_g: parseNumber(food.foodNutrients?.find((n: any) => n.nutrientName === "Protein")?.value),
    carbs_g: parseNumber(food.foodNutrients?.find((n: any) => n.nutrientName === "Carbohydrate, by difference")?.value),
    fat_g: parseNumber(food.foodNutrients?.find((n: any) => n.nutrientName === "Total lipid (fat)")?.value),
  };
  const servingSize = parseNumber(food.servingSize);
  const servingUnit = food.servingSizeUnit ? String(food.servingSizeUnit).toLowerCase() : null;
  const serving = servingSize && servingUnit ? `${servingSize} ${servingUnit}` : null;
  return {
    id: `usda-${food.fdcId}`,
    name: food.description || "USDA Food",
    brand: food.brandName || undefined,
    upc: food.gtinUpc || undefined,
    serving,
    per_serving: perServing,
    per_100g: per100g,
    source: "USDA",
  };
}

export function fromOpenFoodFacts(product: any): NormalizedItem | null {
  if (!product) return null;
  const nutriments = product.nutriments || {};
  const serving = typeof product.serving_size === "string" ? product.serving_size : null;
  const perServing: Nutrients = {
    kcal: parseNumber(nutriments["energy-kcal_serving"] ?? (nutriments.energy_serving ? nutriments.energy_serving / 4.184 : null)),
    protein_g: parseNumber(nutriments.proteins_serving),
    carbs_g: parseNumber(nutriments.carbohydrates_serving),
    fat_g: parseNumber(nutriments.fat_serving),
  };
  const per100g: Nutrients = {
    kcal: parseNumber(nutriments["energy-kcal_100g"] ?? (nutriments.energy_100g ? nutriments.energy_100g / 4.184 : null)),
    protein_g: parseNumber(nutriments.proteins_100g),
    carbs_g: parseNumber(nutriments.carbohydrates_100g),
    fat_g: parseNumber(nutriments.fat_100g),
  };
  return {
    id: product.id ? `off-${product.id}` : `off-${product.code}`,
    name: product.product_name || product.generic_name || "OpenFoodFacts item",
    brand: product.brands || product.brand_owner || undefined,
    upc: product.code || undefined,
    serving,
    per_serving: perServing,
    per_100g: per100g,
    source: "OFF",
  };
}

async function queryUsda(apiKey: string, queryText: string) {
  const url = "https://api.nal.usda.gov/fdc/v1/foods/search";
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: queryText, pageSize: 20, requireAllWords: false }),
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) {
    throw new Error(`usda_${response.status}`);
  }
  const data = await response.json();
  return Array.isArray(data?.foods) ? data.foods.map(fromUsdaFood).filter(Boolean) : [];
}

async function queryOff(queryText: string) {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(
    queryText
  )}&search_simple=1&json=1&page_size=20`;
  const response = await fetch(url, { headers: { "User-Agent": "mybodyscan-functions" } });
  if (!response.ok) {
    throw new Error(`off_${response.status}`);
  }
  const data = await response.json();
  return Array.isArray(data?.products) ? data.products.map(fromOpenFoodFacts).filter(Boolean) : [];
}

async function handler(req: Request, res: any) {
  await softVerifyAppCheck(req as any, res as any);
  await verifyAppCheckSoft(req);
  await requireAuth(req);
  const queryText = String(req.query?.q || req.body?.q || "").trim();
  if (!queryText) {
    throw new HttpsError("invalid-argument", "q required");
  }

  const usdaKey = USDA_KEY.value();
  let usdaResults: (NormalizedItem | null)[] = [];
  try {
    if (usdaKey) {
      usdaResults = await queryUsda(usdaKey, queryText);
    }
  } catch (error) {
    console.error("usda_search_error", error);
  }

  let offResults: (NormalizedItem | null)[] = [];
  if (!usdaResults.length || usdaResults.length < 5) {
    try {
      offResults = await queryOff(queryText);
    } catch (error) {
      console.error("off_search_error", error);
    }
  }

  const dedup = new Map<string, NormalizedItem>();
  for (const item of [...usdaResults, ...offResults]) {
    if (!item) continue;
    const key = `${item.name.toLowerCase()}|${(item.brand || "").toLowerCase()}|${item.upc || ""}`;
    if (!dedup.has(key)) {
      dedup.set(key, item);
    }
  }

  res.json({ items: Array.from(dedup.values()) });
}

export const nutritionSearch = onRequest({ secrets: [USDA_KEY] }, withCors(async (req, res) => {
  try {
    await handler(req as Request, res);
  } catch (error: any) {
    if (error instanceof HttpsError) {
      const status = error.code === "unauthenticated" ? 401 : error.code === "invalid-argument" ? 400 : 400;
      res.status(status).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: error?.message || "error" });
  }
}));

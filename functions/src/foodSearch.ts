import { config } from "firebase-functions";
import { HttpsError, onRequest, type Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import { withCors } from "./middleware/cors.js";
import { fromUsdaFood, fromOpenFoodFacts, type NormalizedItem as NutritionItem } from "./nutritionSearch.js";

interface FoodSearchItem {
  id: string;
  name: string;
  brand: string | null;
  kcals: number | null;
  source: "USDA" | "Open Food Facts";
  serving: NutritionItem["serving"];
  per_serving: NutritionItem["per_serving"];
  per_100g: NutritionItem["per_100g"] | null;
  fdcId?: number;
  gtin?: string;
}

function parseNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? Number(num.toFixed(2)) : null;
}

async function queryUsda(key: string, q: string): Promise<NutritionItem[]> {
  const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
  url.searchParams.set("api_key", key);
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: q, pageSize: 20, requireAllWords: false }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(`usda_${response.status}`);
  }
  const data = await response.json();
  if (!Array.isArray(data?.foods)) return [];
  return (data.foods.map(fromUsdaFood).filter(Boolean) ?? []) as NutritionItem[];
}

async function queryOff(q: string): Promise<NutritionItem[]> {
  const fields = [
    "code",
    "id",
    "product_name",
    "generic_name",
    "brands",
    "brand_owner",
    "nutriments",
    "serving_size",
    "serving_quantity",
    "serving_size_unit",
  ];
  const url = new URL("https://world.openfoodfacts.org/cgi/search.pl");
  url.searchParams.set("search_terms", q);
  url.searchParams.set("search_simple", "1");
  url.searchParams.set("json", "1");
  url.searchParams.set("page_size", "20");
  url.searchParams.set("fields", fields.join(","));
  const response = await fetch(url, {
    headers: { "User-Agent": "mybodyscan-food-search/1.0" },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(`off_${response.status}`);
  }
  const data = await response.json();
  if (!Array.isArray(data?.products)) return [];
  return (data.products.map(fromOpenFoodFacts).filter(Boolean) ?? []) as NutritionItem[];
}

function toResponseItem(item: NutritionItem): FoodSearchItem {
  return {
    id: item.id,
    name: item.name,
    brand: item.brand ?? null,
    kcals: parseNumber(item.per_serving?.kcal ?? item.per_100g?.kcal) ?? null,
    source: item.source,
    serving: item.serving,
    per_serving: item.per_serving,
    per_100g: item.per_100g ?? null,
    fdcId: item.fdcId,
    gtin: item.gtin,
  };
}

function getUsdaKey(): string | null {
  try {
    const cfg = config();
    const key = cfg?.usda?.key;
    return typeof key === "string" && key.trim().length ? key.trim() : null;
  } catch (error) {
    console.warn("usda_config_missing", error);
    return null;
  }
}

async function handler(req: Request, res: Response) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET,OPTIONS");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const query = String(req.query?.q ?? "").trim();
  if (!query) {
    throw new HttpsError("invalid-argument", "q required");
  }

  const key = getUsdaKey();
  let results: NutritionItem[] = [];

  if (key) {
    try {
      results = await queryUsda(key, query);
    } catch (error) {
      console.error("food_search_usda_error", error);
    }
  }

  if (!results.length) {
    try {
      results = await queryOff(query);
    } catch (error) {
      console.error("food_search_off_error", error);
    }
  }

  res.json({ items: results.map(toResponseItem) });
}

export const foodSearch = onRequest({ region: "us-central1", invoker: "public" }, withCors(async (req, res) => {
  try {
    await handler(req as Request, res as Response);
  } catch (error: any) {
    if (error instanceof HttpsError) {
      const status = error.code === "invalid-argument" ? 400 : 500;
      res.status(status).json({ error: error.message });
      return;
    }
    console.error("food_search_unhandled", error);
    res.status(500).json({ error: "Internal error" });
  }
}));


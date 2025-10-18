import { HttpsError, onRequest } from "firebase-functions/v2/https";
import type { Request, Response } from "express";
import { withCors } from "./middleware/cors.js";
import { withRequestLogging } from "./middleware/logging.js";
import { requireAuth, verifyAppCheckStrict } from "./http.js";
import { enforceRateLimit } from "./middleware/rateLimit.js";
import { fromOpenFoodFacts, fromUsdaFood, type FoodItem } from "./nutritionSearch.js";
import { errorCode, statusFromCode } from "./lib/errors.js";

const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours

interface CacheEntry {
  expires: number;
  value: { item: FoodItem; source: "OFF" | "USDA" } | null;
}

const cache = new Map<string, CacheEntry>();

async function fetchOff(code: string) {
  const response = await fetch(
    `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`,
    { headers: { "User-Agent": "mybodyscan-nutrition-barcode/1.0" }, signal: AbortSignal.timeout(4000) },
  );
  if (!response.ok) {
    throw new Error(`off_${response.status}`);
  }
  const data = (await response.json()) as any;
  if (!data?.product) return null;
  const normalized = fromOpenFoodFacts(data.product);
  return normalized ? { item: normalized, source: "OFF" as const } : null;
}

async function fetchUsdaByBarcode(apiKey: string, code: string) {
  const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("query", code);
  url.searchParams.set("pageSize", "5");
  url.searchParams.set("dataType", "Branded");
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) {
    throw new Error(`usda_${response.status}`);
  }
  const data = (await response.json()) as any;
  if (!Array.isArray(data?.foods) || !data.foods.length) return null;
  const normalized = data.foods
    .map((food: any) => fromUsdaFood(food))
    .filter(Boolean)
    .find((item: any) => item?.gtin === code) as FoodItem | undefined;
  const fallback = data.foods.map((food: any) => fromUsdaFood(food)).find(Boolean) as FoodItem | undefined;
  const item = normalized || fallback || null;
  return item ? { item, source: "USDA" as const } : null;
}

async function handler(req: Request, res: Response) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  await verifyAppCheckStrict(req as any);

  const uid = await requireAuth(req);
  await enforceRateLimit({ uid, key: "nutrition_barcode", limit: 100, windowMs: 60 * 60 * 1000 });

  const code = String(req.query?.code || req.body?.code || "").trim();
  if (!code) {
    throw new HttpsError("invalid-argument", "code required");
  }

  const now = Date.now();
  const cached = cache.get(code);
  if (cached && cached.expires > now) {
    if (!cached.value) {
      res.status(404).json({ error: "not_found", cached: true });
      return;
    }
    res.json({ item: cached.value.item, code, source: cached.value.source, cached: true });
    return;
  }

  let result: { item: FoodItem; source: "OFF" | "USDA" } | null = null;

  try {
    result = await fetchOff(code);
  } catch (error) {
    console.error("nutrition_barcode_off_error", { code, message: (error as Error)?.message });
  }

  if (!result) {
    cache.set(code, { value: null, expires: now + CACHE_TTL });
    res.status(404).json({ error: "not_found", message: "No match; try manual search" });
    return;
  }

  cache.set(code, { value: result, expires: now + CACHE_TTL });
  res.json({ item: result.item, code, source: result.source, cached: false });
}

export const nutritionBarcode = onRequest(
  { region: "us-central1", secrets: ["USDA_FDC_API_KEY"], invoker: "public", concurrency: 20 },
  withRequestLogging(
    withCors(async (req, res) => {
      try {
        await handler(req as unknown as Request, res as unknown as Response);
      } catch (error: any) {
        if (error instanceof HttpsError) {
          const code = errorCode(error);
          const status =
            code === "unauthenticated"
              ? 401
              : code === "invalid-argument"
              ? 400
              : code === "resource-exhausted"
              ? 429
              : statusFromCode(code);
          res.status(status).json({ error: error.message });
          return;
        }
        res.status(500).json({ error: error?.message || "error" });
      }
    }),
    { sampleRate: 0.5 },
  ),
);

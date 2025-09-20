import { HttpsError, onRequest } from "firebase-functions/v2/https";
import type { Request } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { withCors } from "../middleware/cors.js";
import { softVerifyAppCheck } from "../middleware/appCheck.js";
import { requireAuth, verifyAppCheckSoft } from "../http.js";
import { fromOpenFoodFacts, fromUsdaFood, type NormalizedItem } from "./search.js";

const USDA_KEY = defineSecret("USDA_FDC_API_KEY");
const CACHE_TTL = 1000 * 60 * 60 * 24; // ~24 hours

interface CacheEntry {
  expires: number;
  value: { item: NormalizedItem; source: "OFF" | "USDA" } | null;
}

const cache = new Map<string, CacheEntry>();

async function fetchOff(code: string) {
  const response = await fetch(
    `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`,
    { headers: { "User-Agent": "mybodyscan-functions" } },
  );
  if (!response.ok) {
    throw new Error(`off_${response.status}`);
  }
  const data = await response.json();
  if (!data?.product) return null;
  const normalized = fromOpenFoodFacts(data.product);
  return normalized ? { item: normalized, source: "OFF" as const } : null;
}

async function fetchUsdaByBarcode(apiKey: string, code: string) {
  const response = await fetch("https://api.nal.usda.gov/fdc/v1/foods/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: code, pageSize: 5, dataType: ["Branded"] }),
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) {
    throw new Error(`usda_${response.status}`);
  }
  const data = await response.json();
  if (!Array.isArray(data?.foods) || !data.foods.length) return null;
  const normalized = data.foods
    .map((food: any) => fromUsdaFood(food))
    .filter(Boolean)
    .find((item: any) => item?.gtin === code) as NormalizedItem | undefined;
  const fallback = data.foods.map((food: any) => fromUsdaFood(food)).find(Boolean) as
    | NormalizedItem
    | undefined;
  const item = normalized || fallback || null;
  return item ? { item, source: "USDA" as const } : null;
}

async function handler(req: Request, res: any) {
  await softVerifyAppCheck(req as any, res as any);
  await verifyAppCheckSoft(req);
  await requireAuth(req);

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

  let result: { item: NormalizedItem; source: "OFF" | "USDA" } | null = null;

  try {
    result = await fetchOff(code);
  } catch (error) {
    console.error("off_barcode_error", error);
  }

  if (!result) {
    try {
      const key = USDA_KEY.value();
      if (key) {
        result = await fetchUsdaByBarcode(key, code);
      }
    } catch (error) {
      console.error("usda_barcode_error", error);
    }
  }

  if (!result) {
    cache.set(code, { value: null, expires: now + CACHE_TTL });
    res.status(404).json({ error: "not_found" });
    return;
  }

  cache.set(code, { value: result, expires: now + CACHE_TTL });
  res.json({ item: result.item, code, source: result.source, cached: false });
}

export const nutritionBarcode = onRequest({ secrets: [USDA_KEY] }, withCors(async (req, res) => {
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

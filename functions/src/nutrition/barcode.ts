import { HttpsError, onRequest } from "firebase-functions/v2/https";
import type { Request } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { withCors } from "../middleware/cors";
import { softVerifyAppCheck } from "../middleware/appCheck";
import { requireAuth, verifyAppCheckSoft } from "../http";
import { fromOpenFoodFacts, fromUsdaFood } from "./search";

const USDA_KEY = defineSecret("USDA_FDC_API_KEY");
const cache = new Map<string, { value: any; expires: number }>();
const TTL = 1000 * 60 * 10;

async function fetchOff(code: string) {
  const url = `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`;
  const response = await fetch(url, { headers: { "User-Agent": "mybodyscan-functions" } });
  if (!response.ok) {
    throw new Error(`off_${response.status}`);
  }
  const data = await response.json();
  return data?.product ? fromOpenFoodFacts(data.product) : null;
}

async function fetchUsdaByBarcode(apiKey: string, code: string) {
  const url = "https://api.nal.usda.gov/fdc/v1/foods/search";
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: code, pageSize: 5, dataType: ["Branded"] }),
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) {
    throw new Error(`usda_${response.status}`);
  }
  const data = await response.json();
  if (!Array.isArray(data?.foods)) return null;
  const match = data.foods.find((food: any) => String(food.gtinUpc || "") === code);
  return match ? fromUsdaFood(match) : fromUsdaFood(data.foods[0]);
}

async function handler(req: Request, res: any) {
  await softVerifyAppCheck(req as any, res as any);
  await verifyAppCheckSoft(req);
  await requireAuth(req);
  const code = String(req.query?.code || req.body?.code || "").trim();
  if (!code) {
    throw new HttpsError("invalid-argument", "code required");
  }

  const cached = cache.get(code);
  const now = Date.now();
  if (cached && cached.expires > now) {
    res.json({ item: cached.value });
    return;
  }

  let item = null;
  try {
    item = await fetchOff(code);
  } catch (error) {
    console.error("off_barcode_error", error);
  }

  if (!item) {
    try {
      const key = USDA_KEY.value();
      if (key) {
        item = await fetchUsdaByBarcode(key, code);
      }
    } catch (error) {
      console.error("usda_barcode_error", error);
    }
  }

  if (!item) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  cache.set(code, { value: item, expires: now + TTL });
  res.json({ item });
}

export const nutritionBarcode = onRequest({ secrets: [USDA_KEY] }, withCors(async (req, res) => {
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

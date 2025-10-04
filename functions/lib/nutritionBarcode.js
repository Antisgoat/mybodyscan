import { HttpsError, onRequest } from "firebase-functions/v2/https";
import { withCors } from "./middleware/cors.js";
import { requireAppCheckStrict } from "./middleware/appCheck.js";
import { requireAuth } from "./http.js";
import { enforceRateLimit } from "./middleware/rateLimit.js";
import { fromOpenFoodFacts, fromUsdaFood } from "./nutritionSearch.js";
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours
const cache = new Map();
async function fetchOff(code) {
    const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`, { headers: { "User-Agent": "mybodyscan-nutrition-barcode/1.0" }, signal: AbortSignal.timeout(4000) });
    if (!response.ok) {
        throw new Error(`off_${response.status}`);
    }
    const data = await response.json();
    if (!data?.product)
        return null;
    const normalized = fromOpenFoodFacts(data.product);
    return normalized ? { item: normalized, source: "Open Food Facts" } : null;
}
async function fetchUsdaByBarcode(apiKey, code) {
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
    const data = await response.json();
    if (!Array.isArray(data?.foods) || !data.foods.length)
        return null;
    const normalized = data.foods
        .map((food) => fromUsdaFood(food))
        .filter(Boolean)
        .find((item) => item?.gtin === code);
    const fallback = data.foods.map((food) => fromUsdaFood(food)).find(Boolean);
    const item = normalized || fallback || null;
    return item ? { item, source: "USDA" } : null;
}
async function handler(req, res) {
    if (req.method === "OPTIONS") {
        res.status(204).end();
        return;
    }
    await requireAppCheckStrict(req, res);
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
    let result = null;
    try {
        result = await fetchOff(code);
    }
    catch (error) {
        console.error("nutrition_barcode_off_error", { code, message: error?.message });
    }
    if (!result) {
        try {
            const key = process.env.USDA_FDC_API_KEY;
            if (key) {
                result = await fetchUsdaByBarcode(key, code);
            }
        }
        catch (error) {
            console.error("nutrition_barcode_usda_error", { code, message: error?.message });
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
export const nutritionBarcode = onRequest({ region: "us-central1", secrets: ["USDA_FDC_API_KEY"], invoker: "public", concurrency: 20 }, withCors(async (req, res) => {
    try {
        await handler(req, res);
    }
    catch (error) {
        if (error instanceof HttpsError) {
            const status = error.code === "unauthenticated"
                ? 401
                : error.code === "invalid-argument"
                    ? 400
                    : error.code === "resource-exhausted"
                        ? 429
                        : 400;
            res.status(status).json({ error: error.message });
            return;
        }
        res.status(500).json({ error: error?.message || "error" });
    }
}));
//# sourceMappingURL=nutritionBarcode.js.map
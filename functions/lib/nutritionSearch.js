import { onRequest } from "firebase-functions/v2/https";
import { getAuth } from "./firebase.js";
import { withCors } from "./middleware/cors.js";
import { verifyAppCheckFromHeader } from "./appCheck.js";
import { verifyRateLimit } from "./rateLimit.js";
const USDA_SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search";
const OFF_SEARCH_URL = "https://world.openfoodfacts.org/cgi/search.pl";
const USDA_DATA_TYPES = ["Branded", "Survey (FNDDS)", "SR Legacy", "Foundation"];
const FETCH_TIMEOUT_MS = 6500;
const auth = getAuth();
function describeError(error) {
    if (error instanceof Error && error.message)
        return error.message;
    if (typeof error === "string")
        return error;
    try {
        return JSON.stringify(error);
    }
    catch {
        return String(error);
    }
}
function round(value, decimals = 0) {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}
function toNumber(value) {
    if (value === null || value === undefined)
        return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}
function ensureMacroBreakdown(input) {
    return {
        kcal: input.kcal != null && Number.isFinite(input.kcal) ? round(input.kcal, 0) : 0,
        protein: input.protein != null && Number.isFinite(input.protein) ? round(input.protein, 1) : 0,
        carbs: input.carbs != null && Number.isFinite(input.carbs) ? round(input.carbs, 1) : 0,
        fat: input.fat != null && Number.isFinite(input.fat) ? round(input.fat, 1) : 0,
    };
}
function macrosFromGrams(base, grams) {
    if (!grams || grams <= 0) {
        return {
            kcal: null,
            protein_g: null,
            carbs_g: null,
            fat_g: null,
        };
    }
    const factor = grams / 100;
    return {
        kcal: round(base.kcal * factor, 0),
        protein_g: round(base.protein * factor, 1),
        carbs_g: round(base.carbs * factor, 1),
        fat_g: round(base.fat * factor, 1),
    };
}
function makeServingId(prefix, index, grams) {
    return `${prefix}-${index}-${round(grams, 3)}`;
}
function addServing(prefix, servings, seen, option) {
    if (!option.grams || option.grams <= 0)
        return;
    const key = `${option.label.toLowerCase()}-${round(option.grams, 3)}`;
    if (seen.has(key))
        return;
    seen.add(key);
    servings.push({
        id: makeServingId(prefix, servings.length, option.grams),
        label: option.label,
        grams: round(option.grams, 2),
        isDefault: option.isDefault,
    });
}
function ensureDefaultServing(servings) {
    const existing = servings.find((serving) => serving.isDefault);
    if (existing)
        return existing;
    if (servings.length > 1) {
        servings[1].isDefault = true;
        return servings[1];
    }
    servings[0].isDefault = true;
    return servings[0];
}
function normalizeBrand(value) {
    if (typeof value === "string" && value.trim().length) {
        return value.trim();
    }
    return null;
}
async function extractUid(req) {
    const header = req.headers.authorization || req.headers.Authorization;
    if (!header || typeof header !== "string")
        return null;
    const match = header.match(/^Bearer (.+)$/);
    if (!match)
        return null;
    try {
        const decoded = await auth.verifyIdToken(match[1]);
        return decoded.uid || null;
    }
    catch (error) {
        console.warn("nutrition_search_token_invalid", { message: describeError(error) });
        return null;
    }
}
function buildServingSnapshot(serving) {
    if (!serving) {
        return { qty: null, unit: null, text: null };
    }
    return {
        qty: round(serving.grams, 2),
        unit: "g",
        text: serving.label,
    };
}
export function fromUsdaFood(food) {
    if (!food)
        return null;
    const servings = [];
    const seen = new Set();
    addServing("usda", servings, seen, { label: "100 g", grams: 100, isDefault: true });
    const portions = Array.isArray(food?.foodPortions) ? food.foodPortions : [];
    const sorted = portions
        .filter((portion) => toNumber(portion?.gramWeight) && toNumber(portion?.gramWeight) > 0)
        .sort((a, b) => {
        const aSeq = toNumber(a?.sequenceNumber) ?? 0;
        const bSeq = toNumber(b?.sequenceNumber) ?? 0;
        return aSeq - bSeq;
    });
    sorted.forEach((portion) => {
        const gramWeight = toNumber(portion?.gramWeight);
        if (!gramWeight || gramWeight <= 0)
            return;
        const amount = toNumber(portion?.amount) ?? 1;
        const modifier = typeof portion?.modifier === "string" ? portion.modifier.trim() : "";
        const description = typeof portion?.portionDescription === "string" ? portion.portionDescription.trim() : "";
        const measureUnit = portion?.measureUnit;
        const measureName = typeof measureUnit?.name === "string" ? measureUnit.name.trim() : "";
        const measureAbbr = typeof measureUnit?.abbreviation === "string" ? measureUnit.abbreviation.trim() : "";
        const labelParts = [amount && amount !== 1 ? amount : null, description || modifier || measureAbbr || measureName || "serving"];
        const label = labelParts.filter(Boolean).join(" ");
        addServing("usda", servings, seen, {
            label: label || `${round(amount ?? 1, 2)} serving`,
            grams: gramWeight,
        });
    });
    const labelCalories = toNumber(food?.labelNutrients?.calories?.value);
    const nutrientCalories = toNumber(food?.foodNutrients?.find((n) => n?.nutrientId === 1008)?.value);
    const labelProtein = toNumber(food?.labelNutrients?.protein?.value);
    const nutrientProtein = toNumber(food?.foodNutrients?.find((n) => n?.nutrientId === 1003)?.value);
    const labelCarbs = toNumber(food?.labelNutrients?.carbohydrates?.value ?? food?.labelNutrients?.carbs?.value);
    const nutrientCarbs = toNumber(food?.foodNutrients?.find((n) => n?.nutrientId === 1005)?.value);
    const labelFat = toNumber(food?.labelNutrients?.fat?.value);
    const nutrientFat = toNumber(food?.foodNutrients?.find((n) => n?.nutrientId === 1004)?.value);
    const base = ensureMacroBreakdown({
        kcal: labelCalories ?? nutrientCalories ?? undefined,
        protein: labelProtein ?? nutrientProtein ?? undefined,
        carbs: labelCarbs ?? nutrientCarbs ?? undefined,
        fat: labelFat ?? nutrientFat ?? undefined,
    });
    const defaultServing = ensureDefaultServing(servings);
    const perServing = macrosFromGrams(base, defaultServing?.grams ?? null);
    return {
        id: String(food?.fdcId ??
            food?.gtinUpc ??
            food?.ndbNumber ??
            globalThis.crypto?.randomUUID?.() ??
            Date.now()),
        name: typeof food?.description === "string" && food.description.trim().length
            ? food.description.trim()
            : "Food",
        brand: normalizeBrand(food?.brandOwner) ??
            normalizeBrand(food?.brandName) ??
            normalizeBrand(food?.brand),
        source: "USDA",
        basePer100g: base,
        servings,
        serving: buildServingSnapshot(defaultServing),
        per_serving: perServing,
        per_100g: {
            kcal: base.kcal,
            protein_g: base.protein,
            carbs_g: base.carbs,
            fat_g: base.fat,
        },
        fdcId: toNumber(food?.fdcId) ?? undefined,
        gtin: normalizeBrand(food?.gtinUpc) ?? undefined,
        raw: food,
    };
}
function parseServingSizeText(text) {
    if (!text)
        return null;
    const match = text.match(/([0-9]+(?:\.[0-9]+)?)\s*(g|gram|grams|ml|milliliter|milliliters|oz|ounce|ounces)/i);
    if (!match)
        return null;
    const qty = toNumber(match[1]);
    const unit = match[2]?.toLowerCase();
    if (!qty || !unit)
        return null;
    switch (unit) {
        case "g":
        case "gram":
        case "grams":
        case "ml":
        case "milliliter":
        case "milliliters":
            return { grams: qty };
        case "oz":
        case "ounce":
        case "ounces":
            return { grams: qty * 28.3495231 };
        default:
            return null;
    }
}
export function fromOpenFoodFacts(product) {
    if (!product)
        return null;
    const servings = [];
    const seen = new Set();
    addServing("off", servings, seen, { label: "100 g", grams: 100, isDefault: true });
    const servingQty = toNumber(product?.serving_quantity);
    const servingUnit = typeof product?.serving_size_unit === "string" ? product.serving_size_unit.toLowerCase() : null;
    let convertedGrams = null;
    if (servingQty && servingUnit) {
        switch (servingUnit) {
            case "g":
            case "gram":
            case "grams":
            case "ml":
            case "milliliter":
            case "milliliters":
                convertedGrams = servingQty;
                break;
            case "oz":
            case "ounce":
            case "ounces":
                convertedGrams = servingQty * 28.3495231;
                break;
            case "l":
            case "liter":
            case "liters":
                convertedGrams = servingQty * 1000;
                break;
            default:
                convertedGrams = null;
        }
    }
    const servingText = typeof product?.serving_size === "string" ? product.serving_size.trim() : "";
    const parsedText = parseServingSizeText(servingText);
    const gramsFromText = parsedText?.grams ?? null;
    const grams = convertedGrams ?? gramsFromText;
    if (grams && grams > 0) {
        const label = servingText || `${round(grams, 2)} g`;
        addServing("off", servings, seen, { label, grams, isDefault: servings.length === 1 });
    }
    const nutriments = product?.nutriments ?? {};
    const energyKcal = toNumber(nutriments?.["energy-kcal_100g"]);
    const energyKcalAlt = toNumber(nutriments?.energy_kcal_100g);
    const energyKj = toNumber(nutriments?.energy_100g);
    const protein100g = toNumber(nutriments?.proteins_100g);
    const carbs100g = toNumber(nutriments?.carbohydrates_100g);
    const fat100g = toNumber(nutriments?.fat_100g);
    const base = ensureMacroBreakdown({
        kcal: energyKcal ?? energyKcalAlt ?? (energyKj != null ? energyKj / 4.184 : undefined),
        protein: protein100g ?? undefined,
        carbs: carbs100g ?? undefined,
        fat: fat100g ?? undefined,
    });
    const defaultServing = ensureDefaultServing(servings);
    const perServing = macrosFromGrams(base, defaultServing?.grams ?? null);
    return {
        id: String(product?.code || product?._id || product?.id || globalThis.crypto?.randomUUID?.() || Date.now()),
        name: typeof product?.product_name === "string" && product.product_name.trim().length
            ? product.product_name.trim()
            : typeof product?.generic_name === "string" && product.generic_name.trim().length
                ? product.generic_name.trim()
                : "Food",
        brand: normalizeBrand(product?.brands) ??
            normalizeBrand(product?.brand_owner) ??
            normalizeBrand(product?.owner),
        source: "Open Food Facts",
        basePer100g: base,
        servings,
        serving: buildServingSnapshot(defaultServing),
        per_serving: perServing,
        per_100g: {
            kcal: base.kcal,
            protein_g: base.protein,
            carbs_g: base.carbs,
            fat_g: base.fat,
        },
        gtin: normalizeBrand(product?.code) ?? undefined,
        raw: product,
    };
}
async function searchUsda(query) {
    const apiKey = process.env.USDA_FDC_API_KEY;
    if (!apiKey)
        return [];
    const url = new URL(USDA_SEARCH_URL);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("query", query);
    url.searchParams.set("pageSize", "20");
    url.searchParams.set("dataType", USDA_DATA_TYPES.join(","));
    const response = await fetch(url.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
        throw new Error(`usda_${response.status}`);
    }
    const data = await response.json();
    if (!Array.isArray(data?.foods))
        return [];
    return data.foods.map((item) => fromUsdaFood(item)).filter(Boolean);
}
async function searchOpenFoodFacts(query) {
    const url = new URL(OFF_SEARCH_URL);
    url.searchParams.set("search_terms", query);
    url.searchParams.set("search_simple", "1");
    url.searchParams.set("action", "process");
    url.searchParams.set("json", "1");
    url.searchParams.set("page_size", "20");
    const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
            Accept: "application/json",
            "User-Agent": "mybodyscan-nutrition-search/1.0",
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
        throw new Error(`off_${response.status}`);
    }
    const data = await response.json();
    if (!Array.isArray(data?.products))
        return [];
    return data.products.map((item) => fromOpenFoodFacts(item)).filter(Boolean);
}
async function handleRequest(req, res) {
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET,OPTIONS");
        res.status(405).json({ error: "method_not_allowed" });
        return;
    }
    const query = String(req.query?.q ?? req.query?.query ?? "").trim();
    if (!query) {
        res.status(200).json({ items: [] });
        return;
    }
    const uid = await extractUid(req);
    if (uid) {
        req.auth = { uid };
    }
    else if (req.auth) {
        delete req.auth;
    }
    try {
        await verifyRateLimit(req, {
            key: "nutrition",
            max: Number(process.env.NUTRITION_RPM || 20),
            windowSeconds: 60,
        });
    }
    catch (error) {
        if (error?.status === 429) {
            console.warn("nutrition_search_rate_limited", { type: uid ? "uid" : "ip" });
            res.status(429).json({ error: "Too Many Requests" });
            return;
        }
        throw error;
    }
    let items = [];
    let primarySource = "USDA";
    try {
        items = await searchUsda(query);
    }
    catch (error) {
        console.error("nutrition_search_usda_error", { query, message: describeError(error) });
    }
    if (!items.length) {
        try {
            items = await searchOpenFoodFacts(query);
            primarySource = "Open Food Facts";
        }
        catch (error) {
            console.error("nutrition_search_off_error", { query, message: describeError(error) });
        }
    }
    if (!items.length) {
        console.error("nutrition_search_total_failure", { query });
    }
    res.status(200).json({ items, primarySource });
}
export const nutritionSearch = onRequest({ region: "us-central1", secrets: ["USDA_FDC_API_KEY"], invoker: "public", concurrency: 20 }, withCors(async (req, res) => {
    try {
        await verifyAppCheckFromHeader(req);
    }
    catch (error) {
        if (!res.headersSent) {
            console.warn("nutrition_search_appcheck_rejected", { message: describeError(error) });
            const status = typeof error?.status === "number" ? error.status : 401;
            res.status(status).json({ error: error?.message ?? "app_check_required" });
        }
        return;
    }
    try {
        await handleRequest(req, res);
    }
    catch (error) {
        if (res.headersSent) {
            return;
        }
        if (typeof error?.status === "number") {
            res.status(error.status).json({ error: error.message ?? "request_failed" });
            return;
        }
        console.error("nutrition_search_unhandled", { message: describeError(error) });
        res.status(500).json({ error: "server_error" });
    }
}));
//# sourceMappingURL=nutritionSearch.js.map
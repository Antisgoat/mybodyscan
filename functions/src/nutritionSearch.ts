import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getAuth } from "./firebase.js";
import { ensureRateLimit, identifierFromRequest } from "./http/_middleware.js";
import { getEnv } from "./lib/env.js";
import { HttpError, send } from "./util/http.js";
import { withCors } from "./middleware/cors.js";
import { appCheckSoft } from "./middleware/appCheckSoft.js";
import { chain } from "./middleware/chain.js";

export type MacroBreakdown = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type ServingOption = {
  id: string;
  label: string;
  grams: number;
  isDefault?: boolean;
};

export type NutritionSource = "USDA" | "Open Food Facts";

export interface FoodItem {
  id: string;
  name: string;
  brand: string | null;
  source: NutritionSource;
  basePer100g: MacroBreakdown;
  servings: ServingOption[];
  serving: {
    qty: number | null;
    unit: string | null;
    text?: string | null;
  };
  per_serving: {
    kcal: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
  };
  per_100g?: {
    kcal: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
  } | null;
  fdcId?: number;
  gtin?: string;
  raw?: unknown;
}

export interface NormalizedFoodItem {
  id: string;
  name: string;
  brand?: string | null;
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  serving?: number | null;
  unit?: string | null;
  source?: NutritionSource;
}

export type NutritionSearchRequest = {
  query: string;
  page?: number;
  pageSize?: number;
  sourcePreference?: "usda-first" | "off-first" | "combined";
};

export type NutritionSearchResponse =
  | { status: "ok"; results: NormalizedFoodItem[]; source?: NutritionSource | null; message?: string | null }
  | { status: "upstream_error"; results: NormalizedFoodItem[]; message?: string | null };

const USDA_SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search";
const OFF_SEARCH_URL = "https://world.openfoodfacts.org/cgi/search.pl";
const USDA_DATA_TYPES = ["Branded", "Survey (FNDDS)", "SR Legacy", "Foundation"];

const usdaApiKeyParam = defineSecret("USDA_FDC_API_KEY");

function getUsdaApiKey(): string | undefined {
  try {
    const secretValue = usdaApiKeyParam.value();
    if (typeof secretValue === "string") {
      const trimmed = secretValue.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  } catch {
    // Secret not bound in this environment
  }

  const envValue =
    getEnv("USDA_FDC_API_KEY")?.trim() ||
    getEnv("USDA_API_KEY")?.trim() ||
    getEnv("VITE_USDA_API_KEY")?.trim();
  return envValue ? envValue : undefined;
}

const FETCH_TIMEOUT_MS = 8000;

function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function round(value: number, decimals = 0): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function ensureMacroBreakdown(input: Partial<MacroBreakdown>): MacroBreakdown {
  return {
    kcal: input.kcal != null && Number.isFinite(input.kcal) ? round(input.kcal, 0) : 0,
    protein: input.protein != null && Number.isFinite(input.protein) ? round(input.protein, 1) : 0,
    carbs: input.carbs != null && Number.isFinite(input.carbs) ? round(input.carbs, 1) : 0,
    fat: input.fat != null && Number.isFinite(input.fat) ? round(input.fat, 1) : 0,
  };
}

function macrosFromGrams(base: MacroBreakdown, grams: number | null) {
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

function makeServingId(prefix: string, index: number, grams: number): string {
  return `${prefix}-${index}-${round(grams, 3)}`;
}

function addServing(
  prefix: string,
  servings: ServingOption[],
  seen: Set<string>,
  option: { label: string; grams: number; isDefault?: boolean },
) {
  if (!option.grams || option.grams <= 0) return;
  const key = `${option.label.toLowerCase()}-${round(option.grams, 3)}`;
  if (seen.has(key)) return;
  seen.add(key);
  servings.push({
    id: makeServingId(prefix, servings.length, option.grams),
    label: option.label,
    grams: round(option.grams, 2),
    isDefault: option.isDefault,
  });
}

function ensureDefaultServing(servings: ServingOption[]): ServingOption {
  const existing = servings.find((serving) => serving.isDefault);
  if (existing) return existing;
  if (servings.length > 1) {
    servings[1].isDefault = true;
    return servings[1];
  }
  servings[0]!.isDefault = true;
  return servings[0]!;
}

function normalizeBrand(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length) {
    return value.trim();
  }
  return null;
}

function buildServingSnapshot(serving: ServingOption | undefined) {
  if (!serving) {
    return { qty: null, unit: null, text: null };
  }
  return {
    qty: round(serving.grams, 2),
    unit: "g",
    text: serving.label,
  };
}

export function fromUsdaFood(food: any): FoodItem | null {
  if (!food) return null;

  const servings: ServingOption[] = [];
  const seen = new Set<string>();
  addServing("usda", servings, seen, { label: "100 g", grams: 100, isDefault: true });

  const portions = Array.isArray(food?.foodPortions) ? food.foodPortions : [];
  const sorted = portions
    .filter((portion: any) => toNumber(portion?.gramWeight) && toNumber(portion?.gramWeight)! > 0)
    .sort((a: any, b: any) => {
      const aSeq = toNumber(a?.sequenceNumber) ?? 0;
      const bSeq = toNumber(b?.sequenceNumber) ?? 0;
      return aSeq - bSeq;
    });

  sorted.forEach((portion: any) => {
    const gramWeight = toNumber(portion?.gramWeight);
    if (!gramWeight || gramWeight <= 0) return;
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
  const nutrientCalories = toNumber(
    food?.foodNutrients?.find((n: any) => n?.nutrientId === 1008)?.value
  );
  const labelProtein = toNumber(food?.labelNutrients?.protein?.value);
  const nutrientProtein = toNumber(
    food?.foodNutrients?.find((n: any) => n?.nutrientId === 1003)?.value
  );
  const labelCarbs = toNumber(food?.labelNutrients?.carbohydrates?.value ?? food?.labelNutrients?.carbs?.value);
  const nutrientCarbs = toNumber(
    food?.foodNutrients?.find((n: any) => n?.nutrientId === 1005)?.value
  );
  const labelFat = toNumber(food?.labelNutrients?.fat?.value);
  const nutrientFat = toNumber(
    food?.foodNutrients?.find((n: any) => n?.nutrientId === 1004)?.value
  );

  const base = ensureMacroBreakdown({
    kcal: labelCalories ?? nutrientCalories ?? undefined,
    protein: labelProtein ?? nutrientProtein ?? undefined,
    carbs: labelCarbs ?? nutrientCarbs ?? undefined,
    fat: labelFat ?? nutrientFat ?? undefined,
  });

  const defaultServing = ensureDefaultServing(servings);
  const perServing = macrosFromGrams(base, defaultServing?.grams ?? null);

  return {
    id: String(
      food?.fdcId ??
        food?.gtinUpc ??
        food?.ndbNumber ??
        globalThis.crypto?.randomUUID?.() ??
        Date.now(),
    ),
    name:
      typeof food?.description === "string" && food.description.trim().length
        ? food.description.trim()
        : "Food",
    brand:
      normalizeBrand(food?.brandOwner) ??
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

function parseServingSizeText(text: string | null | undefined) {
  if (!text) return null;
  const match = text.match(/([0-9]+(?:\.[0-9]+)?)\s*(g|gram|grams|ml|milliliter|milliliters|oz|ounce|ounces)/i);
  if (!match) return null;
  const qty = toNumber(match[1]);
  const unit = match[2]?.toLowerCase();
  if (!qty || !unit) return null;
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

async function requestJson(url: URL, init: RequestInit, label: string): Promise<any> {
  let lastError: HttpError | null = null;

  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      const response = await fetch(url.toString(), {
        ...init,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) {
          throw new HttpError(502, "upstream_4xx", `${label}_${response.status}`);
        }
        lastError = new HttpError(502, "upstream_timeout", `${label}_${response.status}`);
        if (attempt === 1) {
          throw lastError;
        }
        continue;
      }

      return await response.json();
    } catch (error) {
      if (error instanceof HttpError) {
        if (error.code === "upstream_4xx" || attempt === 1) {
          throw error;
        }
        lastError = error;
        continue;
      }

      const message = error instanceof Error ? error.message : String(error);
      lastError = new HttpError(502, "upstream_timeout", `${label}_${message}`);
      if (error instanceof Error && error.name === "AbortError" && attempt < 1) {
        continue;
      }
      if (attempt === 1) {
        throw lastError;
      }
    }
  }

  throw lastError ?? new HttpError(502, "upstream_timeout", `${label}_unknown`);
}

export function fromOpenFoodFacts(product: any): FoodItem | null {
  if (!product) return null;

  const servings: ServingOption[] = [];
  const seen = new Set<string>();
  addServing("off", servings, seen, { label: "100 g", grams: 100, isDefault: true });

  const servingQty = toNumber(product?.serving_quantity);
  const servingUnit = typeof product?.serving_size_unit === "string" ? product.serving_size_unit.toLowerCase() : null;
  let convertedGrams: number | null = null;
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
    name:
      typeof product?.product_name === "string" && product.product_name.trim().length
        ? product.product_name.trim()
        : typeof product?.generic_name === "string" && product.generic_name.trim().length
        ? product.generic_name.trim()
        : "Food",
    brand:
      normalizeBrand(product?.brands) ??
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

async function searchUsda(query: string, apiKey: string | undefined): Promise<FoodItem[]> {
  if (!apiKey) return [];
  const url = new URL(USDA_SEARCH_URL);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("query", query);
  url.searchParams.set("pageSize", "20");
  url.searchParams.set("dataType", USDA_DATA_TYPES.join(","));

  const data = (await requestJson(
    url,
    {
      method: "GET",
      headers: { Accept: "application/json" },
    },
    "usda",
  )) as any;
  if (!Array.isArray(data?.foods)) return [];
  return data.foods.map((item: any) => fromUsdaFood(item)).filter(Boolean) as FoodItem[];
}

async function searchOpenFoodFacts(query: string): Promise<FoodItem[]> {
  const url = new URL(OFF_SEARCH_URL);
  url.searchParams.set("search_terms", query);
  url.searchParams.set("search_simple", "1");
  url.searchParams.set("action", "process");
  url.searchParams.set("json", "1");
  url.searchParams.set("page_size", "20");

  const data = (await requestJson(
    url,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "mybodyscan-nutrition-search/1.0",
      },
    },
    "off",
  )) as any;
  if (!Array.isArray(data?.products)) return [];
  return data.products.map((item: any) => fromOpenFoodFacts(item)).filter(Boolean) as FoodItem[];
}

function extractBearerToken(req: Request): string | null {
  const header = req.get("authorization") || req.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return null;
  }
  const token = match[1]?.trim();
  if (!token) {
    return null;
  }
  return token;
}

async function verifyAuthorization(req: Request): Promise<{ uid: string | null }> {
  const token = extractBearerToken(req);
  if (!token) return { uid: null };
  try {
    const decoded = await getAuth().verifyIdToken(token);
    return { uid: decoded.uid ?? null };
  } catch (error) {
    const message = (error as { message?: string })?.message ?? String(error);
    const code = (error as { code?: string })?.code ?? "";
    if (
      code === "app/no-app" ||
      code === "app/invalid-credential" ||
      message.includes("credential") ||
      message.includes("initializeApp")
    ) {
      console.warn("no_admin_verify", { reason: message || code || "unknown" });
      return { uid: null };
    }

    console.warn("nutrition_search.auth_failed", { message });
    throw new HttpError(401, "unauthorized", "invalid_token");
  }
}

function simplifyFoodItem(item: FoodItem): NormalizedFoodItem {
  const serving = typeof item?.serving?.qty === "number" ? item.serving.qty : null;
  const perServing = (item?.per_serving || {}) as Partial<{
    kcal: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  }>;
  return {
    id: item.id,
    name: item.name,
    brand: item.brand ?? null,
    calories: typeof perServing.kcal === "number" ? perServing.kcal : null,
    protein: typeof perServing.protein_g === "number" ? perServing.protein_g : null,
    carbs: typeof perServing.carbs_g === "number" ? perServing.carbs_g : null,
    fat: typeof perServing.fat_g === "number" ? perServing.fat_g : null,
    serving,
    unit: serving ? "g" : null,
    source: item.source,
  };
}

type SourceResult = { items: FoodItem[]; error?: HttpError | null };

async function runSafe(
  source: NutritionSource,
  fn: () => Promise<FoodItem[]>,
  context: { requestId: string; uid: string | null },
): Promise<SourceResult> {
  try {
    const items = await fn();
    return { items };
  } catch (error) {
    if (error instanceof HttpError) {
      console.warn(`nutrition_${source.toLowerCase().replace(/\s+/g, "_")}_error`, {
        code: error.code,
        message: error.message,
        requestId: context.requestId,
        uid: context.uid ?? "anonymous",
      });
      return { items: [], error };
    }

    console.warn(`nutrition_${source.toLowerCase().replace(/\s+/g, "_")}_error`, {
      code: "upstream_timeout",
      message: describeError(error),
      requestId: context.requestId,
      uid: context.uid ?? "anonymous",
    });
    return { items: [], error: new HttpError(502, "upstream_timeout") };
  }
}

function handleError(res: Response, error: unknown): void {
  if (error instanceof HttpError) {
    if (error.status === 429) {
      res.status(429).json({ code: "rate_limited", message: "Too many requests. Please slow down." });
      return;
    }
    if (error.status === 401) {
      res.status(401).json({ code: error.code || "unauthorized", message: error.message || "Unauthorized" });
      return;
    }
    res.status(503).json({
      code: "nutrition_backend_error",
      message: "Food database temporarily unavailable; please try again.",
    });
    return;
  }

  console.error("nutrition_search_unhandled", { message: describeError(error) });
  res.status(503).json({
    code: "nutrition_backend_error",
    message: "Food database temporarily unavailable; please try again.",
  });
}

async function handleNutritionSearch(req: Request, res: Response): Promise<void> {
  try {
    if (req.method === "OPTIONS") {
      send(res, 204, null);
      return;
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST,OPTIONS");
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }

    const body = (req.body && typeof req.body === "object" ? req.body : {}) as Partial<NutritionSearchRequest> &
      Record<string, unknown>;
    const rawTerm =
      body.query ??
      (body as any).term ??
      (body as any).search ??
      (body as any).q ??
      (body as any).text ??
      "";

    const query = rawTerm != null ? String(rawTerm).trim() : "";

    if (!query) {
      res.status(400).json({ status: "upstream_error", results: [], code: "invalid_query", message: "Search query required" });
      return;
    }

    const sourcePreference =
      body.sourcePreference === "off-first" || body.sourcePreference === "combined" || body.sourcePreference === "usda-first"
        ? body.sourcePreference
        : "usda-first";

    const auth = await verifyAuthorization(req);
    const uid = auth.uid;

    const rateLimit = await ensureRateLimit({
      key: "nutrition_search",
      identifier: uid ?? identifierFromRequest(req as any),
      limit: 20,
      windowSeconds: 60,
    });

    if (!rateLimit.allowed) {
      send(res, 429, {
        error: "rate_limited",
        retryAfter: rateLimit.retryAfterSeconds ?? null,
      });
      return;
    }

    const apiKey = getUsdaApiKey();
    const requestId = (req.get("x-request-id") || req.get("X-Request-Id") || "").trim() || randomUUID();
    const errors: HttpError[] = [];

    const usdaResult = await runSafe("USDA", () => searchUsda(query, apiKey), { requestId, uid });
    if (usdaResult.error) errors.push(usdaResult.error);

    const shouldTryOffFirst = sourcePreference === "off-first";
    let items = shouldTryOffFirst ? [] : usdaResult.items;
    let source: NutritionSource | null = items.length ? "USDA" : null;

    const offResult = await runSafe("Open Food Facts", () => searchOpenFoodFacts(query), { requestId, uid });
    if (offResult.error) errors.push(offResult.error);

    if (!items.length || shouldTryOffFirst) {
      if (offResult.items.length) {
        items = offResult.items;
        source = "Open Food Facts";
      } else if (!items.length) {
        items = usdaResult.items;
        source = items.length ? "USDA" : source;
      }
    }

    if (!items.length && errors.length) {
      const message = "Food database temporarily unavailable; please try again.";
      send(res, 200, { status: "upstream_error", results: [], message });
      return;
    }

    const normalized = items.map(simplifyFoodItem);
    send(res, 200, { status: "ok", results: normalized, source });
  } catch (error) {
    handleError(res, error);
  }
}

export { handleNutritionSearch as nutritionSearchHandler };

export const nutritionSearch = onRequest(
  {
    region: "us-central1",
    secrets: [usdaApiKeyParam],
    invoker: "public",
    concurrency: 20,
    appCheck: { enforcement: "UNENFORCED" },
  },
  (req: Request, res: Response) =>
    chain(withCors, appCheckSoft)(req, res, () => void handleNutritionSearch(req, res)),
);

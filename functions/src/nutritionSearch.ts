import * as functions from "firebase-functions";
import { onRequest } from "firebase-functions/v2/https";
import type { Request, Response } from "express";
import { withCors } from "./middleware/cors.js";
import { softAppCheck } from "./middleware/appCheck.js";

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

export interface NormalizedItem {
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
  per_100g: {
    kcal: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
  } | null;
  fdcId?: number;
  gtin?: string;
  raw?: any;
}

const USDA_KEY =
  process.env.USDA_FDC_API_KEY ||
  (functions.config().usda && functions.config().usda.key) ||
  "";

const USDA_SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search";
const OFF_SEARCH_URL = "https://world.openfoodfacts.org/cgi/search.pl";

const USDA_DATA_TYPES = ["Branded", "Survey (FNDDS)", "SR Legacy", "Foundation"];
const FETCH_TIMEOUT_MS = 6000;

function describeError(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function round(value: number, decimals = 0): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function ensureMacroBreakdown(input: Partial<MacroBreakdown>): MacroBreakdown {
  return {
    kcal: input.kcal != null && Number.isFinite(input.kcal) ? round(input.kcal, 0) : 0,
    protein: input.protein != null && Number.isFinite(input.protein) ? round(input.protein, 1) : 0,
    carbs: input.carbs != null && Number.isFinite(input.carbs) ? round(input.carbs, 1) : 0,
    fat: input.fat != null && Number.isFinite(input.fat) ? round(input.fat, 1) : 0,
  };
}

function macrosFromGrams(base: MacroBreakdown, grams: number | null): {
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
} {
  if (!grams || grams <= 0) {
    return { kcal: null, protein_g: null, carbs_g: null, fat_g: null };
  }
  const factor = grams / 100;
  return {
    kcal: round(base.kcal * factor, 0),
    protein_g: round(base.protein * factor, 1),
    carbs_g: round(base.carbs * factor, 1),
    fat_g: round(base.fat * factor, 1),
  };
}

function makeServingId(prefix: string, index: number, grams: number) {
  return `${prefix}-${index}-${round(grams, 3)}`;
}

function addServingOption(
  servings: ServingOption[],
  seen: Set<string>,
  option: { label: string; grams: number; isDefault?: boolean },
  prefix: string,
) {
  if (!option.grams || option.grams <= 0) return;
  const key = `${option.label.toLowerCase()}-${round(option.grams, 3)}`;
  if (seen.has(key)) return;
  const index = servings.length;
  const id = makeServingId(prefix, index, option.grams);
  servings.push({ id, label: option.label, grams: round(option.grams, 2), isDefault: option.isDefault });
  seen.add(key);
}

function ensureDefaultServing(servings: ServingOption[]): ServingOption {
  const existingDefault = servings.find((serving) => serving.isDefault);
  if (existingDefault) return existingDefault;
  if (servings.length > 1) {
    servings[1].isDefault = true;
    return servings[1];
  }
  servings[0]!.isDefault = true;
  return servings[0]!;
}

export function fromUsdaFood(food: any): NormalizedItem | null {
  if (!food) return null;

  const servings: ServingOption[] = [];
  const seen = new Set<string>();
  addServingOption(servings, seen, { label: "100 g", grams: 100, isDefault: true }, "usda");

  const portions = Array.isArray(food?.foodPortions) ? food.foodPortions : [];
  const sortedPortions = portions
    .filter((portion: any) => toNumber(portion?.gramWeight) && toNumber(portion?.gramWeight)! > 0)
    .sort((a: any, b: any) => {
      const aSeq = toNumber(a?.sequenceNumber) ?? 0;
      const bSeq = toNumber(b?.sequenceNumber) ?? 0;
      return aSeq - bSeq;
    });

  sortedPortions.forEach((portion: any) => {
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
    addServingOption(
      servings,
      seen,
      {
        label: label || `${round(amount ?? 1, 2)} serving`,
        grams: gramWeight,
        isDefault: false,
      },
      "usda",
    );
  });

  const nutrients = Array.isArray(food?.foodNutrients) ? food.foodNutrients : [];
  const findNutrient = (match: string, unit?: string) => {
    const lowerMatch = match.toLowerCase();
    const lowerUnit = unit?.toLowerCase();
    const entry = nutrients.find((nutrient: any) => {
      const name = typeof nutrient?.nutrientName === "string" ? nutrient.nutrientName.toLowerCase() : "";
      if (!name.includes(lowerMatch)) return false;
      if (!lowerUnit) return true;
      const nutrientUnit = typeof nutrient?.unitName === "string" ? nutrient.unitName.toLowerCase() : "";
      return nutrientUnit === lowerUnit;
    });
    if (!entry) return null;
    return toNumber(entry?.value ?? entry?.amount);
  };

  const base = ensureMacroBreakdown({
    kcal: findNutrient("energy", "kcal") ?? toNumber(food?.labelNutrients?.calories?.value),
    protein: findNutrient("protein") ?? toNumber(food?.labelNutrients?.protein?.value),
    carbs:
      findNutrient("carbohydrate") ??
      toNumber(food?.labelNutrients?.carbohydrates?.value ?? food?.labelNutrients?.carbs?.value),
    fat: findNutrient("fat") ?? toNumber(food?.labelNutrients?.fat?.value),
  });

  const defaultServing = ensureDefaultServing(servings);
  const perServing = macrosFromGrams(base, defaultServing.grams);

  const servingSnapshot = {
    qty: defaultServing.grams != null ? round(defaultServing.grams, 2) : null,
    unit: defaultServing.grams != null ? "g" : defaultServing.label,
    text: defaultServing.label,
  };

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
      typeof food?.brandOwner === "string" && food.brandOwner.trim().length
        ? food.brandOwner.trim()
        : typeof food?.brandName === "string" && food.brandName.trim().length
        ? food.brandName.trim()
        : null,
    source: "USDA",
    basePer100g: base,
    servings,
    serving: servingSnapshot,
    per_serving: perServing,
    per_100g: {
      kcal: base.kcal,
      protein_g: base.protein,
      carbs_g: base.carbs,
      fat_g: base.fat,
    },
    fdcId: toNumber(food?.fdcId) ?? undefined,
    gtin:
      typeof food?.gtinUpc === "string" && food.gtinUpc.trim().length
        ? food.gtinUpc.trim()
        : undefined,
    raw: food,
  };
}

function parseServingSizeText(text: string | null | undefined): { label: string; grams: number | null } | null {
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
      return { label: text.trim(), grams: qty };
    case "ml":
    case "milliliter":
    case "milliliters":
      return { label: text.trim(), grams: qty };
    case "oz":
    case "ounce":
    case "ounces":
      return { label: text.trim(), grams: qty * 28.3495231 };
    default:
      return null;
  }
}

export function fromOpenFoodFacts(product: any): NormalizedItem | null {
  if (!product) return null;

  const servings: ServingOption[] = [];
  const seen = new Set<string>();
  addServingOption(servings, seen, { label: "100 g", grams: 100, isDefault: true }, "off");

  const servingQty = toNumber(product?.serving_quantity);
  const servingUnit = typeof product?.serving_size_unit === "string" ? product.serving_size_unit.toLowerCase() : null;
  let convertedGrams: number | null = null;
  if (servingQty && servingUnit) {
    switch (servingUnit) {
      case "g":
      case "gram":
      case "grams":
        convertedGrams = servingQty;
        break;
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

  const servingText =
    typeof product?.serving_size === "string" && product.serving_size.trim().length
      ? product.serving_size.trim()
      : null;
  const parsedText = parseServingSizeText(servingText);
  const gramsFromText = parsedText?.grams ?? null;
  const labelFromText = parsedText?.label ?? servingText ?? null;

  const grams = convertedGrams ?? gramsFromText;
  if (grams && grams > 0) {
    addServingOption(
      servings,
      seen,
      {
        label: labelFromText || `${round(grams, 2)} g`,
        grams,
        isDefault: servings.length === 1,
      },
      "off",
    );
  }

  const nutriments = product?.nutriments ?? {};
  const base = ensureMacroBreakdown({
    kcal:
      toNumber(nutriments?.["energy-kcal_100g"]) ??
      toNumber(nutriments?.energy_kcal_100g) ??
      toNumber(nutriments?.energy_100g && nutriments.energy_100g / 4.184),
    protein: toNumber(nutriments?.proteins_100g),
    carbs: toNumber(nutriments?.carbohydrates_100g),
    fat: toNumber(nutriments?.fat_100g),
  });

  const defaultServing = ensureDefaultServing(servings);
  const perServing = macrosFromGrams(base, defaultServing.grams);

  const servingSnapshot = {
    qty: defaultServing.grams != null ? round(defaultServing.grams, 2) : null,
    unit: defaultServing.grams != null ? "g" : defaultServing.label,
    text: defaultServing.label,
  };

  return {
    id: String(
      product?.code || product?._id || product?.id || globalThis.crypto?.randomUUID?.() || Date.now(),
    ),
    name:
      typeof product?.product_name === "string" && product.product_name.trim().length
        ? product.product_name.trim()
        : typeof product?.generic_name === "string" && product.generic_name.trim().length
        ? product.generic_name.trim()
        : "Food",
    brand:
      typeof product?.brands === "string" && product.brands.trim().length
        ? product.brands.trim()
        : typeof product?.brand_owner === "string" && product.brand_owner.trim().length
        ? product.brand_owner.trim()
        : null,
    source: "Open Food Facts",
    basePer100g: base,
    servings,
    serving: servingSnapshot,
    per_serving: perServing,
    per_100g: {
      kcal: base.kcal,
      protein_g: base.protein,
      carbs_g: base.carbs,
      fat_g: base.fat,
    },
    gtin:
      typeof product?.code === "string" && product.code.trim().length ? product.code.trim() : undefined,
    raw: product,
  };
}

async function searchUsda(query: string): Promise<NormalizedItem[]> {
  if (!USDA_KEY) return [];
  const url = new URL(USDA_SEARCH_URL);
  url.searchParams.set("api_key", USDA_KEY);
  url.searchParams.set("query", query);
  url.searchParams.set("pageSize", "15");
  url.searchParams.set("dataType", USDA_DATA_TYPES.join(","));
  const controller = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: controller,
  });
  if (!response.ok) {
    throw new Error(`usda_${response.status}`);
  }
  const data = await response.json();
  if (!Array.isArray(data?.foods)) return [];
  return data.foods.map((item: any) => fromUsdaFood(item)).filter(Boolean) as NormalizedItem[];
}

async function searchOpenFoodFacts(query: string): Promise<NormalizedItem[]> {
  const url = new URL(OFF_SEARCH_URL);
  url.searchParams.set("search_terms", query);
  url.searchParams.set("search_simple", "1");
  url.searchParams.set("action", "process");
  url.searchParams.set("json", "1");
  url.searchParams.set("page_size", "15");
  const controller = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { "User-Agent": "mybodyscan-nutrition-search/1.0", Accept: "application/json" },
    signal: controller,
  });
  if (!response.ok) {
    throw new Error(`off_${response.status}`);
  }
  const data = await response.json();
  if (!Array.isArray(data?.products)) return [];
  return data.products.map((item: any) => fromOpenFoodFacts(item)).filter(Boolean) as NormalizedItem[];
}

async function handler(req: Request, res: Response) {
  const hasAppCheck = await softAppCheck(req as any);
  if (!hasAppCheck) {
    console.warn("nutrition_search_appcheck_missing", {
      origin: req.headers.origin ?? null,
      userAgent: req.headers["user-agent"] ?? null,
    });
  }

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

  let items: NormalizedItem[] = [];

  try {
    items = await searchUsda(query);
  } catch (error) {
    console.error("nutrition_search_usda_error", {
      query,
      message: describeError(error),
    });
  }

  if (!items.length) {
    try {
      items = await searchOpenFoodFacts(query);
    } catch (error) {
      console.error("nutrition_search_off_error", {
        query,
        message: describeError(error),
      });
    }
  }

  if (!items.length) {
    console.error("nutrition_search_total_failure", { query });
  }

  res.status(200).json({ items });
}

export const nutritionSearch = onRequest(
  { region: "us-central1", secrets: ["USDA_FDC_API_KEY"], invoker: "public", concurrency: 20 },
  withCors(async (req, res) => {
    try {
      await handler(req as Request, res as Response);
    } catch (error) {
      console.error("nutrition_search_unhandled", {
        message: describeError(error),
      });
      res.status(200).json({ items: [] });
    }
  }),
);

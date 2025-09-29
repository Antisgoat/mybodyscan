import * as functions from "firebase-functions";
import { HttpsError, onRequest, type Request } from "firebase-functions/v2/https";
import { withCors } from "../middleware/cors.js";
import { softVerifyAppCheck } from "../middleware/appCheck.js";
import { requireAuth, verifyAppCheckSoft } from "../http.js";

type MacroBreakdown = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
};

type ServingOption = {
  id: string;
  label: string;
  grams: number;
  isDefault?: boolean;
};

interface NormalizedFood {
  id: string;
  source: "USDA" | "OFF";
  name: string;
  brand: string | null;
  basePer100g: MacroBreakdown;
  servings: ServingOption[];
  gtin?: string | null;
  fdcId?: number;
}

const USDA_KEY =
  process.env.USDA_FDC_API_KEY || (functions.config().usda && functions.config().usda.key) || "";

const USDA_SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search";
const OFF_SEARCH_URL = "https://world.openfoodfacts.org/cgi/search.pl";

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

function makeServingId(prefix: string, index: number, grams: number) {
  return `${prefix}-${index}-${round(grams, 3)}`;
}

function addServingOption(
  list: ServingOption[],
  option: ServingOption,
  seen: Set<string>,
  forceDefault = false,
) {
  const key = `${option.label.toLowerCase()}-${round(option.grams, 3)}`;
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  if (forceDefault) {
    list.forEach((entry) => {
      entry.isDefault = false;
    });
    option.isDefault = true;
  }
  list.push(option);
}

function normalizeUsdaFood(food: any): NormalizedFood | null {
  if (!food) return null;

  const servings: ServingOption[] = [];
  const seen = new Set<string>();
  addServingOption(servings, { id: "100g", label: "100 g", grams: 100, isDefault: true }, seen, true);

  const portions = Array.isArray(food?.foodPortions) ? food.foodPortions : [];
  const sortedPortions = portions
    .filter((portion: any) => toNumber(portion?.gramWeight) && toNumber(portion?.gramWeight)! > 0)
    .sort((a: any, b: any) => {
      const aSeq = toNumber(a?.sequenceNumber) ?? 0;
      const bSeq = toNumber(b?.sequenceNumber) ?? 0;
      return aSeq - bSeq;
    });

  let referenceGrams: number | null = null;

  sortedPortions.forEach((portion: any, index: number) => {
    const gramWeight = toNumber(portion?.gramWeight);
    if (!gramWeight || gramWeight <= 0) return;
    if (referenceGrams === null) {
      referenceGrams = gramWeight;
    }

    const amount = toNumber(portion?.amount) ?? 1;
    const modifier = typeof portion?.modifier === "string" ? portion.modifier.trim() : "";
    const description = typeof portion?.portionDescription === "string" ? portion.portionDescription.trim() : "";
    const measureUnit = portion?.measureUnit;
    const measureName = typeof measureUnit?.name === "string" ? measureUnit.name.trim() : "";
    const measureAbbr = typeof measureUnit?.abbreviation === "string" ? measureUnit.abbreviation.trim() : "";

    const labelParts = [
      amount && amount !== 1 ? amount : null,
      description || modifier || measureAbbr || measureName || "serving",
    ].filter(Boolean);
    const label = labelParts.join(" ");

    addServingOption(
      servings,
      {
        id: makeServingId("usda", index, gramWeight),
        label: label || `${round(amount ?? 1, 2)} serving`,
        grams: round(gramWeight, 2),
      },
      seen,
    );
  });

  if (referenceGrams === null) {
    const servingSize = toNumber(food?.servingSize);
    const unit = typeof food?.servingSizeUnit === "string" ? food.servingSizeUnit.toLowerCase() : "";
    if (servingSize && unit === "g") {
      referenceGrams = servingSize;
      const label =
        typeof food?.householdServingFullText === "string" && food.householdServingFullText.trim().length
          ? food.householdServingFullText.trim()
          : `${round(servingSize, 2)} g`;
      addServingOption(
        servings,
        {
          id: makeServingId("usda-default", 0, servingSize),
          label,
          grams: round(servingSize, 2),
        },
        seen,
      );
    }
  }

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

  const base: Partial<MacroBreakdown> = {
    kcal: findNutrient("energy", "kcal"),
    protein: findNutrient("protein"),
    carbs: findNutrient("carbohydrate"),
    fat: findNutrient("fat"),
  };

  const label = food?.labelNutrients ?? {};
  const servingGrams = referenceGrams ?? toNumber(food?.servingSizeUnit === "g" ? food?.servingSize : null);
  if (servingGrams && servingGrams > 0) {
    const factor = 100 / servingGrams;
    const calories = toNumber(label?.calories?.value ?? label?.calories);
    const protein = toNumber(label?.protein?.value ?? label?.protein);
    const carbs = toNumber(label?.carbohydrates?.value ?? label?.carbohydrates);
    const fat = toNumber(label?.fat?.value ?? label?.fat);
    if (base.kcal == null && calories != null) base.kcal = calories * factor;
    if (base.protein == null && protein != null) base.protein = protein * factor;
    if (base.carbs == null && carbs != null) base.carbs = carbs * factor;
    if (base.fat == null && fat != null) base.fat = fat * factor;
  }

  const normalizedBase = ensureMacroBreakdown(base);

  if (!servings.length) {
    addServingOption(servings, { id: "100g", label: "100 g", grams: 100, isDefault: true }, seen, true);
  }

  const description = typeof food?.description === "string" ? food.description.trim() : "";
  const brandOwner =
    (typeof food?.brandOwner === "string" && food.brandOwner.trim()) ||
    (typeof food?.brandName === "string" && food.brandName.trim()) ||
    null;

  return {
    id: String(food?.fdcId ?? food?.id ?? `${Date.now()}`),
    source: "USDA",
    name: description || "Food",
    brand: brandOwner,
    basePer100g: normalizedBase,
    servings,
    gtin: typeof food?.gtinUpc === "string" && food.gtinUpc.trim().length ? food.gtinUpc : undefined,
    fdcId: toNumber(food?.fdcId) ?? undefined,
  };
}

function parseOffServing(product: any): { label: string; grams: number } | null {
  const quantity = toNumber(product?.serving_quantity);
  const unitRaw = typeof product?.serving_size_unit === "string" ? product.serving_size_unit : null;
  const normalizedUnit = unitRaw ? unitRaw.trim().toLowerCase() : null;

  const servingSizeText = typeof product?.serving_size === "string" ? product.serving_size.trim() : "";
  const tryConvert = (qty: number | null, unit: string | null): number | null => {
    if (!qty || qty <= 0 || !unit) return null;
    switch (unit.toLowerCase()) {
      case "g":
      case "gram":
      case "grams":
        return qty;
      case "kg":
        return qty * 1000;
      case "oz":
      case "ounce":
      case "ounces":
        return qty * 28.3495231;
      case "lb":
      case "pound":
      case "pounds":
        return qty * 453.59237;
      case "ml":
      case "milliliter":
      case "milliliters":
        return qty;
      case "l":
      case "liter":
      case "liters":
        return qty * 1000;
      default:
        return null;
    }
  };

  let grams = tryConvert(quantity, normalizedUnit);
  if (!grams && servingSizeText) {
    const match = servingSizeText.match(/([\d.,]+)\s*(g|kg|oz|lb|ml|l)/i);
    if (match) {
      grams = tryConvert(toNumber(match[1]?.replace(/,/g, "")), match[2]);
    }
  }

  if (!grams || grams <= 0) return null;

  const label = servingSizeText || `${round(quantity ?? 1, 2)} ${unitRaw ?? "serving"}`;
  return { label, grams: round(grams, 2) };
}

function normalizeOffProduct(product: any): NormalizedFood | null {
  if (!product) return null;
  const nutriments = product?.nutriments ?? {};
  const energy =
    toNumber(nutriments["energy-kcal_100g"]) ??
    (nutriments.energy_100g ? toNumber(Number(nutriments.energy_100g) / 4.184) : null);
  const base = ensureMacroBreakdown({
    kcal: energy ?? undefined,
    protein: toNumber(nutriments.proteins_100g) ?? undefined,
    carbs: toNumber(nutriments.carbohydrates_100g) ?? undefined,
    fat: toNumber(nutriments.fat_100g) ?? undefined,
  });

  const servings: ServingOption[] = [];
  const seen = new Set<string>();
  addServingOption(servings, { id: "100g", label: "100 g", grams: 100, isDefault: true }, seen, true);

  const parsed = parseOffServing(product);
  if (parsed) {
    addServingOption(
      servings,
      {
        id: makeServingId("off", 0, parsed.grams),
        label: parsed.label,
        grams: parsed.grams,
      },
      seen,
    );
  }

  const name =
    (typeof product?.product_name === "string" && product.product_name.trim()) ||
    (typeof product?.generic_name === "string" && product.generic_name.trim()) ||
    (Array.isArray(product?.brands_tags) && product.brands_tags[0]) ||
    "Food";

  let brand: string | null = null;
  if (typeof product?.brands === "string" && product.brands.trim()) {
    brand = product.brands.trim();
  } else if (Array.isArray(product?.brands_tags) && product.brands_tags.length) {
    brand = product.brands_tags.join(", ");
  }

  return {
    id: String(product?.code ?? product?.id ?? name),
    source: "OFF",
    name,
    brand: brand || null,
    basePer100g: base,
    servings,
    gtin: typeof product?.code === "string" && product.code.trim().length ? product.code : undefined,
  };
}

async function searchUsda(query: string): Promise<NormalizedFood[]> {
  if (!USDA_KEY) {
    return [];
  }
  const url = new URL(USDA_SEARCH_URL);
  url.searchParams.set("query", query);
  url.searchParams.set("pageSize", "15");
  ["Branded", "Survey (FNDDS)", "SR Legacy", "Foundation"].forEach((type) => {
    url.searchParams.append("dataType", type);
  });
  url.searchParams.set("api_key", USDA_KEY);

  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) {
    throw new Error(`usda_${response.status}`);
  }
  const data = await response.json();
  if (!Array.isArray(data?.foods)) {
    return [];
  }
  return data.foods
    .map((food: any) => normalizeUsdaFood(food))
    .filter((item): item is NormalizedFood => Boolean(item));
}

async function searchOpenFoodFacts(query: string): Promise<NormalizedFood[]> {
  const url = new URL(OFF_SEARCH_URL);
  url.searchParams.set("search_simple", "1");
  url.searchParams.set("action", "process");
  url.searchParams.set("json", "1");
  url.searchParams.set("page_size", "15");
  url.searchParams.set("search_terms", query);

  const response = await fetch(url, {
    headers: { "User-Agent": "mybodyscan-functions" },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(`off_${response.status}`);
  }
  const data = await response.json();
  if (!Array.isArray(data?.products)) {
    return [];
  }
  return data.products
    .map((product: any) => normalizeOffProduct(product))
    .filter((item): item is NormalizedFood => Boolean(item));
}

async function handler(req: Request, res: any) {
  await softVerifyAppCheck(req as any, res as any);
  await verifyAppCheckSoft(req);
  await requireAuth(req);

  if (req.headers["x-firebase-appcheck"] === undefined) {
    console.warn("nutritionSearch: no AppCheck token");
  }

  const queryText = String(req.query?.q || req.body?.q || "").trim();
  if (!queryText) {
    res.status(400).json({ items: [] });
    return;
  }

  let items: NormalizedFood[] = [];
  let usdaErrored = false;
  let fallbackError: unknown = null;

  try {
    items = await searchUsda(queryText);
  } catch (error) {
    usdaErrored = true;
    console.error("usda_search_error", error);
  }

  if (!items.length) {
    try {
      items = await searchOpenFoodFacts(queryText);
    } catch (error) {
      fallbackError = error;
      console.error("off_search_error", error);
    }
  }

  if (!items.length && fallbackError && usdaErrored) {
    res.status(500).json({ items: [], error: "upstream_error" });
    return;
  }

  if (!items.length && fallbackError && !usdaErrored) {
    res.status(500).json({ items: [], error: "upstream_error" });
    return;
  }

  res.set("Cache-Control", "public, max-age=300");
  res.json({ items });
}

export const nutritionSearch = onRequest({
  region: "us-central1",
  secrets: ["USDA_FDC_API_KEY"],
  invoker: "public",
}, withCors(async (req, res) => {
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
    console.error("nutrition_search_unhandled", error);
    res.status(500).json({ error: error?.message || "error" });
  }
}));

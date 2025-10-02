import { buildUrl, nutritionFnUrl } from "@/lib/api";
import { fnUrl } from "@/lib/env";

const TIMEOUT_MS = 3000;

interface FoodSearchApiServing {
  id?: string | number;
  label?: string;
  grams?: number | string | null;
  isDefault?: boolean;
}

interface FoodSearchApiItem {
  id?: string | number;
  name?: string;
  brand?: string | null;
  source?: string;
  fdcId?: number | string | null;
  gtin?: string | null;
  upc?: string | null;
  basePer100g?: Partial<MacroPer100g> | null;
  servings?: FoodSearchApiServing[] | null;
  serving?: {
    qty?: number | null;
    unit?: string | null;
    text?: string | null;
  } | null;
  per_serving?: {
    kcal?: number | null;
    protein_g?: number | null;
    carbs_g?: number | null;
    fat_g?: number | null;
  } | null;
  per_100g?: {
    kcal?: number | null;
    protein_g?: number | null;
    carbs_g?: number | null;
    fat_g?: number | null;
  } | null;
  raw?: any;
}

export type NutritionSource = "USDA" | "Open Food Facts" | "OFF";

export interface ServingOption {
  id: string;
  label: string;
  grams: number;
  isDefault?: boolean;
}

export interface MacroPer100g {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface NormalizedItem {
  id: string;
  name: string;
  brand?: string | null;
  source: NutritionSource;
  gtin?: string;
  fdcId?: number;
  raw?: any;
  basePer100g?: MacroPer100g | null;
  servings?: ServingOption[];
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
  };
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function round(value: number, decimals = 0) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function convertToGrams(quantity: number | null | undefined, unit: string | null | undefined) {
  if (!quantity || quantity <= 0 || !unit) return null;
  const normalized = unit.trim().toLowerCase();
  switch (normalized) {
    case "g":
    case "gram":
    case "grams":
      return quantity;
    case "kg":
    case "kilogram":
    case "kilograms":
      return quantity * 1000;
    case "oz":
    case "ounce":
    case "ounces":
      return quantity * 28.3495231;
    case "lb":
    case "lbs":
    case "pound":
    case "pounds":
      return quantity * 453.59237;
    case "ml":
    case "milliliter":
    case "milliliters":
      return quantity;
    case "l":
    case "liter":
    case "liters":
      return quantity * 1000;
    default:
      return null;
  }
}

function ensureMacroBreakdown(values: Partial<MacroPer100g>): MacroPer100g {
  return {
    kcal: values.kcal != null && Number.isFinite(values.kcal) ? round(values.kcal, 0) : 0,
    protein: values.protein != null && Number.isFinite(values.protein) ? round(values.protein, 1) : 0,
    carbs: values.carbs != null && Number.isFinite(values.carbs) ? round(values.carbs, 1) : 0,
    fat: values.fat != null && Number.isFinite(values.fat) ? round(values.fat, 1) : 0,
  };
}

function normalizeBasePer100g(raw: FoodSearchApiItem): MacroPer100g {
  const base = raw?.basePer100g ?? {};
  const per100g = raw?.per_100g ?? {};
  const values: Partial<MacroPer100g> = {};

  const assign = (key: keyof MacroPer100g, value: unknown) => {
    const num = toNumber(value);
    if (num != null) {
      values[key] = num;
    }
  };

  assign("kcal", base?.kcal);
  assign("protein", base?.protein);
  assign("carbs", base?.carbs);
  assign("fat", base?.fat);

  if (values.kcal == null) assign("kcal", per100g?.kcal);
  if (values.protein == null) assign("protein", (per100g as any)?.protein ?? per100g?.protein_g);
  if (values.carbs == null) assign("carbs", (per100g as any)?.carbs ?? per100g?.carbs_g);
  if (values.fat == null) assign("fat", (per100g as any)?.fat ?? per100g?.fat_g);

  return ensureMacroBreakdown(values);
}

function normalizeServings(raw: FoodSearchApiItem): ServingOption[] {
  const list: ServingOption[] = [];
  const seen = new Set<string>();

  const add = (serving: { id?: string | number; label: string; grams: number; isDefault?: boolean }) => {
    if (!serving.grams || serving.grams <= 0) return;
    const key = `${serving.label.toLowerCase()}-${round(serving.grams, 3)}`;
    if (seen.has(key)) return;
    seen.add(key);
    list.push({
      id: String(serving.id ?? `srv-${list.length}`),
      label: serving.label,
      grams: round(serving.grams, 2),
      isDefault: Boolean(serving.isDefault),
    });
  };

  if (Array.isArray(raw?.servings)) {
    raw.servings.forEach((option) => {
      const grams = toNumber(option?.grams);
      const label =
        typeof option?.label === "string" && option.label.trim().length
          ? option.label.trim()
          : grams
          ? `${round(grams, 2)} g`
          : "serving";
      if (!grams || grams <= 0) return;
      add({ id: option?.id, label, grams, isDefault: option?.isDefault });
    });
  }

  if (!list.length && raw?.serving) {
    const qty = toNumber(raw.serving.qty);
    const unit = typeof raw.serving.unit === "string" ? raw.serving.unit : null;
    const grams = convertToGrams(qty, unit);
    if (grams) {
      const label =
        (typeof raw.serving.text === "string" && raw.serving.text.trim()) ||
        (qty && unit ? `${qty} ${unit}` : `${round(grams, 2)} g`);
      add({ id: `srv-${list.length}`, label, grams, isDefault: true });
    }
  }

  const hasHundred = list.some((option) => Math.abs(option.grams - 100) < 0.001);
  if (!hasHundred) {
    add({ id: "100g", label: "100 g", grams: 100, isDefault: list.length === 0 });
  }

  if (!list.some((option) => option.isDefault)) {
    list[0].isDefault = true;
  }

  return list;
}

function buildPerServing(base: MacroPer100g, grams: number | null): {
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
    kcal: base.kcal ? round(base.kcal * factor, 0) : base.kcal === 0 ? 0 : null,
    protein_g: base.protein ? round(base.protein * factor, 1) : base.protein === 0 ? 0 : null,
    carbs_g: base.carbs ? round(base.carbs * factor, 1) : base.carbs === 0 ? 0 : null,
    fat_g: base.fat ? round(base.fat * factor, 1) : base.fat === 0 ? 0 : null,
  };
}

function buildPer100g(base: MacroPer100g, per100gRaw?: FoodSearchApiItem["per_100g"] | null) {
  const result = {
    kcal: base.kcal ? round(base.kcal, 0) : base.kcal === 0 ? 0 : null,
    protein_g: base.protein ? round(base.protein, 1) : base.protein === 0 ? 0 : null,
    carbs_g: base.carbs ? round(base.carbs, 1) : base.carbs === 0 ? 0 : null,
    fat_g: base.fat ? round(base.fat, 1) : base.fat === 0 ? 0 : null,
  };

  if (per100gRaw) {
    if (result.kcal == null) result.kcal = toNumber(per100gRaw.kcal);
    if (result.protein_g == null) result.protein_g = toNumber(per100gRaw.protein_g);
    if (result.carbs_g == null) result.carbs_g = toNumber(per100gRaw.carbs_g);
    if (result.fat_g == null) result.fat_g = toNumber(per100gRaw.fat_g);
  }

  const hasAny = [result.kcal, result.protein_g, result.carbs_g, result.fat_g].some(
    (value) => value != null && value !== 0,
  );
  return hasAny ? result : undefined;
}

function normalizeApiItem(raw: FoodSearchApiItem): NormalizedItem {
  const generatedId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `food-${Math.random().toString(36).slice(2, 10)}`;

  const name = typeof raw?.name === "string" && raw.name.trim().length ? raw.name.trim() : "Food";
  const brand =
    typeof raw?.brand === "string" && raw.brand.trim().length
      ? raw.brand.trim()
      : raw?.brand === null
      ? null
      : undefined;
  const rawSource = typeof raw?.source === "string" ? raw.source : null;
  const source: NutritionSource =
    rawSource === "Open Food Facts" || rawSource === "OFF"
      ? "Open Food Facts"
      : "USDA";
  const base = normalizeBasePer100g(raw);
  const servings = normalizeServings(raw);
  const defaultServing = servings.find((option) => option.isDefault) ?? servings[0] ?? null;
  const defaultGrams = defaultServing?.grams ?? null;
  const perServingFromBase = buildPerServing(base, defaultGrams);
  const perServingRaw = raw?.per_serving ?? {};
  const per_serving = {
    kcal: toNumber(perServingRaw?.kcal) ?? perServingFromBase.kcal,
    protein_g: toNumber(perServingRaw?.protein_g) ?? perServingFromBase.protein_g,
    carbs_g: toNumber(perServingRaw?.carbs_g) ?? perServingFromBase.carbs_g,
    fat_g: toNumber(perServingRaw?.fat_g) ?? perServingFromBase.fat_g,
  };

  const per_100g = buildPer100g(base, raw?.per_100g);

  const servingSnapshot = defaultServing
    ? {
        qty: defaultGrams != null ? round(defaultGrams, 2) : 1,
        unit: defaultGrams != null ? "g" : defaultServing.label,
        text: defaultServing.label,
      }
    : {
        qty: toNumber(raw?.serving?.qty) ?? null,
        unit:
          typeof raw?.serving?.unit === "string" && raw.serving.unit.trim().length
            ? raw.serving.unit
            : null,
        text:
          typeof raw?.serving?.text === "string" && raw.serving.text.trim().length
            ? raw.serving.text.trim()
            : undefined,
      };

  return {
    id: String(raw?.id ?? generatedId),
    name,
    brand,
    source,
    gtin:
      typeof raw?.gtin === "string" && raw.gtin.trim().length
        ? raw.gtin.trim()
        : typeof raw?.upc === "string" && raw.upc.trim().length
        ? raw.upc.trim()
        : undefined,
    fdcId: toNumber(raw?.fdcId) ?? undefined,
    raw: raw?.raw,
    basePer100g: base,
    servings,
    serving: servingSnapshot,
    per_serving,
    per_100g,
  };
}

async function callFunctions(path: string, init?: RequestInit): Promise<Response | null> {
  const url = fnUrl(path);
  if (!url) {
    return null;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
  } catch (error) {
    clearTimeout(timer);
    throw error;
  }
}

export async function searchFoods(query: string): Promise<NormalizedItem[]> {
  const trimmed = query?.trim();
  if (!trimmed) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const rewriteUrl = buildUrl("/api/nutrition/search", { q: trimmed });
    let response: Response;
    try {
      response = await fetch(rewriteUrl, {
        method: "GET",
        signal: controller.signal,
      });
      if (!response.ok) {
        const error: any = new Error(`rewrite_status_${response.status}`);
        error.status = response.status;
        throw error;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
      const fnUrl = nutritionFnUrl({ q: trimmed });
      response = await fetch(fnUrl, {
        method: "GET",
        signal: controller.signal,
      });
      if (!response.ok) {
        const fallbackError: any = new Error(`fn_status_${response.status}`);
        fallbackError.status = response.status;
        throw fallbackError;
      }
    }

    const data = await response
      .json()
      .catch(() => ({ items: [] as FoodSearchApiItem[] }));

    if (!Array.isArray(data?.items)) {
      return [];
    }

    return data.items.map((item: FoodSearchApiItem) => {
      const normalized = normalizeApiItem(item);
      return {
        ...normalized,
        brand: normalized.brand ?? null,
        source: normalized.source === "OFF" ? "Open Food Facts" : normalized.source,
      };
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function lookupBarcode(code: string): Promise<NormalizedItem | null> {
  if (!code?.trim()) return null;
  const response = await callFunctions(`/nutritionBarcode?code=${encodeURIComponent(code.trim())}`);
  if (!response) {
    return null;
  }
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    return null;
  }
  const data = await response.json();
  if (!data?.item) {
    return null;
  }
  const normalized = normalizeApiItem(data.item as FoodSearchApiItem);
  return {
    ...normalized,
    brand: normalized.brand ?? null,
    source: normalized.source === "OFF" ? "Open Food Facts" : normalized.source,
  };
}

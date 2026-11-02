import type { FoodItem } from "@/lib/nutrition/types";
import type { MealEntry, MealItemSnapshot } from "@/lib/nutritionBackend";

export const SERVING_UNITS = [
  "serving",
  "g",
  "kg",
  "oz",
  "lb",
  "ml",
  "l",
  "cups",
  "slices",
  "pieces",
] as const;
export type ServingUnit = (typeof SERVING_UNITS)[number];

const GRAMS_PER_OUNCE = 28.349523125;
const GRAMS_PER_POUND = 453.59237;

function nutrient(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function per100For(item: FoodItem) {
  if (Object.prototype.hasOwnProperty.call(item, "per_100g"))
    return item.per_100g ?? null;
  if (item.source === "User recipe" || !item.basePer100g) return null;
  return {
    kcal: nutrient(item.basePer100g.kcal),
    protein_g: nutrient(item.basePer100g.protein),
    carbs_g: nutrient(item.basePer100g.carbs),
    fat_g: nutrient(item.basePer100g.fat),
  };
}

function hasNutrients(value: FoodItem["per_100g"]) {
  return (
    !!value &&
    [value.kcal, value.protein_g, value.carbs_g, value.fat_g].some(
      (n) => nutrient(n) !== null
    )
  );
}

function round(value: number | null | undefined, places = 2) {
  if (nutrient(value) === null) return null;
  const factor = 10 ** places;
  const result = Math.round(value! * factor) / factor;
  return Number.isFinite(result) ? result : null;
}

function scaled(value: unknown, factor: number, places = 2) {
  const valid = nutrient(value);
  return valid === null ? null : round(valid * factor, places);
}

export function gramsToOunces(grams?: number | null) {
  if (!grams) return null;
  return round(grams / GRAMS_PER_OUNCE, 2);
}

export function kcalFromMacros(macros: {
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  alcohol?: number | null;
}): number {
  const p = Number(macros.protein || 0);
  const c = Number(macros.carbs || 0);
  const f = Number(macros.fat || 0);
  const a = Number(macros.alcohol || 0);
  return Math.round(p * 4 + c * 4 + f * 9 + a * 7);
}

function normalizeUnit(unit: string | null | undefined) {
  if (!unit) return null;
  const clean = unit.trim().toLowerCase();
  if (/^(kg|kilograms?)$/.test(clean)) return "kg";
  if (/^(g|grams?)$/.test(clean)) return "g";
  if (/^(oz|ounces?)$/.test(clean)) return "oz";
  if (/^(lbs?|pounds?)$/.test(clean)) return "lb";
  if (/^(ml|millilit(?:er|re)s?)$/.test(clean)) return "ml";
  if (/^(l|lit(?:er|re)s?)$/.test(clean)) return "l";
  if (clean.includes("cup")) return "cups";
  if (clean.includes("slice")) return "slices";
  if (clean.includes("piece")) return "pieces";
  if (clean.includes("serv")) return "serving";
  return clean;
}

function defaultServingOption(item: FoodItem) {
  if (Array.isArray(item.servings) && item.servings.length) {
    return item.servings.find((option) => option.isDefault) ?? item.servings[0];
  }
  return null;
}

function labelAmount(label: string): number | null {
  const fractions: Record<string, string> = {
    "½": "1/2",
    "¼": "1/4",
    "¾": "3/4",
    "⅓": "1/3",
    "⅔": "2/3",
    "⅛": "1/8",
    "⅜": "3/8",
    "⅝": "5/8",
    "⅞": "7/8",
  };
  const text = label
    .trim()
    .replace(/[½¼¾⅓⅔⅛⅜⅝⅞]/g, (char) => ` ${fractions[char]}`)
    .replace(/⁄/g, "/")
    .trim();
  const mixed = text.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)/);
  const fraction = text.match(/^(\d+)\s*\/\s*(\d+)/);
  if (mixed || fraction) {
    const parts = mixed ?? fraction!;
    const denominator = Number(parts[mixed ? 3 : 2]);
    const value =
      denominator > 0
        ? (mixed ? Number(parts[1]) : 0) +
          Number(parts[mixed ? 2 : 1]) / denominator
        : 0;
    return value > 0 && Number.isFinite(value) ? value : null;
  }
  const decimal = text.match(/^(\d+(?:\.\d+)?)/);
  if (decimal) return Number(decimal[1]) > 0 ? Number(decimal[1]) : null;
  if (/^half\b/i.test(text)) return 0.5;
  if (/^quarter\b/i.test(text)) return 0.25;
  return 1;
}

function servingOptionForUnit(item: FoodItem, unit: ServingUnit) {
  const matcher =
    unit === "cups"
      ? /\bcups?\b/i
      : unit === "slices"
        ? /\bslices?\b/i
        : unit === "pieces"
          ? /\b(pieces?|items?)\b/i
          : null;
  if (!matcher) return null;
  const option = item.servings?.find((candidate) =>
    matcher.test(candidate.label)
  );
  if (
    !option ||
    !option.grams ||
    !Number.isFinite(option.grams) ||
    option.grams <= 0
  )
    return null;
  const amount = labelAmount(option.label);
  if (!amount) return null;
  return {
    ...option,
    gramsPerUnit: option.grams / amount,
  };
}

function hasAnyPerServingMacro(item: FoodItem): boolean {
  const values = [
    item.per_serving?.kcal,
    item.per_serving?.protein_g,
    item.per_serving?.carbs_g,
    item.per_serving?.fat_g,
  ];
  return values.some((value) => nutrient(value) !== null);
}

export function availableServingUnits(item: FoodItem): ServingUnit[] {
  const units: ServingUnit[] = [];
  const hasPer100 = hasNutrients(per100For(item));
  if (hasAnyPerServingMacro(item) || estimateServingWeight(item)) {
    units.push("serving");
  }
  if (hasPer100) units.push("g", "oz", "kg", "lb");
  if (
    ["ml", "l"].includes(normalizeUnit(item.serving?.unit) ?? "") &&
    Number(item.serving?.qty) > 0 &&
    hasAnyPerServingMacro(item)
  ) {
    units.push("ml", "l");
  }
  (["cups", "slices", "pieces"] as const).forEach((unit) => {
    if (hasPer100 && servingOptionForUnit(item, unit)) units.push(unit);
  });
  return units.length ? units : ["serving"];
}

export function estimateServingWeight(item: FoodItem): number | null {
  const servingUnit = normalizeUnit(
    item.serving?.unit || item.serving?.text || null
  );
  const servingQty =
    typeof item.serving?.qty === "number" ? item.serving.qty : null;
  if (
    servingQty &&
    Number.isFinite(servingQty) &&
    servingQty > 0 &&
    servingUnit === "g"
  ) {
    return servingQty;
  }
  if (
    servingQty &&
    Number.isFinite(servingQty) &&
    servingQty > 0 &&
    servingUnit === "oz"
  ) {
    return servingQty * GRAMS_PER_OUNCE;
  }
  if (servingQty && servingQty > 0 && servingUnit === "kg")
    return round(servingQty * 1000);
  if (servingQty && servingQty > 0 && servingUnit === "lb")
    return round(servingQty * GRAMS_PER_POUND);
  // Neither liquid volume nor rounded nutrient ratios establishes mass.
  if (servingUnit === "ml" || servingUnit === "l" || !per100For(item))
    return null;
  const defaultServing = defaultServingOption(item);
  return defaultServing && defaultServing.grams > 0
    ? round(defaultServing.grams, 2)
    : null;
}

function gramsForSelection(
  item: FoodItem,
  qty: number,
  unit: ServingUnit
): number | null {
  switch (unit) {
    case "g":
      return qty;
    case "kg":
      return qty * 1000;
    case "oz":
      return qty * GRAMS_PER_OUNCE;
    case "lb":
      return qty * GRAMS_PER_POUND;
    case "ml":
    case "l":
      return null;
    case "serving": {
      // A labeled liquid serving has valid per-serving nutrients but no known
      // mass. Do not silently substitute the generic 100 g option.
      if (
        normalizeUnit(item.serving?.unit) === "ml" &&
        hasAnyPerServingMacro(item)
      ) {
        return null;
      }
      const est = estimateServingWeight(item);
      return est ? est * qty : null;
    }
    case "cups":
    case "slices":
    case "pieces": {
      const option = servingOptionForUnit(item, unit);
      return option ? option.gramsPerUnit * qty : null;
    }
    default:
      return null;
  }
}

export interface SelectionResult {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  grams: number | null;
}

export function calculateSelection(
  item: FoodItem,
  qty: number,
  unit: ServingUnit
): SelectionResult {
  if (
    !Number.isFinite(qty) ||
    qty <= 0 ||
    !availableServingUnits(item).includes(unit)
  ) {
    return {
      grams: null,
      calories: null,
      protein: null,
      carbs: null,
      fat: null,
    };
  }
  const grams = gramsForSelection(item, qty, unit);
  const perServing = item.per_serving;
  const per100 = per100For(item);

  // Source serving values win over rounding or differing energy factors in
  // per-100g records (e.g. a labeled large egg is one serving, not 100 g).
  if (unit === "serving" && hasAnyPerServingMacro(item)) {
    return {
      grams: round(grams),
      calories: scaled(perServing?.kcal, qty, 0),
      protein: scaled(perServing?.protein_g, qty),
      carbs: scaled(perServing?.carbs_g, qty),
      fat: scaled(perServing?.fat_g, qty),
    };
  }

  if (grams != null && per100) {
    const factor = grams / 100;
    return {
      grams: round(grams, 2),
      calories: scaled(per100.kcal, factor, 0),
      protein: scaled(per100.protein_g, factor),
      carbs: scaled(per100.carbs_g, factor),
      fat: scaled(per100.fat_g, factor),
    };
  }

  const normalizedServingUnit = normalizeUnit(item.serving?.unit);
  const servingQty =
    Number(item.serving?.qty) * (normalizedServingUnit === "l" ? 1000 : 1);
  const servingsFactor =
    (unit === "ml" || unit === "l") &&
    (normalizedServingUnit === "ml" || normalizedServingUnit === "l") &&
    Number.isFinite(servingQty) &&
    servingQty > 0
      ? (qty * (unit === "l" ? 1000 : 1)) / servingQty
      : qty;

  return {
    grams: grams != null ? round(grams, 2) : null,
    calories: scaled(perServing?.kcal, servingsFactor, 0),
    protein: scaled(perServing?.protein_g, servingsFactor),
    carbs: scaled(perServing?.carbs_g, servingsFactor),
    fat: scaled(perServing?.fat_g, servingsFactor),
  };
}

export function snapshotFromItem(item: FoodItem): MealItemSnapshot {
  return {
    id: item.id,
    name: item.name,
    brand: item.brand,
    source: item.source,
    serving: {
      qty: item.serving.qty,
      unit: item.serving.unit,
      text: item.serving.text,
    },
    per_serving: { ...item.per_serving },
    per_100g: per100For(item) ? { ...per100For(item)! } : null,
    servings: item.servings
      .filter((s) => Number.isFinite(s.grams) && s.grams > 0)
      .slice(0, 30)
      .map((s) => ({ ...s })),
    fdcId: item.fdcId ?? null,
    gtin: item.gtin ?? null,
  };
}

export function normalizedFromSnapshot(snapshot: MealItemSnapshot): FoodItem {
  return {
    id: snapshot.id || `snapshot-${Math.random().toString(36).slice(2, 8)}`,
    name: snapshot.name,
    brand: snapshot.brand ?? null,
    source:
      snapshot.source === "Open Food Facts" || snapshot.source === "OFF"
        ? "Open Food Facts"
        : snapshot.source === "User label"
          ? "User label"
          : snapshot.source === "User recipe"
            ? "User recipe"
            : "USDA",
    basePer100g: snapshot.per_100g
      ? {
          kcal: snapshot.per_100g.kcal ?? 0,
          protein: snapshot.per_100g.protein_g ?? 0,
          carbs: snapshot.per_100g.carbs_g ?? 0,
          fat: snapshot.per_100g.fat_g ?? 0,
        }
      : { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    servings:
      snapshot.servings
        ?.filter((s) => Number.isFinite(s.grams) && s.grams > 0)
        .map((s) => ({ ...s })) ?? [],
    serving: {
      qty: snapshot.serving?.qty ?? null,
      unit: snapshot.serving?.unit ?? null,
      text: snapshot.serving?.text ?? undefined,
    },
    per_serving: {
      kcal: snapshot.per_serving?.kcal ?? null,
      protein_g: snapshot.per_serving?.protein_g ?? null,
      carbs_g: snapshot.per_serving?.carbs_g ?? null,
      fat_g: snapshot.per_serving?.fat_g ?? null,
    },
    per_100g: snapshot.per_100g
      ? {
          kcal: snapshot.per_100g.kcal ?? null,
          protein_g: snapshot.per_100g.protein_g ?? null,
          carbs_g: snapshot.per_100g.carbs_g ?? null,
          fat_g: snapshot.per_100g.fat_g ?? null,
        }
      : null,
    gtin: snapshot.gtin ?? undefined,
    fdcId: snapshot.fdcId ?? undefined,
  };
}

export function buildMealEntry(
  item: FoodItem,
  qty: number,
  unit: ServingUnit,
  result: SelectionResult,
  entrySource: MealEntry["entrySource"] = "search"
): MealEntry {
  return {
    name: item.name,
    protein: result.protein ?? undefined,
    carbs: result.carbs ?? undefined,
    fat: result.fat ?? undefined,
    calories: result.calories ?? undefined,
    serving: {
      qty,
      unit,
      grams: result.grams,
      originalQty: item.serving.qty ?? null,
      originalUnit: item.serving.unit ?? null,
    },
    item: snapshotFromItem(item),
    entrySource,
  };
}

export function roundGrams(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.round(val * 10) / 10;
}

export function roundKcal(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.round(val);
}

export function sumNumbers(values: Array<number | undefined | null>): number {
  return values.reduce((acc, v) => {
    const numeric = Number(v);
    return acc + (Number.isFinite(numeric) ? numeric : 0);
  }, 0);
}

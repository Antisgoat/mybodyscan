import type { FoodItem } from "@app/lib/nutrition/types.ts";
import type { MealEntry, MealItemSnapshot } from "@app/lib/nutrition.ts";

export const SERVING_UNITS = ["serving", "g", "oz", "cups", "slices", "pieces"] as const;
export type ServingUnit = (typeof SERVING_UNITS)[number];

const GRAMS_PER_OUNCE = 28.3495;

function round(value: number | null | undefined, places = 2) {
  if (value == null) return null;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export function gramsToOunces(grams?: number | null) {
  if (!grams) return null;
  return round(grams / GRAMS_PER_OUNCE, 2);
}

export function kcalFromMacros(macros: { protein?: number | null; carbs?: number | null; fat?: number | null; alcohol?: number | null }): number {
  const p = Number(macros.protein || 0);
  const c = Number(macros.carbs || 0);
  const f = Number(macros.fat || 0);
  const a = Number(macros.alcohol || 0);
  return Math.round(p * 4 + c * 4 + f * 9 + a * 7);
}

function normalizeUnit(unit: string | null | undefined) {
  if (!unit) return null;
  const clean = unit.toLowerCase();
  if (clean.includes("gram")) return "g";
  if (clean === "g") return "g";
  if (clean.includes("ounce") || clean === "oz") return "oz";
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

export function estimateServingWeight(item: FoodItem): number | null {
  const defaultServing = defaultServingOption(item);
  if (defaultServing?.grams) {
    return round(defaultServing.grams, 2);
  }
  const servingUnit = normalizeUnit(item.serving?.unit || item.serving?.text || null);
  const servingQty = typeof item.serving?.qty === "number" ? item.serving.qty : null;
  if (servingQty && servingUnit === "g") {
    return servingQty;
  }
  if (servingQty && servingUnit === "oz") {
    return servingQty * GRAMS_PER_OUNCE;
  }
  const perServing = item.per_serving;
  const per100 = item.per_100g;
  if (!per100) return null;
  const ratios: number[] = [];
  if (perServing.protein_g && per100.protein_g) {
    ratios.push((perServing.protein_g / per100.protein_g) * 100);
  }
  if (perServing.carbs_g && per100.carbs_g) {
    ratios.push((perServing.carbs_g / per100.carbs_g) * 100);
  }
  if (perServing.fat_g && per100.fat_g) {
    ratios.push((perServing.fat_g / per100.fat_g) * 100);
  }
  if (perServing.kcal && per100.kcal) {
    ratios.push((perServing.kcal / per100.kcal) * 100);
  }
  if (!ratios.length) return null;
  const grams = ratios.reduce((sum, value) => sum + value, 0) / ratios.length;
  return round(grams, 2);
}

function gramsForSelection(item: FoodItem, qty: number, unit: ServingUnit): number | null {
  switch (unit) {
    case "g":
      return qty;
    case "oz":
      return qty * GRAMS_PER_OUNCE;
    case "serving":
    case "cups":
    case "slices":
    case "pieces": {
      const est = estimateServingWeight(item);
      return est ? est * qty : null;
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
  unit: ServingUnit,
): SelectionResult {
  const grams = gramsForSelection(item, qty, unit);
  const perServing = item.per_serving;
  const per100 = item.per_100g;
  const servingsFactor = unit === "g" || unit === "oz" ? qty : qty;

  if (grams != null && per100) {
    const factor = grams / 100;
    return {
      grams: round(grams, 2),
      calories: per100.kcal != null ? round(per100.kcal * factor, 0) : null,
      protein: per100.protein_g != null ? round(per100.protein_g * factor, 2) : null,
      carbs: per100.carbs_g != null ? round(per100.carbs_g * factor, 2) : null,
      fat: per100.fat_g != null ? round(per100.fat_g * factor, 2) : null,
    };
  }

  return {
    grams: grams != null ? round(grams, 2) : null,
    calories: perServing.kcal != null ? round(perServing.kcal * servingsFactor, 0) : null,
    protein: perServing.protein_g != null ? round(perServing.protein_g * servingsFactor, 2) : null,
    carbs: perServing.carbs_g != null ? round(perServing.carbs_g * servingsFactor, 2) : null,
    fat: perServing.fat_g != null ? round(perServing.fat_g * servingsFactor, 2) : null,
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
    per_100g: item.per_100g ? { ...item.per_100g } : null,
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
        ? "OFF"
        : "USDA",
    basePer100g: snapshot.per_100g
      ? {
          kcal: snapshot.per_100g.kcal ?? 0,
          protein: snapshot.per_100g.protein_g ?? 0,
          carbs: snapshot.per_100g.carbs_g ?? 0,
          fat: snapshot.per_100g.fat_g ?? 0,
        }
      : { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    servings: [{ id: "100g", label: "100 g", grams: 100, isDefault: true }],
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
      : undefined,
    gtin: snapshot.gtin ?? undefined,
    fdcId: snapshot.fdcId ?? undefined,
  };
}

export function buildMealEntry(
  item: FoodItem,
  qty: number,
  unit: ServingUnit,
  result: SelectionResult,
  entrySource: MealEntry["entrySource"] = "search",
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
  let total = 0;
  for (const value of values) {
    const numeric = typeof value === "number" ? value : Number(value ?? 0);
    if (Number.isFinite(numeric)) {
      total += numeric;
    }
  }
  return total;
}

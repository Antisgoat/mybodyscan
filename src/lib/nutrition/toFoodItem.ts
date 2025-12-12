import type { FoodItem as RichFoodItem, ServingOption } from "@/lib/nutrition/types";

type LooseNutritionItem = {
  id?: string | number | null;
  name?: string | null;
  brand?: string | null;
  source?: string | null;
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  serving?: number | null;
  unit?: string | null;
};

function toNumberOrNull(value: unknown): number | null {
  const n = typeof value === "string" && value.trim() === "" ? NaN : Number(value);
  return Number.isFinite(n) ? Number(n) : null;
}

function normalizeSource(source: unknown): RichFoodItem["source"] {
  const raw = typeof source === "string" ? source.trim().toLowerCase() : "";
  if (raw.includes("off") || raw.includes("open food")) return "Open Food Facts";
  return "USDA";
}

function unitToGramsFactor(unit: string): number | null {
  const u = unit.trim().toLowerCase();
  if (u === "g" || u === "gram" || u === "grams") return 1;
  // We intentionally do not guess for ml/cups/etc here.
  return null;
}

/**
 * Convert the lightweight nutrition search shape (`lib/nutrition/sanitize.ts`)
 * into the rich `FoodItem` shape expected by `ServingEditor` and `nutritionMath`.
 *
 * Guardrails:
 * - Never throws
 * - Uses best-effort per-serving macros; per-100g is derived only when serving is in grams.
 */
export function toRichFoodItem(raw: LooseNutritionItem): RichFoodItem {
  const idRaw = raw?.id ?? `food-${Math.random().toString(36).slice(2, 10)}`;
  const id = typeof idRaw === "number" ? String(idRaw) : String(idRaw || "");
  const name =
    typeof raw?.name === "string" && raw.name.trim().length ? raw.name.trim() : "Food";
  const brand =
    typeof raw?.brand === "string" && raw.brand.trim().length ? raw.brand.trim() : null;

  const calories = toNumberOrNull(raw?.calories);
  const protein = toNumberOrNull(raw?.protein);
  const carbs = toNumberOrNull(raw?.carbs);
  const fat = toNumberOrNull(raw?.fat);

  const servingQty = toNumberOrNull(raw?.serving);
  const servingUnit = typeof raw?.unit === "string" ? raw.unit.trim() : null;
  const servingText =
    servingQty != null && servingUnit ? `${servingQty} ${servingUnit}` : "1 serving";

  const gramsFactor =
    servingQty != null && servingUnit ? unitToGramsFactor(servingUnit) : null;
  const servingGrams = gramsFactor ? servingQty! * gramsFactor : null;
  const derivePer100 = (value: number | null): number | null => {
    if (value == null) return null;
    if (!servingGrams || servingGrams <= 0) return null;
    return (value * 100) / servingGrams;
  };

  const per100 = {
    kcal: derivePer100(calories),
    protein_g: derivePer100(protein),
    carbs_g: derivePer100(carbs),
    fat_g: derivePer100(fat),
  };

  const servings: ServingOption[] = [{ id: "100g", label: "100 g", grams: 100, isDefault: true }];
  if (servingGrams && servingGrams > 0) {
    servings.unshift({
      id: "serving",
      label: servingText,
      grams: servingGrams,
      isDefault: false,
    });
  }

  return {
    id,
    name,
    brand,
    source: normalizeSource(raw?.source),
    basePer100g: {
      kcal: per100.kcal ?? calories ?? 0,
      protein: per100.protein_g ?? protein ?? 0,
      carbs: per100.carbs_g ?? carbs ?? 0,
      fat: per100.fat_g ?? fat ?? 0,
    },
    servings,
    serving: { qty: servingQty ?? 1, unit: servingUnit ?? "serving", text: servingText },
    per_serving: {
      kcal: calories,
      protein_g: protein,
      carbs_g: carbs,
      fat_g: fat,
    },
    per_100g:
      per100.kcal != null || per100.protein_g != null || per100.carbs_g != null || per100.fat_g != null
        ? per100
        : null,
    raw,
  };
}


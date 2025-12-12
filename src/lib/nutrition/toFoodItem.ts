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

function num0(value: unknown): number {
  const n = typeof value === "string" && value.trim() === "" ? NaN : Number(value);
  return Number.isFinite(n) ? Number(n) : 0;
}

/**
 * Guardrail for persisted/localStorage items:
 * Normalize an unknown object into the rich `FoodItem` shape used across Meals.
 * This MUST NEVER throw (Meals route renders favorites/recents from storage).
 */
export function normalizeRichFoodItem(input: unknown): RichFoodItem {
  try {
    const raw = (input && typeof input === "object" ? (input as any) : {}) as any;
    const idRaw = raw?.id ?? `food-${Math.random().toString(36).slice(2, 10)}`;
    const id = typeof idRaw === "number" ? String(idRaw) : String(idRaw || "");
    const name =
      typeof raw?.name === "string" && raw.name.trim().length ? raw.name.trim() : "Food";
    const brand =
      typeof raw?.brand === "string" && raw.brand.trim().length ? raw.brand.trim() : null;
    const source = normalizeSource(raw?.source);

    const base = raw?.basePer100g ?? {};
    const basePer100g = {
      kcal: num0(base?.kcal ?? raw?.kcal ?? raw?.calories),
      protein: num0(base?.protein ?? raw?.protein),
      carbs: num0(base?.carbs ?? raw?.carbs),
      fat: num0(base?.fat ?? raw?.fat),
    };

    const servingRaw = raw?.serving ?? {};
    const servingQty =
      typeof servingRaw?.qty === "number" ? servingRaw.qty : num0(servingRaw?.qty) || 1;
    const servingUnit =
      typeof servingRaw?.unit === "string" && servingRaw.unit.trim().length
        ? servingRaw.unit.trim()
        : "serving";
    const servingText =
      typeof servingRaw?.text === "string" && servingRaw.text.trim().length
        ? servingRaw.text.trim()
        : "1 serving";

    const perServingRaw = raw?.per_serving ?? raw?.perServing ?? {};
    const per_serving = {
      kcal: (raw?.per_serving || raw?.perServing) ? (Number.isFinite(Number(perServingRaw?.kcal)) ? Number(perServingRaw.kcal) : null) : null,
      protein_g:
        (raw?.per_serving || raw?.perServing)
          ? (Number.isFinite(Number(perServingRaw?.protein_g)) ? Number(perServingRaw.protein_g) : null)
          : null,
      carbs_g:
        (raw?.per_serving || raw?.perServing)
          ? (Number.isFinite(Number(perServingRaw?.carbs_g)) ? Number(perServingRaw.carbs_g) : null)
          : null,
      fat_g:
        (raw?.per_serving || raw?.perServing)
          ? (Number.isFinite(Number(perServingRaw?.fat_g)) ? Number(perServingRaw.fat_g) : null)
          : null,
    };

    const servingsRaw = Array.isArray(raw?.servings) ? raw.servings : [];
    const servings: ServingOption[] = servingsRaw
      .map((s: any, idx: number) => {
        const grams = Number(s?.grams);
        if (!Number.isFinite(grams) || grams <= 0) return null;
        const label =
          typeof s?.label === "string" && s.label.trim().length ? s.label.trim() : `${grams} g`;
        const sid =
          typeof s?.id === "string" && s.id.trim().length ? s.id.trim() : `srv-${idx}`;
        return { id: sid, label, grams, isDefault: Boolean(s?.isDefault) } satisfies ServingOption;
      })
      .filter(Boolean) as ServingOption[];
    if (!servings.length) {
      servings.push({ id: "100g", label: "100 g", grams: 100, isDefault: true });
    } else if (!servings.some((s) => s.isDefault)) {
      servings[0]!.isDefault = true;
    }

    return {
      id,
      name,
      brand,
      source,
      basePer100g,
      servings,
      serving: { qty: servingQty, unit: servingUnit, text: servingText },
      per_serving: raw?.per_serving || raw?.perServing ? per_serving : { kcal: null, protein_g: null, carbs_g: null, fat_g: null },
      per_100g: raw?.per_100g ?? raw?.per100 ?? null,
      raw: raw?.raw ?? input,
    };
  } catch {
    // Last-resort safe fallback
    return toRichFoodItem({ id: null, name: "Food", brand: null, source: null, calories: null, protein: null, carbs: null, fat: null, serving: null, unit: null });
  }
}


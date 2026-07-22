import { sanitizeFoodItem } from "@/features/nutrition/sanitize";
import type { FoodItem, NutritionSource } from "@/lib/nutrition/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function source(value: unknown): NutritionSource {
  return value === "USDA" ? "USDA" : "Open Food Facts";
}

function isNormalizedFoodItem(value: unknown): value is FoodItem {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    isRecord(value.basePer100g) &&
    Array.isArray(value.servings) &&
    isRecord(value.serving) &&
    isRecord(value.per_serving)
  );
}

/**
 * Keeps the rich server-normalized barcode shape intact while retaining a
 * narrow compatibility path for older provider responses.
 */
export function coerceBarcodeFoodItem(
  code: string,
  value: unknown
): FoodItem | null {
  if (isNormalizedFoodItem(value)) {
    const id = value.id.trim();
    const name = value.name.trim();
    if (!id || !name) return null;
    return {
      ...value,
      id,
      name,
      brand:
        typeof value.brand === "string" && value.brand.trim()
          ? value.brand.trim()
          : null,
      source: source(value.source),
    };
  }

  const raw = isRecord(value) ? value : null;
  const normalized = sanitizeFoodItem(raw);
  if (!raw || !normalized?.name) return null;
  const basePer100g = {
    kcal: normalized.kcal ?? 0,
    protein: normalized.protein_g ?? 0,
    carbs: normalized.carbs_g ?? 0,
    fat: normalized.fat_g ?? 0,
  };
  const perServing = {
    kcal: normalized.kcal ?? null,
    protein_g: normalized.protein_g ?? null,
    carbs_g: normalized.carbs_g ?? null,
    fat_g: normalized.fat_g ?? null,
  };
  const rawId = typeof raw.id === "string" ? raw.id.trim() : "";
  const rawCode = typeof raw.code === "string" ? raw.code.trim() : "";
  return {
    id: rawId || rawCode || `barcode:${code}`,
    name: normalized.name,
    brand: normalized.brand || null,
    source: source(raw.source),
    basePer100g,
    servings: [{ id: "100g", label: "100 g", grams: 100, isDefault: true }],
    serving: { qty: 100, unit: "g", text: "100 g" },
    per_serving: perServing,
    per_100g: perServing,
    raw,
  };
}

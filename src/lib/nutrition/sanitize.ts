// Pipeline map — Meals search normalization:
// - Converts USDA / OpenFood / legacy payloads into `FoodItem` for the UI + Cloud Functions.
// - Normalizes macros so `nutritionLogs` never store undefined values.
export type FoodItem = {
  id: string;
  name: string;
  brand?: string | null;
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  serving?: number | null;
  unit?: string | null;
};

const num = (v: any): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function sanitizeFoodItem(x: any): FoodItem {
  const id = String(
    x?.id ||
    x?.fdcId ||
    x?._id ||
    x?.code ||
    Math.random().toString(36).slice(2)
  );

  const name = String(
    x?.name ||
    x?.description ||
    x?.product_name ||
    "Unknown"
  ).trim();

  const brand = x?.brandName || x?.brand || x?.brands || x?.brand_owner || null;

  const calories = num(
    x?.calories ??
    x?.energyKcal ??
    x?.nutrients?.energyKcal ??
    x?.nutrients?.energy ??
    // OFF variants
    x?.nutriments?.["energy-kcal_100g"] ??
    x?.nutriments?.energy_kcal ??
    x?.nutriments?.["energy-kcal"] ??
    x?.nutriments?.energyKcal ??
    x?.nf_calories
  );

  const protein = num(
    x?.protein ??
    x?.nutrients?.protein ??
    // OFF variants
    x?.nutriments?.protein_100g ??
    x?.nutriments?.proteins_100g ??
    x?.nutriments?.proteins ??
    x?.nutriments?.protein ??
    x?.nf_protein
  );

  const carbs = num(
    x?.carbs ??
    x?.nutrients?.carbohydrates ??
    // OFF variants
    x?.nutriments?.carbohydrates_100g ??
    x?.nutriments?.carbohydrates ??
    x?.nutriments?.carbs ??
    x?.nf_total_carbohydrate
  );

  const fat = num(
    x?.fat ??
    x?.nutrients?.fat ??
    // OFF variants
    x?.nutriments?.fat_100g ??
    x?.nutriments?.fat ??
    x?.nf_total_fat
  );

  const serving = num(
    x?.serving ??
    x?.servingSize ??
    x?.serving_size
  );

  const unit = x?.unit || x?.servingUnit || x?.serving_unit || null;

  return {
    id,
    name,
    brand: brand ? String(brand) : null,
    calories,
    protein,
    carbs,
    fat,
    serving,
    unit,
  };
}

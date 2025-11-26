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
    x?.nutriments?.["energy-kcal_100g"] ??
    x?.nf_calories
  );

  const protein = num(
    x?.protein ??
    x?.nutriments?.protein_100g ??
    x?.nf_protein
  );

  const carbs = num(
    x?.carbs ??
    x?.nutriments?.carbohydrates_100g ??
    x?.nf_total_carbohydrate
  );

  const fat = num(
    x?.fat ??
    x?.nutriments?.fat_100g ??
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

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

export function sanitizeFoodItem(raw: any): FoodItem {
  if (!raw || typeof raw !== "object") return { id: cryptoRandom(), name: "Unknown" };
  const id = String(raw.id || raw.fdcId || raw._id || cryptoRandom());
  const name = String(raw.name || raw.description || raw.product_name || "Unknown").trim();
  const brand = (raw.brandName || raw.brand || raw.brands || null) ? String(raw.brandName || raw.brand || raw.brands) : null;
  const calories = num(raw.calories ?? raw.kcal ?? raw.energyKcal ?? raw.nf_calories);
  const protein  = num(raw.protein ?? raw.proteins ?? raw.nf_protein);
  const carbs    = num(raw.carbs ?? raw.carbohydrates ?? raw.carbohydrate ?? raw.nf_total_carbohydrate);
  const fat      = num(raw.fat ?? raw.totalFat ?? raw.nf_total_fat);
  const serving  = num(raw.serving ?? raw.servingSize ?? raw.serving_size);
  const unit     = str(raw.unit ?? raw.servingUnit ?? raw.serving_unit);
  return { id, name, brand, calories, protein, carbs, fat, serving, unit };
}

function num(v: any): number | null { const n = Number(v); return Number.isFinite(n) ? n : null; }
function str(v: any): string | null { return v == null ? null : String(v); }
function cryptoRandom() { return Math.random().toString(36).slice(2); }

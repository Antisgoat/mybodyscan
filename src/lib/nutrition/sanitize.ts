export type FoodItem = {
  id: string; name: string; brand?: string|null;
  calories?: number|null; protein?: number|null; carbs?: number|null; fat?: number|null;
  serving?: number|null; unit?: string|null; source?: string|null;
  servingSize?: number|null; servingUnit?: string|null; barcode?: string|null;
};
const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
export function sanitizeFoodItem(x: any): FoodItem {
  const id  = String(x?.fdcId || x?.id || x?._id || x?.code || Math.random().toString(36).slice(2));
  const name = String(x?.name || x?.description || x?.product_name || "Unknown").trim();
  const brand= x?.brandName || x?.brand || x?.brand_owner || x?.brands || null;
  const calories = num(x?.calories ?? x?.energyKcal ?? x?.nutriments?.["energy-kcal_100g"] ?? x?.nutriments?.energy_kcal ?? x?.nf_calories);
  const protein  = num(x?.protein  ?? x?.nutriments?.protein_100g ?? x?.nutriments?.proteins ?? x?.nf_protein);
  const carbs    = num(x?.carbs    ?? x?.nutriments?.carbohydrates_100g ?? x?.nutriments?.carbohydrates ?? x?.carbohydrates ?? x?.nf_total_carbohydrate);
  const fat      = num(x?.fat      ?? x?.nutriments?.fat_100g ?? x?.nutriments?.fat ?? x?.totalFat ?? x?.nf_total_fat);
  const serving  = num(x?.serving  ?? x?.servingSize ?? x?.serving_size ?? x?.serving_quantity ?? x?.householdServingFulltext);
  const unitRaw  = x?.unit ?? x?.servingUnit ?? x?.serving_unit ?? x?.serving_size_unit ?? x?.householdServingFulltextUnit;
  const barcode  = typeof x?.barcode === "string" ? x.barcode : typeof x?.code === "string" ? x.code : null;
  const unit     = typeof unitRaw === "string" ? unitRaw : null;
  const source   = typeof x?.source === "string" ? x.source : typeof x?.provider === "string" ? x.provider : null;
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
    source,
    servingSize: serving,
    servingUnit: unit,
    barcode,
  };
}

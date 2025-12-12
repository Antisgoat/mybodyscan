// Pipeline map — Legacy meals helpers:
// - Minimal sanitizer for Stripe demo views; main UI uses `@/lib/nutrition/sanitize`, but this keeps feature parity.
export function sanitizeFoodItem(x: any) {
  if (!x) return null;
  const name = String(x.name || x.description || x.product_name || "").trim();
  const brand = String(x.brand || x.brandOwner || x.brands || "")
    .split(",")[0]
    .trim();
  const kcal =
    Number(x.calories ?? x.energy_kcal ?? x.nf_calories ?? x.kcal) || 0;
  const protein_g = Number(x.protein_g ?? x.protein ?? x.proteins_100g) || 0;
  const carbs_g =
    Number(x.carbs_g ?? x.carbohydrates ?? x.carbohydrates_100g) || 0;
  const fat_g = Number(x.fat_g ?? x.fat ?? x.fat_100g) || 0;
  return { name, brand, kcal, protein_g, carbs_g, fat_g };
}

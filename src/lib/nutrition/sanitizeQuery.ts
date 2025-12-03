export function sanitizeNutritionQuery(q: string): string {
  if (!q) return "";
  return q
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^-a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 64);
}

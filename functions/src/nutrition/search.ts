/**
 * Pipeline map — Callable nutrition search:
 * - Handles callable traffic from `NutritionSearch` when direct REST access is blocked.
 * - Queries USDA first (when keys available) then OpenFoodFacts, normalizing results for the meal editor.
 */
import { onCallWithOptionalAppCheck } from "../util/callable.js";
import { HttpsError } from "firebase-functions/v2/https";
import fetch from "node-fetch";

const OFF_UA = process.env.OFF_USER_AGENT || process.env.OFF_APP_USER_AGENT || "MyBodyScan/1.0";
const USDA_KEY = process.env.USDA_API_KEY || process.env.USDA_FDC_API_KEY;

const sanitize = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9 .\-_/]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);

function formatSanitized(value: unknown): string {
  const sanitized = sanitize(value);
  if (!sanitized) return "";
  return sanitized.replace(/\b([a-z])/g, (char) => char.toUpperCase());
}

function normalize(items: any[]) {
  return items.map((raw) => {
    const item = {
      id: raw?.id || raw?.fdcId || raw?.code || raw?._id || "",
      name: raw?.name || raw?.description || raw?.product_name || "",
      brand: raw?.brand || raw?.brandOwner || raw?.brands || "",
      calories: raw?.calories ?? raw?.kcal ?? raw?.energyKcal ?? raw?.nutrients?.kcal ?? null,
      protein: raw?.protein ?? raw?.nutrients?.protein ?? null,
      carbs: raw?.carbs ?? raw?.nutrients?.carbohydrates ?? null,
      fat: raw?.fat ?? raw?.nutrients?.fat ?? null,
      serving: raw?.serving ?? (raw?.servingSize ?? ""),
      source:
        typeof raw?.source === "string"
          ? raw.source
          : raw?.provider === "OFF"
            ? "Open Food Facts"
            : "USDA",
    };
    return {
      ...item,
      name: formatSanitized(item.name) || "Unknown",
      brand: formatSanitized(item.brand),
      serving: formatSanitized(item.serving),
    };
  });
}

export const nutritionSearch = onCallWithOptionalAppCheck(async (req) => {
  const q = sanitize(req.data?.q ?? req.data?.query ?? "");
  if (!q) {
    return { items: [] };
  }

  try {
    if (USDA_KEY) {
      const usda = await fetch(
        `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${USDA_KEY}&query=${encodeURIComponent(q)}&pageSize=20`,
      );
      if (usda.ok) {
        const json: any = await usda.json();
        if (Array.isArray(json?.foods) && json.foods.length) {
          const items = json.foods.map((food: any) => ({
            id: food.fdcId,
            name: food.description,
            brand: food.brandOwner || "",
            calories: food.labelNutrients?.calories?.value ?? null,
            protein: food.labelNutrients?.protein?.value ?? null,
            carbs: food.labelNutrients?.carbohydrates?.value ?? null,
            fat: food.labelNutrients?.fat?.value ?? null,
            serving: "",
            source: "USDA",
          }));
          const normalized = normalize(items);
          return { items: normalized };
        }
      }
    }
  } catch (error) {
    console.warn("usda_search_failed", error);
  }

  try {
    const off = await fetch(
      `https://world.openfoodfacts.org/cgi/search.pl?search_simple=1&json=1&page_size=20&search_terms=${encodeURIComponent(q)}`,
      { headers: { "User-Agent": OFF_UA } },
    );
    if (!off.ok) throw new Error(`off_status_${off.status}`);
    const json: any = await off.json();
    const items = (json?.products ?? []).slice(0, 20).map((product: any) => ({
      id: product._id || product.code,
      name: product.product_name || product.brands_tags?.[0] || "Unknown",
      brand: product.brands || "",
      calories: product.nutriments?.["energy-kcal_100g"] ?? null,
      protein: product.nutriments?.["proteins_100g"] ?? null,
      carbs: product.nutriments?.["carbohydrates_100g"] ?? null,
      fat: product.nutriments?.["fat_100g"] ?? null,
      serving: product.serving_size || "",
      provider: "OFF",
      source: "Open Food Facts",
    }));
    const normalized = normalize(items);
    return { items: normalized };
  } catch (error: any) {
    throw new HttpsError("unknown", error?.message || "Nutrition service unavailable");
  }
});

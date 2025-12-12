import { onCallWithOptionalAppCheck } from "../util/callable.js";
import { HttpsError } from "firebase-functions/v2/https";
import fetch from "node-fetch";
const OFF_UA =
  process.env.OFF_USER_AGENT ||
  process.env.OFF_APP_USER_AGENT ||
  "MyBodyScan/1.0";
const USDA_KEY = process.env.USDA_API_KEY || process.env.USDA_FDC_API_KEY;

const sanitize = (s: unknown): string => {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^\w\s./-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

function formatSanitized(value: unknown): string {
  const sanitized = sanitize(value);
  if (!sanitized) return "";
  return sanitized.replace(/\b([a-z])/g, (char) => char.toUpperCase());
}

export const nutritionBarcode = onCallWithOptionalAppCheck(async (req) => {
  const upc = String(req.data?.upc || "").replace(/\D+/g, "");
  if (!upc) throw new HttpsError("invalid-argument", "upc required");

  const response = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${upc}.json`,
    {
      headers: { "User-Agent": OFF_UA },
    }
  );
  if (!response.ok)
    throw new HttpsError("unavailable", "Barcode lookup failed");

  const json: any = await response.json();
  const product = json?.product;
  if (!product) throw new HttpsError("not-found", "Product not found");

  const item = {
    id: product._id || product.code,
    name:
      formatSanitized(
        product.product_name || product.generic_name || "Unknown"
      ) || "Unknown",
    brand: formatSanitized(product.brands || product.brands_tags?.[0] || ""),
    kcal: product.nutriments?.["energy-kcal_100g"] ?? null,
    protein: product.nutriments?.["proteins_100g"] ?? null,
    carbs: product.nutriments?.["carbohydrates_100g"] ?? null,
    fat: product.nutriments?.["fat_100g"] ?? null,
    serving: formatSanitized(product.serving_size || ""),
    source: "Open Food Facts",
  };

  if (!item.name && USDA_KEY) {
    item.name = formatSanitized(upc);
  }

  return { item };
});

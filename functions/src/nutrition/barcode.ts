import { onCallWithOptionalAppCheck } from "../util/callable.js";
import { HttpsError } from "firebase-functions/v2/https";
import fetch from "node-fetch";

const OFF_UA = process.env.OFF_USER_AGENT || "MyBodyScan/1.0 (contact: support@mybodyscanapp.com)";

export const nutritionBarcode = onCallWithOptionalAppCheck(async (req) => {
  const upc = String(req.data?.upc || "").replace(/\D+/g, "");
  if (!upc) throw new HttpsError("invalid-argument", "upc required");

  const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${upc}.json`, {
    headers: { "User-Agent": OFF_UA },
  });
  if (!response.ok) throw new HttpsError("unavailable", "Barcode lookup failed");

  const json: any = await response.json();
  const product = json?.product;
  if (!product) throw new HttpsError("not-found", "Product not found");

  return {
    item: {
      id: product._id || product.code,
      name: product.product_name || "Unknown",
      brand: product.brands || "",
      kcal: product.nutriments?.["energy-kcal_100g"] ?? null,
      protein: product.nutriments?.["proteins_100g"] ?? null,
      carbs: product.nutriments?.["carbohydrates_100g"] ?? null,
      fat: product.nutriments?.["fat_100g"] ?? null,
      serving: product.serving_size || "",
      source: "Open Food Facts",
    },
  };
});

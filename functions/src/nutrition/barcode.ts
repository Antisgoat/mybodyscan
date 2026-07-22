import { onCallWithOptionalAppCheck } from "../util/callable.js";
import { HttpsError } from "firebase-functions/v2/https";
import { fetchOpenFoodFactsBundle } from "./alternatives.js";

export const nutritionBarcode = onCallWithOptionalAppCheck(async (req) => {
  const upc = String(req.data?.upc || "").replace(/\D+/g, "");
  if (!upc) throw new HttpsError("invalid-argument", "upc required");

  try {
    const bundle = await fetchOpenFoodFactsBundle(upc);
    if (!bundle) throw new HttpsError("not-found", "Product not found");
    return bundle;
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("unavailable", "Barcode lookup failed");
  }
});

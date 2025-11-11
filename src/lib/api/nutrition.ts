import { getIdToken } from "firebase/auth";
import { getToken as getAppCheckToken } from "firebase/app-check";
import { auth, appCheck } from "@/lib/firebase";

export type FoodItem = {
  id?: string;
  name: string;
  brand?: string | null;
  calories?: number | null;  // kcal per serving
  protein?: number | null;   // g per serving
  carbs?: number | null;     // g per serving
  fat?: number | null;       // g per serving
  servingSize?: number | null;
  servingUnit?: string | null;
  source?: string | null;    // "USDA" | "OFF" | "INTERNAL" | ...
  barcode?: string | null;
  raw?: any;                 // debug/inspection
};

/** Heuristic normalizer so UI is resilient to upstream sources */
export function normalizeFoodItem(x: any): FoodItem {
  const nutrients = x?.nutrients ?? x?.nutriments ?? null;
  const name =
    x?.name ??
    x?.description ??
    x?.foodName ??
    x?.food?.description ??
    x?.product_name ??
    "Unknown item";

  const brand =
    x?.brand ??
    x?.brandName ??
    x?.brand_name ??
    x?.owner_brand_name ??
    x?.manufacturer ??
    null;

  // Calories (kcal)
  const kcal =
    numberOrNull(x?.calories) ??
    numberOrNull(x?.kcal) ??
    numberOrNull(x?.energyKcal) ??
    numberOrNull(nutrients?.energyKcal) ??
    numberOrNull(nutrients?.energy_kcal) ??
    numberOrNull(nutrients?.energy) ??
    (typeof nutrients?.energy === "object" ? numberOrNull(nutrients?.energy?.value) : null) ??
    numberOrNull(nutrients?.calories) ??
    (x?.nf_calories !== undefined ? numberOrNull(x?.nf_calories) : null);

  // Macros (grams)
  const protein =
    numberOrNull(x?.protein) ??
    numberOrNull(x?.protein_g) ??
    numberOrNull(nutrients?.protein) ??
    numberOrNull(nutrients?.proteins) ??
    numberOrNull(nutrients?.protein_g) ??
    (typeof nutrients?.protein === "object" ? numberOrNull(nutrients?.protein?.value) : null) ??
    (x?.nf_protein !== undefined ? numberOrNull(x?.nf_protein) : null);

  const carbs =
    numberOrNull(x?.carbs) ??
    numberOrNull(x?.carbohydrates) ??
    numberOrNull(x?.carbohydrates_total_g) ??
    numberOrNull(nutrients?.carbohydrates) ??
    numberOrNull(nutrients?.carbs) ??
    numberOrNull(nutrients?.carbohydrates_total_g) ??
    numberOrNull(nutrients?.carbohydrates_available) ??
    (typeof nutrients?.carbohydrates === "object" ? numberOrNull(nutrients?.carbohydrates?.value) : null) ??
    (x?.nf_total_carbohydrate !== undefined ? numberOrNull(x?.nf_total_carbohydrate) : null);

  const fat =
    numberOrNull(x?.fat) ??
    numberOrNull(x?.fat_g) ??
    numberOrNull(nutrients?.fat) ??
    numberOrNull(nutrients?.fat_total) ??
    numberOrNull(nutrients?.fat_g) ??
    numberOrNull(nutrients?.lipid) ??
    (typeof nutrients?.fat === "object" ? numberOrNull(nutrients?.fat?.value) : null) ??
    (x?.nf_total_fat !== undefined ? numberOrNull(x?.nf_total_fat) : null);

  const servingSize =
    numberOrNull(x?.servingSize) ??
    numberOrNull(x?.serving_size) ??
    numberOrNull(x?.serving_size_g) ??
    numberOrNull(x?.serving_weight_grams) ??
    numberOrNull(x?.serving_quantity) ??
    numberOrNull(x?.quantity);

  const servingUnit =
    x?.servingUnit ??
    x?.serving_unit ??
    x?.serving_size_unit ??
    x?.servingSizeUnit ??
    null;

  const source =
    x?.source ??
    x?.dataSource ??
    (x?.fdcId ? "USDA" : x?.code ? "OFF" : null);

  const barcode = x?.barcode ?? x?.code ?? null;
  const id = x?.id ?? x?.fdcId ?? barcode ?? x?._id ?? x?.foodId ?? undefined;

  return {
    id,
    name: String(name || "Unknown item"),
    brand: brand ? String(brand) : null,
    calories: kcal,
    protein,
    carbs,
    fat,
    servingSize,
    servingUnit: servingUnit ? String(servingUnit) : null,
    source: source ? String(source) : null,
    barcode: barcode ? String(barcode) : null,
    raw: x
  };
}

function numberOrNull(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function nutritionSearch(q: string): Promise<FoodItem[]> {
  const user = auth.currentUser;
  const idToken = user ? await getIdToken(user, false) : "";
  const ac = await getAppCheckToken(appCheck, false).catch(() => null);

  const res = await fetch("/api/nutrition/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      ...(ac?.token ? { "X-Firebase-AppCheck": ac.token } : {}),
    },
    body: JSON.stringify({ q }),
  });

  // Expect JSON array or an object containing an array (items/results/data)
  let data: any = null;
  try { data = await res.json(); } catch { /* ignore */ }

  if (!res.ok || !data) {
    const msg = (data && (data.error || data.message)) || `HTTP ${res.status}`;
    throw new Error(`nutritionSearch failed: ${msg}`);
  }

  const arr = Array.isArray(data) ? data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : Array.isArray(data.data) ? data.data
    : [];

  return arr.map(normalizeFoodItem);
}

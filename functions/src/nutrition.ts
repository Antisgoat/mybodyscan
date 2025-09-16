import { Timestamp } from "firebase-admin/firestore";
import { db, functions, getSecret } from "./admin";
import { requireCallableAuth } from "./auth";
import { consumeToken } from "./rateLimiter";
import { DayLogEntry, DayLogDocument, MacroBreakdown, NormalizedFood } from "./types";
import * as crypto from "node:crypto";

const usdaApiKey = getSecret("USDA_API_KEY");
const offUserAgent = getSecret("OPENFOODFACTS_USER_AGENT") ?? "MyBodyScan/1.0";

function toNumber(value: any): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function scaleMacros(macros: MacroBreakdown, multiplier: number): MacroBreakdown {
  return {
    kcal: Math.round(macros.kcal * multiplier * 10) / 10,
    protein: Math.round(macros.protein * multiplier * 10) / 10,
    carbs: Math.round(macros.carbs * multiplier * 10) / 10,
    fat: Math.round(macros.fat * multiplier * 10) / 10,
  };
}

function addMacros(a: MacroBreakdown, b: MacroBreakdown): MacroBreakdown {
  return {
    kcal: Math.round((a.kcal + b.kcal) * 10) / 10,
    protein: Math.round((a.protein + b.protein) * 10) / 10,
    carbs: Math.round((a.carbs + b.carbs) * 10) / 10,
    fat: Math.round((a.fat + b.fat) * 10) / 10,
  };
}

function nutrientLookup(food: any, nutrientId: number): number | undefined {
  const nutrient = (food.foodNutrients || []).find((n: any) => n.nutrientId === nutrientId);
  if (!nutrient) return undefined;
  return toNumber(nutrient.value);
}

function normalizeUsdaFood(food: any): NormalizedFood {
  const per100: MacroBreakdown = {
    kcal: nutrientLookup(food, 1008) ?? 0,
    protein: nutrientLookup(food, 1003) ?? 0,
    carbs: nutrientLookup(food, 1005) ?? 0,
    fat: nutrientLookup(food, 1004) ?? 0,
  };
  let perPortion: MacroBreakdown | undefined;
  let portion: { label: string; grams?: number } | undefined;
  if (food.servingSize && food.servingSizeUnit) {
    const grams = food.servingSizeUnit.toLowerCase() === "g" ? toNumber(food.servingSize) : undefined;
    if (grams) {
      const factor = grams / 100;
      perPortion = scaleMacros(per100, factor);
      portion = { label: `${grams}g`, grams };
    } else if (food.labelNutrients) {
      perPortion = {
        kcal: toNumber(food.labelNutrients.calories?.value),
        protein: toNumber(food.labelNutrients.protein?.value),
        carbs: toNumber(food.labelNutrients.carbohydrates?.value),
        fat: toNumber(food.labelNutrients.fat?.value),
      };
      portion = { label: `${food.servingSize} ${food.servingSizeUnit}` };
    }
  }
  return {
    id: `fdc:${food.fdcId}`,
    source: "fdc",
    name: food.description,
    brand: food.brandName || food.brandOwner || undefined,
    per100g: per100,
    perPortion,
    portion,
    barcode: food.gtinUpc || undefined,
  };
}

function normalizeOffFood(product: any): NormalizedFood {
  const nutriments = product.nutriments || {};
  const per100: MacroBreakdown = {
    kcal: toNumber(nutriments["energy-kcal_100g"] ?? nutriments["energy-kcal" ?? ""]),
    protein: toNumber(nutriments["proteins_100g"]),
    carbs: toNumber(nutriments["carbohydrates_100g"]),
    fat: toNumber(nutriments["fat_100g"]),
  };
  let perPortion: MacroBreakdown | undefined;
  let portion: { label: string; grams?: number } | undefined;
  if (nutriments["energy-kcal_serving"] || product.serving_size) {
    perPortion = {
      kcal: toNumber(nutriments["energy-kcal_serving"] ?? nutriments["energy-kcal"]),
      protein: toNumber(nutriments["proteins_serving"]),
      carbs: toNumber(nutriments["carbohydrates_serving"]),
      fat: toNumber(nutriments["fat_serving"]),
    };
    const gramsMatch = /([0-9]+)\s*g/i.exec(product.serving_size || "");
    if (gramsMatch) {
      portion = { label: product.serving_size, grams: toNumber(gramsMatch[1]) };
    } else if (product.serving_size) {
      portion = { label: product.serving_size };
    }
  }
  return {
    id: `off:${product.code}`,
    source: "off",
    name: product.product_name || product.generic_name || "Unknown",
    brand: product.brands || undefined,
    barcode: product.code,
    per100g: per100,
    perPortion,
    portion,
  };
}

function hashQuery(payload: Record<string, unknown>): string {
  return crypto.createHash("sha1").update(JSON.stringify(payload)).digest("hex");
}

async function readCache(key: string): Promise<NormalizedFood[] | null> {
  const snap = await db.doc(`food_cache/${key}`).get();
  if (!snap.exists) return null;
  const data = snap.data() as any;
  if (!data?.expiresAt) return null;
  if (data.expiresAt.toMillis() < Date.now()) {
    return null;
  }
  return (data.items as NormalizedFood[]) || null;
}

async function writeCache(key: string, items: NormalizedFood[]) {
  await db.doc(`food_cache/${key}`).set({
    items,
    expiresAt: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000),
    updatedAt: Timestamp.now(),
  });
}

async function searchOpenFoodFacts(barcode: string): Promise<NormalizedFood[]> {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": offUserAgent,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`OpenFoodFacts error: ${response.status}`);
  }
  const json = await response.json();
  if (json.status !== 1 || !json.product) {
    return [];
  }
  return [normalizeOffFood(json.product)];
}

async function searchUsda(query: string, page?: number): Promise<NormalizedFood[]> {
  if (!usdaApiKey) {
    throw new functions.https.HttpsError("failed-precondition", "USDA API key not configured");
  }
  const body = {
    query,
    pageSize: 25,
    pageNumber: page ?? 1,
  };
  const response = await fetch("https://api.nal.usda.gov/fdc/v1/foods/search?api_key=" + usdaApiKey, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`USDA error: ${response.status}`);
  }
  const json = await response.json();
  return (json.foods || []).map(normalizeUsdaFood);
}

export const foodSearch = functions.https.onRequest(async (req, res) => {
  const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0] || req.ip || "anon";
  if (!consumeToken(`food:${ip}`, 30, 0.5)) {
    res.status(429).json({ error: "Rate limit exceeded" });
    return;
  }
  const { q, barcode, page } = req.method === "POST" ? req.body || {} : req.query;
  const text = typeof q === "string" ? q.trim() : undefined;
  const barcodeStr = typeof barcode === "string" ? barcode.trim() : undefined;
  const pageNum = typeof page === "string" ? parseInt(page, 10) : typeof page === "number" ? page : undefined;
  if (!text && !barcodeStr) {
    res.status(400).json({ error: "q or barcode required" });
    return;
  }
  try {
    const cacheKey = hashQuery({ q: text ?? null, barcode: barcodeStr ?? null, page: pageNum ?? 1 });
    const cached = await readCache(cacheKey);
    if (cached) {
      res.json({ items: cached });
      return;
    }
    let items: NormalizedFood[] = [];
    if (barcodeStr && /^[0-9]{8,14}$/.test(barcodeStr)) {
      items = await searchOpenFoodFacts(barcodeStr);
      if (items.length === 0 && text) {
        items = await searchUsda(text, pageNum);
      }
    } else if (text) {
      items = await searchUsda(text, pageNum);
    }
    await writeCache(cacheKey, items);
    res.json({ items });
  } catch (err: any) {
    functions.logger.error("food_search_error", { error: err });
    res.status(500).json({ error: err?.message || "Search failed" });
  }
});

function computeEntryMacros(item: NormalizedFood, qty: number): MacroBreakdown {
  const base = item.perPortion ?? (item.portion?.grams ? scaleMacros(item.per100g, item.portion.grams / 100) : item.per100g);
  return scaleMacros(base, qty);
}

export const addFoodLog = functions.https.onCall(async (data: { date: string; item: NormalizedFood; qty: number }, context) => {
  const requestId = crypto.randomUUID();
  const uid = requireCallableAuth(context, requestId);
  const { date, item, qty } = data || ({} as any);
  if (!date || typeof date !== "string") {
    throw new functions.https.HttpsError("invalid-argument", "date required");
  }
  if (!item || typeof qty !== "number") {
    throw new functions.https.HttpsError("invalid-argument", "item and qty required");
  }
  const ref = db.doc(`users/${uid}/nutritionLogs/${date}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existing = (snap.exists ? (snap.data() as DayLogDocument) : null) || {
      entries: [],
      totals: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
      updatedAt: Timestamp.now(),
    };
    const macros = computeEntryMacros(item, qty);
    const entry: DayLogEntry = {
      id: crypto.randomUUID(),
      item,
      qty,
      macros,
      addedAt: Timestamp.now(),
    };
    const entries = [...existing.entries, entry];
    const totals = entries.reduce((acc, curr) => addMacros(acc, curr.macros), {
      kcal: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    });
    tx.set(
      ref,
      {
        entries,
        totals,
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
  });
  return { ok: true };
});

export const getDayLog = functions.https.onCall(async (data: { date: string }, context) => {
  const requestId = crypto.randomUUID();
  const uid = requireCallableAuth(context, requestId);
  const { date } = data || ({} as any);
  if (!date || typeof date !== "string") {
    throw new functions.https.HttpsError("invalid-argument", "date required");
  }
  const snap = await db.doc(`users/${uid}/nutritionLogs/${date}`).get();
  if (!snap.exists) {
    return { entries: [], totals: { kcal: 0, protein: 0, carbs: 0, fat: 0 } };
  }
  const dataDoc = snap.data() as DayLogDocument;
  const entries = (dataDoc.entries || []).map((entry) => ({
    ...entry,
    addedAt: entry.addedAt.toMillis(),
  }));
  return {
    entries,
    totals: dataDoc.totals,
  };
});

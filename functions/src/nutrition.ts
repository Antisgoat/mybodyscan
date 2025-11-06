import { randomUUID } from "crypto";
import expressModule from "express";
import type { Request, Response } from "express";
import { HttpsError, onRequest } from "firebase-functions/v2/https";
import { Timestamp, getFirestore } from "./firebase.js";
import { errorCode, statusFromCode } from "./lib/errors.js";
import { withCors } from "./middleware/cors.js";
import { allowCorsAndOptionalAppCheck, requireAuth, verifyAppCheckStrict } from "./http.js";
import type {
  DailyLogDocument,
  MealRecord,
  MealServingSelection,
  NutritionItemSnapshot,
} from "./types.js";

const express = expressModule as any;
const db = getFirestore();

function round(value: number, decimals = 0) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function normalizeDate(dateISO: string, offsetMins: number) {
  const date = new Date(dateISO);
  if (Number.isFinite(offsetMins)) {
    date.setMinutes(date.getMinutes() - offsetMins);
  }
  return date.toISOString().slice(0, 10);
}

function defaultTotals(): DailyLogDocument["totals"] {
  return { calories: 0, protein: 0, carbs: 0, fat: 0, alcohol: 0 };
}

function computeCalories(meal: MealRecord) {
  const protein = round(meal.protein || 0, 1);
  const carbs = round(meal.carbs || 0, 1);
  const fat = round(meal.fat || 0, 1);
  const alcohol = round(meal.alcohol || 0, 1);
  const caloriesFromMacros = round(protein * 4 + carbs * 4 + fat * 9 + alcohol * 7, 0);
  let calories = caloriesFromMacros;
  let caloriesInput: number | undefined;
  if (typeof meal.calories === "number") {
    caloriesInput = meal.calories;
    if (Math.abs(meal.calories - caloriesFromMacros) <= 5) {
      calories = round(meal.calories, 0);
    }
  }
  return {
    protein,
    carbs,
    fat,
    alcohol,
    calories,
    caloriesFromMacros,
    caloriesInput,
  };
}

function validateMeal(meal: MealRecord) {
  if (!meal.name || meal.name.trim().length === 0) {
    throw new HttpsError("invalid-argument", "Meal name required");
  }
  if (meal.name.length > 140) {
    throw new HttpsError("invalid-argument", "Meal name too long");
  }
  const macros = [meal.protein, meal.carbs, meal.fat, meal.alcohol];
  if (macros.some((n) => n !== undefined && n < 0)) {
    throw new HttpsError("invalid-argument", "Macros must be non-negative");
  }
}

function sanitizeServing(raw: any): MealServingSelection | null {
  if (!raw || typeof raw !== "object") return null;
  const numberOrNull = (value: any): number | null => {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };
  const unitOrNull = (value: any): string | null =>
    typeof value === "string" && value.trim().length ? value.trim().slice(0, 40) : null;
  return {
    qty: numberOrNull(raw.qty) ?? undefined,
    unit: unitOrNull(raw.unit) ?? undefined,
    grams: numberOrNull(raw.grams),
    originalQty: numberOrNull(raw.originalQty),
    originalUnit: unitOrNull(raw.originalUnit) ?? undefined,
  };
}

function sanitizeNutrients(raw: any) {
  if (!raw || typeof raw !== "object") return null;
  const numberOrNull = (value: any): number | null => {
    const num = Number(value);
    return Number.isFinite(num) ? Number(num.toFixed(2)) : null;
  };
  return {
    kcal: numberOrNull(raw.kcal),
    protein_g: numberOrNull(raw.protein_g),
    carbs_g: numberOrNull(raw.carbs_g),
    fat_g: numberOrNull(raw.fat_g),
  };
}

function sanitizeItem(raw: any): NutritionItemSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 140) : null;
  if (!name) return null;
  return {
    id: typeof raw.id === "string" ? raw.id.slice(0, 120) : undefined,
    name,
    brand: typeof raw.brand === "string" ? raw.brand.slice(0, 120) : null,
    source: typeof raw.source === "string" ? raw.source.slice(0, 40) : undefined,
    serving: sanitizeServing(raw.serving),
    per_serving: sanitizeNutrients(raw.per_serving),
    per_100g: sanitizeNutrients(raw.per_100g),
    fdcId: Number.isFinite(Number(raw.fdcId)) ? Number(raw.fdcId) : undefined,
    gtin: typeof raw.gtin === "string" ? raw.gtin.slice(0, 40) : undefined,
  };
}

async function upsertMeal(uid: string, day: string, meal: MealRecord) {
  const docRef = db.doc(`users/${uid}/nutritionLogs/${day}`);
  let totals: DailyLogDocument["totals"] = defaultTotals();
  await db.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
    const snap = (await tx.get(docRef)) as unknown as FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>;
    const data = snap.exists ? (snap.data() as DailyLogDocument) : { meals: [], totals };
    const meals = Array.isArray(data.meals) ? [...data.meals] : [];
    const existingIndex = meals.findIndex((m) => m.id === meal.id);
    const enriched = { ...meal, ...computeCalories(meal) };
    if (existingIndex >= 0) {
      meals[existingIndex] = enriched;
    } else {
      meals.push(enriched);
    }
    totals = meals.reduce(
      (acc, item) => ({
        calories: round(acc.calories + (item.calories || 0), 0),
        protein: round(acc.protein + (item.protein || 0), 1),
        carbs: round(acc.carbs + (item.carbs || 0), 1),
        fat: round(acc.fat + (item.fat || 0), 1),
        alcohol: round(acc.alcohol + (item.alcohol || 0), 1),
      }),
      defaultTotals()
    );
    tx.set(
      docRef,
      {
        meals,
        totals,
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
  });
  return totals;
}

async function removeMeal(uid: string, day: string, mealId: string) {
  const docRef = db.doc(`users/${uid}/nutritionLogs/${day}`);
  let totals: DailyLogDocument["totals"] = defaultTotals();
  await db.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
    const snap = (await tx.get(docRef)) as unknown as FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>;
    if (!snap.exists) {
      totals = defaultTotals();
      return;
    }
    const data = snap.data() as DailyLogDocument;
    const meals = (data.meals || []).filter((m) => m.id !== mealId);
    totals = meals.reduce(
      (acc, item) => ({
        calories: round(acc.calories + (item.calories || 0), 0),
        protein: round(acc.protein + (item.protein || 0), 1),
        carbs: round(acc.carbs + (item.carbs || 0), 1),
        fat: round(acc.fat + (item.fat || 0), 1),
        alcohol: round(acc.alcohol + (item.alcohol || 0), 1),
      }),
      defaultTotals()
    );
    tx.set(
      docRef,
      {
        meals,
        totals,
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
  });
  return totals;
}

async function readDailyLog(uid: string, day: string) {
  const snap = await db.doc(`users/${uid}/nutritionLogs/${day}`).get();
  if (!snap.exists) {
    return {
      totals: defaultTotals(),
      meals: [],
    };
  }
  const data = snap.data() as DailyLogDocument;
  return {
    totals: data.totals || defaultTotals(),
    meals: data.meals || [],
  };
}

async function handleAddMeal(req: Request, res: Response) {
  const uid = await requireAuth(req);
  const body = req.body as { dateISO?: string; meal?: Partial<MealRecord> };
  if (!body?.dateISO || !body.meal?.name) {
    throw new HttpsError("invalid-argument", "dateISO and meal required");
  }
  const tz = parseInt(req.get("x-tz-offset-mins") || "0", 10);
  const day = normalizeDate(body.dateISO, tz);
  const meal: MealRecord = {
    id: body.meal.id || randomUUID(),
    name: body.meal.name,
    protein: body.meal.protein,
    carbs: body.meal.carbs,
    fat: body.meal.fat,
    alcohol: body.meal.alcohol,
    calories: body.meal.calories,
    notes: body.meal.notes || null,
    serving: sanitizeServing(body.meal.serving),
    item: sanitizeItem(body.meal.item),
    entrySource:
      typeof body.meal.entrySource === "string"
        ? body.meal.entrySource.slice(0, 40)
        : body.meal.item
        ? "search"
        : undefined,
  };
  validateMeal(meal);
  const totals = await upsertMeal(uid, day, meal);
  res.json({ totals, meal });
}

async function handleDeleteMeal(req: Request, res: Response) {
  const uid = await requireAuth(req);
  const body = req.body as { dateISO?: string; mealId?: string };
  if (!body?.dateISO || !body.mealId) {
    throw new HttpsError("invalid-argument", "dateISO and mealId required");
  }
  const tz = parseInt(req.get("x-tz-offset-mins") || "0", 10);
  const day = normalizeDate(body.dateISO, tz);
  const totals = await removeMeal(uid, day, body.mealId);
  res.json({ totals });
}

async function handleGetLog(req: Request, res: Response) {
  const uid = await requireAuth(req);
  const dateISO = (req.body?.dateISO as string) || (req.query?.dateISO as string);
  if (!dateISO) {
    throw new HttpsError("invalid-argument", "dateISO required");
  }
  const tz = parseInt(req.get("x-tz-offset-mins") || "0", 10);
  const day = normalizeDate(dateISO, tz);
  const log = await readDailyLog(uid, day);
  const { getEnv } = await import("./lib/env.js");
  const response = {
    ...log,
    source: getEnv("USDA_API_KEY") ? "usda" : getEnv("OPENFOODFACTS_USER_AGENT") ? "openfoodfacts" : "unknown",
  };
  res.json(response);
}

async function handleGetHistory(req: Request, res: Response) {
  const uid = await requireAuth(req);
  const rangeRaw = (req.body?.range as number | string | undefined) ?? (req.query?.range as string | undefined) ?? 30;
  const range = Math.min(30, Math.max(1, Number(rangeRaw) || 30));
  const anchorIso =
    (req.body?.anchorDateISO as string | undefined) || (req.query?.anchorDateISO as string | undefined) ||
    new Date().toISOString().slice(0, 10);
  const tz = parseInt(req.get("x-tz-offset-mins") || "0", 10);
  const normalizedAnchor = normalizeDate(anchorIso, tz);
  const anchorDate = new Date(normalizedAnchor);
  const tasks: Promise<{ date: string; totals: DailyLogDocument["totals"] }>[] = [];
  for (let offset = 0; offset < range; offset++) {
    const day = new Date(anchorDate);
    day.setUTCDate(anchorDate.getUTCDate() - offset);
    const iso = day.toISOString().slice(0, 10);
    const docRef = db.doc(`users/${uid}/nutritionLogs/${iso}`);
    tasks.push(
      docRef.get().then((snap: FirebaseFirestore.DocumentSnapshot<DailyLogDocument>) => {
        if (!snap.exists) {
          return { date: iso, totals: defaultTotals() };
        }
        const data = snap.data() as DailyLogDocument;
        const totals = data.totals || defaultTotals();
        return {
          date: iso,
          totals: {
            calories: totals.calories || 0,
            protein: totals.protein || 0,
            carbs: totals.carbs || 0,
            fat: totals.fat || 0,
            alcohol: totals.alcohol || 0,
          },
        };
      })
    );
  }
  const results = await Promise.all(tasks);
  results.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  res.json({ days: results });
}

function withHandler(handler: (req: Request, res: Response) => Promise<void>) {
  return onRequest(
    { invoker: "public" },
    withCors(async (req, res) => {
      try {
        await verifyAppCheckStrict(req as any);
        await handler(req as unknown as Request, res as unknown as Response);
      } catch (err: any) {
        const code = errorCode(err);
        const status =
          code === "unauthenticated"
            ? 401
            : code === "invalid-argument"
            ? 400
            : code === "not-found"
            ? 404
            : statusFromCode(code);
        res.status(status).json({ error: err.message || "error" });
      }
    })
  );
}

export const addFoodLog = withHandler(handleAddMeal);
export const addMeal = addFoodLog;
export const deleteMeal = withHandler(handleDeleteMeal);
export const getDayLog = withHandler(handleGetLog);
export const getDailyLog = getDayLog;
export const getNutritionHistory = withHandler(handleGetHistory);

export { nutritionSearch } from "./nutritionSearch.js";

type ApiNutritionItem = {
  id: string;
  name: string;
  brand: string | null;
  source: "USDA" | "OFF";
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

const USDA_SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search";
const OFF_SEARCH_URL = "https://world.openfoodfacts.org/cgi/search.pl";
const OFF_PRODUCT_URL = "https://world.openfoodfacts.org/api/v2/product/";
const OFF_UA =
  process.env.OFF_USER_AGENT ||
  process.env.OFF_APP_USER_AGENT ||
  "MyBodyScan/1.0 (+https://mybodyscanapp.com)";

function getUsdaKey(): string | null {
  const envKey = process.env.USDA_API_KEY || process.env.USDA_FDC_API_KEY;
  if (envKey && envKey.trim()) {
    return envKey.trim();
  }
  return null;
}

function numberOrZero(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? Number(num.toFixed(2)) : 0;
}

function fromUsdaFood(food: any): ApiNutritionItem | null {
  if (!food) return null;
  const name = (food.description || food.lowercaseDescription || "").toString().trim();
  if (!name) return null;
  const brand = (food.brandOwner || food.brand || "").toString().trim() || null;
  const nutrients = Array.isArray(food.foodNutrients) ? food.foodNutrients : [];
  const lookup = new Map<string, number>();
  for (const nutrient of nutrients) {
    const key = (nutrient?.nutrientName || nutrient?.nutrient?.name || "").toString().toLowerCase();
    if (!key) continue;
    const amount = Number(nutrient?.value);
    if (Number.isFinite(amount)) {
      lookup.set(key, amount);
    }
  }
  const fallbackKcal = food?.foodNutrients?.find?.((n: any) => n?.nutrientNumber === "208");
  const fallbackProtein = food?.foodNutrients?.find?.((n: any) => n?.nutrientNumber === "203");
  const fallbackCarbs = food?.foodNutrients?.find?.((n: any) => n?.nutrientNumber === "205");
  const fallbackFat = food?.foodNutrients?.find?.((n: any) => n?.nutrientNumber === "204");

  const kcal =
    lookup.get("energy") ??
    lookup.get("energy (kcal)") ??
    lookup.get("calories") ??
    (fallbackKcal && fallbackKcal.value != null ? Number(fallbackKcal.value) : undefined) ??
    0;
  const protein =
    lookup.get("protein") ??
    (fallbackProtein && fallbackProtein.value != null ? Number(fallbackProtein.value) : undefined) ??
    0;
  const carbs =
    lookup.get("carbohydrate, by difference") ??
    lookup.get("carbohydrate") ??
    (fallbackCarbs && fallbackCarbs.value != null ? Number(fallbackCarbs.value) : undefined) ??
    0;
  const fat =
    lookup.get("total lipid (fat)") ??
    lookup.get("fat") ??
    (fallbackFat && fallbackFat.value != null ? Number(fallbackFat.value) : undefined) ??
    0;

  return {
    id: `usda_${food.fdcId ?? randomUUID()}`,
    name,
    brand,
    source: "USDA",
    kcal: numberOrZero(kcal),
    protein_g: numberOrZero(protein),
    carbs_g: numberOrZero(carbs),
    fat_g: numberOrZero(fat),
  };
}

function fromOffProduct(product: any): ApiNutritionItem | null {
  if (!product) return null;
  const name = (product.product_name || product.generic_name || product.name || "").toString().trim();
  if (!name) return null;
  const brand = (product.brands || product.brand_owner || "").toString().split(",")[0]?.trim() || null;
  const nutriments = product.nutriments || {};
  const kcal = nutriments["energy-kcal_100g"] ?? nutriments["energy-kcal"] ?? nutriments["energy"];
  return {
    id: `off_${product.code || randomUUID()}`,
    name,
    brand,
    source: "OFF",
    kcal: numberOrZero(kcal),
    protein_g: numberOrZero(nutriments.proteins_100g ?? nutriments.protein),
    carbs_g: numberOrZero(nutriments.carbohydrates_100g ?? nutriments.carbs),
    fat_g: numberOrZero(nutriments.fat_100g ?? nutriments.fat),
  };
}

async function searchUsda(query: string): Promise<ApiNutritionItem[]> {
  const key = getUsdaKey();
  if (!key) {
    return [];
  }
  const url = new URL(USDA_SEARCH_URL);
  url.searchParams.set("api_key", key);
  url.searchParams.set("query", query);
  url.searchParams.set("pageSize", "20");
  url.searchParams.set("sortBy", "dataType.keyword");
  url.searchParams.set("sortOrder", "asc");
  const response = await fetch(url.toString(), { method: "GET" });
  if (!response.ok) {
    throw new Error(`usda_status_${response.status}`);
  }
  const data = (await response.json().catch(() => ({}))) as any;
  const foods = Array.isArray(data?.foods) ? data.foods : [];
  return foods.map(fromUsdaFood).filter((item): item is ApiNutritionItem => Boolean(item));
}

async function searchOff(query: string): Promise<ApiNutritionItem[]> {
  const url = new URL(OFF_SEARCH_URL);
  url.searchParams.set("action", "process");
  url.searchParams.set("json", "true");
  url.searchParams.set("page_size", "20");
  url.searchParams.set("fields", "product_name,brands,nutriments,code");
  url.searchParams.set("search_simple", "1");
  url.searchParams.set("search_terms", query);
  const response = await fetch(url.toString(), {
    headers: { "User-Agent": OFF_UA },
  });
  if (!response.ok) {
    throw new Error(`off_status_${response.status}`);
  }
  const data = (await response.json().catch(() => ({}))) as any;
  const products = Array.isArray(data?.products) ? data.products : [];
  return products.map(fromOffProduct).filter((item): item is ApiNutritionItem => Boolean(item));
}

async function lookupBarcode(barcode: string): Promise<ApiNutritionItem[]> {
  if (!barcode) return [];
  const url = `${OFF_PRODUCT_URL}${encodeURIComponent(barcode)}.json`;
  const response = await fetch(url, {
    headers: { "User-Agent": OFF_UA },
  });
  if (!response.ok) {
    return [];
  }
  const data = (await response.json().catch(() => ({}))) as any;
  const product = data?.product;
  const item = fromOffProduct(product);
  return item ? [item] : [];
}

function dedupe(items: ApiNutritionItem[]): ApiNutritionItem[] {
  const seen = new Map<string, ApiNutritionItem>();
  for (const item of items) {
    const key = `${item.name.toLowerCase()}::${(item.brand || "").toLowerCase()}`;
    if (!seen.has(key)) {
      seen.set(key, item);
    }
  }
  return Array.from(seen.values());
}

export const nutritionRouter = express.Router();

nutritionRouter.use(allowCorsAndOptionalAppCheck);

nutritionRouter.get("/nutrition/search", async (req: Request, res: Response) => {
  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const barcode = typeof req.query.barcode === "string" ? req.query.barcode.trim() : "";

  if (!query && !barcode) {
    res.status(400).json({ error: "missing_query" });
    return;
  }

  try {
    let results: ApiNutritionItem[] = [];
    let primarySource: "usda" | "off" | "barcode" | null = null;

    if (query) {
      try {
        results = await searchUsda(query);
        if (results.length > 0) {
          primarySource = "usda";
        }
      } catch (error) {
        console.warn("usda_search_failed", { message: (error as Error)?.message });
      }
    }

    if (results.length === 0) {
      try {
        if (barcode) {
          results = await lookupBarcode(barcode);
          if (results.length > 0) {
            primarySource = "barcode";
          }
        }
        if (results.length === 0 && query) {
          results = await searchOff(query);
          if (results.length > 0) {
            primarySource = "off";
          }
        }
      } catch (error) {
        console.warn("off_search_failed", { message: (error as Error)?.message });
      }
    }

    if (results.length === 0 && barcode) {
      try {
        const barcodeFallback = await lookupBarcode(barcode);
        results = barcodeFallback;
        if (results.length > 0) {
          primarySource = "barcode";
        }
      } catch (error) {
        console.warn("off_barcode_failed", { message: (error as Error)?.message });
      }
    }

    const normalized = dedupe(results).slice(0, 25);
    const message = normalized.length === 0 ? "no_results" : "ok";
    res.json({ results: normalized, source: primarySource, message });
  } catch (error) {
    console.error("nutrition_search_error", {
      message: (error as Error)?.message,
    });
    res.status(502).json({ error: "nutrition_unavailable" });
  }
});

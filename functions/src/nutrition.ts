import { randomUUID } from "crypto";
import { HttpsError, onRequest } from "firebase-functions/v2/https";
import type { Request } from "firebase-functions/v2/https";
import { Timestamp, getFirestore } from "./firebase";
import { softVerifyAppCheck } from "./middleware/appCheck";
import { withCors } from "./middleware/cors";
import { requireAuth, verifyAppCheckSoft } from "./http";
import type { DailyLogDocument, MealRecord } from "./types";

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

async function upsertMeal(uid: string, day: string, meal: MealRecord) {
  const docRef = db.doc(`users/${uid}/nutritionLogs/${day}`);
  let totals: DailyLogDocument["totals"] = defaultTotals();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
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
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
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

async function handleAddMeal(req: Request, res: any) {
  await verifyAppCheckSoft(req);
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
  };
  validateMeal(meal);
  const totals = await upsertMeal(uid, day, meal);
  res.json({ totals, meal });
}

async function handleDeleteMeal(req: Request, res: any) {
  await verifyAppCheckSoft(req);
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

async function handleGetLog(req: Request, res: any) {
  await verifyAppCheckSoft(req);
  const uid = await requireAuth(req);
  const dateISO = (req.body?.dateISO as string) || (req.query?.dateISO as string);
  if (!dateISO) {
    throw new HttpsError("invalid-argument", "dateISO required");
  }
  const tz = parseInt(req.get("x-tz-offset-mins") || "0", 10);
  const day = normalizeDate(dateISO, tz);
  const log = await readDailyLog(uid, day);
  const response = {
    ...log,
    source: process.env.USDA_API_KEY ? "usda" : process.env.OPENFOODFACTS_USER_AGENT ? "openfoodfacts" : "mock",
  };
  res.json(response);
}

async function handleGetHistory(req: Request, res: any) {
  await verifyAppCheckSoft(req);
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
      docRef.get().then((snap) => {
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

function withHandler(handler: (req: Request, res: any) => Promise<void>) {
  return onRequest(
    withCors(async (req, res) => {
      try {
        await softVerifyAppCheck(req as any, res as any);
        await handler(req, res);
      } catch (err: any) {
        const code = err instanceof HttpsError ? err.code : "internal";
        const status =
          code === "unauthenticated"
            ? 401
            : code === "invalid-argument"
            ? 400
            : code === "not-found"
            ? 404
            : 500;
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

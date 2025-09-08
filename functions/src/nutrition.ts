import { onRequest } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { randomUUID } from "crypto";

interface Meal {
  id?: string;
  name: string;
  protein?: number;
  carbs?: number;
  fat?: number;
  alcohol?: number;
  calories?: number;
  notes?: string;
}

function round(value: number, decimals = 0) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

async function requireUser(req: any): Promise<string> {
  const authHeader = req.get("authorization") || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) throw new Error("Unauthorized");
  const decoded = await getAuth().verifyIdToken(match[1]);
  return decoded.uid;
}

function normalizeDate(dateISO: string, tzMins: number) {
  const date = new Date(dateISO);
  if (!isNaN(tzMins)) date.setMinutes(date.getMinutes() - tzMins);
  return date.toISOString().slice(0, 10);
}

/** Add or update a meal and return updated daily totals. */
export const addMeal = onRequest(async (req, res) => {
  try {
    const uid = await requireUser(req);
    const body = req.body as { dateISO?: string; meal?: Meal };
    if (!body?.dateISO || !body?.meal?.name) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    const tz = parseInt(req.get("x-tz-offset-mins") || "0", 10);
    const day = normalizeDate(body.dateISO, tz);
    const meal: Meal = body.meal;
    if (meal.name.length > 140) {
      res.status(400).json({ error: "Name too long" });
      return;
    }
    const protein = round(meal.protein || 0, 1);
    const carbs = round(meal.carbs || 0, 1);
    const fat = round(meal.fat || 0, 1);
    const alcohol = round(meal.alcohol || 0, 1);
    if ([protein, carbs, fat, alcohol].some((n) => n < 0)) {
      res.status(400).json({ error: "Invalid macros" });
      return;
    }
    const kcalFromMacros = round(protein * 4 + carbs * 4 + fat * 9 + alcohol * 7, 0);
    let calories = kcalFromMacros;
    let caloriesInput: number | undefined;
    if (typeof meal.calories === "number") {
      caloriesInput = meal.calories;
      if (Math.abs(meal.calories - kcalFromMacros) <= 5) {
        calories = round(meal.calories, 0);
      }
    }
    const mealRecord = {
      id: meal.id || randomUUID(),
      name: meal.name,
      protein,
      carbs,
      fat,
      alcohol,
      calories,
      notes: meal.notes || null,
      caloriesInput,
      caloriesFromMacros: kcalFromMacros,
    };
    const db = getFirestore();
    const docRef = db.doc(`users/${uid}/nutritionLogs/${day}`);
    let totals: any;
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      const data = snap.exists ? (snap.data() as any) : { meals: [] };
      const meals = data.meals as any[];
      const idx = meals.findIndex((m) => m.id === mealRecord.id);
      if (idx >= 0) meals[idx] = mealRecord; else meals.push(mealRecord);
      totals = meals.reduce(
        (acc, m) => ({
          calories: acc.calories + (m.calories || 0),
          protein: round(acc.protein + (m.protein || 0), 1),
          carbs: round(acc.carbs + (m.carbs || 0), 1),
          fat: round(acc.fat + (m.fat || 0), 1),
          alcohol: round(acc.alcohol + (m.alcohol || 0), 1),
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0, alcohol: 0 }
      );
      tx.set(docRef, { meals, totals }, { merge: true });
    });
    res.json({ totals });
  } catch (e: any) {
    res.status(e.message === "Unauthorized" ? 401 : 500).json({ error: e.message });
  }
});

/** Delete a meal and recompute daily totals. */
export const deleteMeal = onRequest(async (req, res) => {
  try {
    const uid = await requireUser(req);
    const body = req.body as { dateISO?: string; mealId?: string };
    if (!body?.dateISO || !body?.mealId) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    const tz = parseInt(req.get("x-tz-offset-mins") || "0", 10);
    const day = normalizeDate(body.dateISO, tz);
    const db = getFirestore();
    const docRef = db.doc(`users/${uid}/nutritionLogs/${day}`);
    let totals: any = { calories: 0, protein: 0, carbs: 0, fat: 0, alcohol: 0 };
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) return;
      let meals = (snap.data()?.meals as any[]) || [];
      meals = meals.filter((m) => m.id !== body.mealId);
      totals = meals.reduce(
        (acc, m) => ({
          calories: acc.calories + (m.calories || 0),
          protein: round(acc.protein + (m.protein || 0), 1),
          carbs: round(acc.carbs + (m.carbs || 0), 1),
          fat: round(acc.fat + (m.fat || 0), 1),
          alcohol: round(acc.alcohol + (m.alcohol || 0), 1),
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0, alcohol: 0 }
      );
      tx.set(docRef, { meals, totals }, { merge: true });
    });
    res.json({ totals });
  } catch (e: any) {
    res.status(e.message === "Unauthorized" ? 401 : 500).json({ error: e.message });
  }
});

/** Get daily log document. */
export const getDailyLog = onRequest(async (req, res) => {
  try {
    const uid = await requireUser(req);
    const dateISO = (req.query.dateISO as string) || (req.body?.dateISO as string);
    if (!dateISO) {
      res.status(400).json({ error: "dateISO required" });
      return;
    }
    const tz = parseInt(req.get("x-tz-offset-mins") || "0", 10);
    const day = normalizeDate(dateISO, tz);
    const snap = await getFirestore().doc(`users/${uid}/nutritionLogs/${day}`).get();
    res.json(snap.exists ? snap.data() : { totals: { calories: 0, protein: 0, carbs: 0, fat: 0, alcohol: 0 }, meals: [] });
  } catch (e: any) {
    res.status(e.message === "Unauthorized" ? 401 : 500).json({ error: e.message });
  }
});


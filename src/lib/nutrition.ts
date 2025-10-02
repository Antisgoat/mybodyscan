import { auth } from "./firebase";

const FUNCTIONS_URL = import.meta.env.VITE_FUNCTIONS_URL as string;

export interface MealServingSelection {
  qty?: number;
  unit?: string;
  grams?: number | null;
  originalQty?: number | null;
  originalUnit?: string | null;
}

export interface MealItemSnapshot {
  id?: string;
  name: string;
  brand?: string | null;
  source?: string;
  serving?: {
    qty?: number | null;
    unit?: string | null;
    text?: string | null;
  } | null;
  per_serving?: {
    kcal?: number | null;
    protein_g?: number | null;
    carbs_g?: number | null;
    fat_g?: number | null;
  } | null;
  per_100g?: MealItemSnapshot["per_serving"] | null;
  fdcId?: number | null;
  gtin?: string | null;
}

export interface MealEntry {
  id?: string;
  name: string;
  protein?: number;
  carbs?: number;
  fat?: number;
  alcohol?: number;
  calories?: number;
  notes?: string;
  serving?: MealServingSelection | null;
  item?: MealItemSnapshot | null;
  entrySource?: "search" | "barcode" | "manual" | string;
}

export interface NutritionHistoryDay {
  date: string;
  totals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    alcohol?: number;
  };
}

function round(value: number, decimals = 0) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function computeCalories({ protein = 0, carbs = 0, fat = 0, alcohol = 0, calories }: MealEntry) {
  const kcal = round(protein * 4 + carbs * 4 + fat * 9 + alcohol * 7, 0);
  if (typeof calories === "number" && Math.abs(calories - kcal) <= 5) {
    return { calories, reconciled: false, caloriesFromMacros: kcal, caloriesInput: calories };
  }
  return { calories: kcal, reconciled: calories !== undefined, caloriesFromMacros: kcal, caloriesInput: calories };
}

async function callFn(path: string, body?: any, method = "POST") {
  const t = await auth.currentUser?.getIdToken();
  if (!t) throw new Error("auth");
  const r = await fetch(`${FUNCTIONS_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
    body: method === "POST" ? JSON.stringify(body || {}) : undefined,
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function addMeal(dateISO: string, meal: MealEntry) {
  const entry = { ...meal, ...computeCalories(meal) };
  const result = await callFn("/addMeal", { dateISO, meal: entry });
  return result;
}

export async function deleteMeal(dateISO: string, mealId: string) {
  return callFn("/deleteMeal", { dateISO, mealId });
}

export async function getDailyLog(dateISO: string) {
  return callFn("/getDailyLog", { dateISO });
}

export async function getNutritionHistory(range: 7 | 30, anchorDateISO?: string): Promise<NutritionHistoryDay[]> {
  const anchor = anchorDateISO || new Date().toISOString().slice(0, 10);
  const response = await callFn("/getNutritionHistory", { range, anchorDateISO: anchor });
  const list = Array.isArray(response?.days) ? response.days : [];
  return list.map((day: any) => ({
    date: day.date,
    totals: {
      calories: Number(day?.totals?.calories) || 0,
      protein: Number(day?.totals?.protein) || 0,
      carbs: Number(day?.totals?.carbs) || 0,
      fat: Number(day?.totals?.fat) || 0,
      alcohol: Number(day?.totals?.alcohol) || 0,
    },
  }));
}


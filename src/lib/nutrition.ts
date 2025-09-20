import { auth } from "./firebase";
import { isDemoGuest } from "./demoFlag";
import { track } from "./analytics";

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
    if (isDemoGuest()) {
      track("demo_block", { action: "meal_add" });
      const list = demoMeals[dateISO] || seedDemoMeals(dateISO);
      const entry = { id: crypto.randomUUID(), ...meal, ...computeCalories(meal) };
      demoMeals[dateISO] = [...list, entry];
      return entry;
    }
    return callFn("/addMeal", { dateISO, meal });
}

export async function deleteMeal(dateISO: string, mealId: string) {
    if (isDemoGuest()) {
      const list = demoMeals[dateISO] || seedDemoMeals(dateISO);
      demoMeals[dateISO] = list.filter((m) => m.id !== mealId);
      return;
    }
    return callFn("/deleteMeal", { dateISO, mealId });
}

export async function getDailyLog(dateISO: string) {
    if (isDemoGuest()) {
      const meals = demoMeals[dateISO] || seedDemoMeals(dateISO);
      const totals = { calories: meals.reduce((s, m) => s + (m.calories || 0), 0) };
      return { totals, meals };
    }
    return callFn("/getDailyLog", { dateISO });
}

export async function getNutritionHistory(range: 7 | 30, anchorDateISO?: string): Promise<NutritionHistoryDay[]> {
  const anchor = anchorDateISO || new Date().toISOString().slice(0, 10);
  if (isDemoGuest()) {
    const anchorDate = new Date(anchor);
    const days: NutritionHistoryDay[] = [];
    for (let offset = range - 1; offset >= 0; offset--) {
      const day = new Date(anchorDate);
      day.setDate(anchorDate.getDate() - offset);
      const iso = day.toISOString().slice(0, 10);
      const meals = demoMeals[iso] || seedDemoMeals(iso);
      const totals = meals.reduce(
        (acc, meal) => {
          const macros = computeCalories(meal);
          acc.calories += macros.calories || 0;
          acc.protein += meal.protein || 0;
          acc.carbs += meal.carbs || 0;
          acc.fat += meal.fat || 0;
          acc.alcohol += meal.alcohol || 0;
          return acc;
        },
        { calories: 0, protein: 0, carbs: 0, fat: 0, alcohol: 0 }
      );
      days.push({ date: iso, totals });
    }
    return days;
  }
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

// --- demo state ---
const demoMeals: Record<string, MealEntry[]> = {};

function seedDemoMeals(dateISO: string): MealEntry[] {
  if (!demoMeals[dateISO]) {
    const seed: MealEntry[] = [
      { id: "1", name: "Oatmeal", protein: 6, carbs: 27, fat: 3 },
      { id: "2", name: "Chicken Salad", protein: 30, carbs: 10, fat: 8 },
      { id: "3", name: "Greek Yogurt", protein: 17, carbs: 9, fat: 0 },
    ].map((m) => ({ ...m, ...computeCalories(m) }));
    demoMeals[dateISO] = seed;
  }
  return demoMeals[dateISO];
}

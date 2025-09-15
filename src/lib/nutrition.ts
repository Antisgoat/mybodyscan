import { auth } from "./firebase";
import { isDemoGuest } from "./demoFlag";
import { track } from "./analytics";

const FUNCTIONS_URL = import.meta.env.VITE_FUNCTIONS_URL as string;

export interface MealEntry {
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

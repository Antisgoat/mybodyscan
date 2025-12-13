import { kcalFromMacros } from "./nutritionMath";
import { isDemo } from "./demoFlag";
import { DEMO_NUTRITION_HISTORY, DEMO_NUTRITION_LOG } from "./demoContent";
import { apiFetchJson } from "@/lib/apiFetch";
import { auth as firebaseAuth } from "@/lib/firebase";
import { scrubUndefined } from "@/lib/scrubUndefined";
import { fnJson } from "@/lib/fnCall";

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
  /** Optional diary grouping bucket. */
  mealType?: "breakfast" | "lunch" | "dinner" | "snacks" | string;
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

export function computeCalories({
  protein = 0,
  carbs = 0,
  fat = 0,
  alcohol = 0,
  calories,
}: MealEntry) {
  const kcal = round(kcalFromMacros({ protein, carbs, fat, alcohol }), 0);
  const macrosEnergy = Number(protein || 0) * 4 +
    Number(carbs || 0) * 4 +
    Number(fat || 0) * 9 +
    Number(alcohol || 0) * 7;
  // Quick add / calories-only entries: if macros are empty, trust the explicit calories.
  if (typeof calories === "number" && macrosEnergy <= 0.1 && calories > 0) {
    return {
      calories,
      reconciled: false,
      caloriesFromMacros: kcal,
      caloriesInput: calories,
    };
  }
  if (typeof calories === "number" && Math.abs(calories - kcal) <= 5) {
    return {
      calories,
      reconciled: false,
      caloriesFromMacros: kcal,
      caloriesInput: calories,
    };
  }
  return {
    calories: kcal,
    reconciled: calories !== undefined,
    caloriesFromMacros: kcal,
    caloriesInput: calories,
  };
}

async function callFn(path: string, body?: any, method: "GET" | "POST" = "POST") {
  const tzOffsetMins =
    typeof Intl !== "undefined" ? new Date().getTimezoneOffset() : 0;
  return fnJson(path, {
    method,
    body: method === "POST" ? body || {} : undefined,
    headers: { "x-tz-offset-mins": String(tzOffsetMins) },
  });
}

export async function addMeal(dateISO: string, meal: MealEntry) {
  if (isDemo()) {
    throw new Error("demo-blocked");
  }
  const entry = scrubUndefined({ ...meal, ...computeCalories(meal) });
  const result = (await callFn("/addMeal", { dateISO, meal: entry })) as {
    totals?: any;
    meal?: any;
  };
  return result;
}

export async function deleteMeal(dateISO: string, mealId: string) {
  if (isDemo()) {
    throw new Error("demo-blocked");
  }
  return callFn("/deleteMeal", { dateISO, mealId });
}

export async function getDailyLog(dateISO: string) {
  if (isDemo()) {
    return DEMO_NUTRITION_LOG;
  }
  const params = new URLSearchParams();
  if (dateISO) {
    params.set("date", dateISO);
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiFetchJson(`${"/nutrition/daily-log"}${suffix}`, { method: "GET" });
}

export async function getNutritionHistory(
  range: 7 | 30,
  anchorDateISO?: string
): Promise<NutritionHistoryDay[]> {
  if (isDemo()) {
    return DEMO_NUTRITION_HISTORY.slice(0, range);
  }
  const params = new URLSearchParams();
  params.set("days", String(range));
  if (anchorDateISO) {
    params.set("anchorDate", anchorDateISO);
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await apiFetchJson<{ days?: any[] }>(
    `/nutrition/history${suffix}`,
    { method: "GET" }
  );
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

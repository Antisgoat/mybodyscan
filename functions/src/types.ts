import type { Timestamp } from "firebase-admin/firestore";

export interface ScanDocument {
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  status: string;
  legacyStatus?: string;
  statusV1?: string;
  files?: string[];
  metrics?: Record<string, any>;
  usedFallback?: boolean;
  result?: {
    bfPct: number;
    range: { low: number; high: number };
    confidence: "low" | "medium" | "high";
    notes: string[];
  };
}

export interface NutritionItemSnapshot {
  id?: string;
  name: string;
  brand?: string | null;
  source?: "USDA" | "OFF" | string;
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
  per_100g?: {
    kcal?: number | null;
    protein_g?: number | null;
    carbs_g?: number | null;
    fat_g?: number | null;
  } | null;
  fdcId?: number | null;
  gtin?: string | null;
}

export interface MealServingSelection {
  qty?: number;
  unit?: string;
  grams?: number | null;
  originalQty?: number | null;
  originalUnit?: string | null;
}

export interface MealRecord {
  id: string;
  name: string;
  protein?: number;
  carbs?: number;
  fat?: number;
  alcohol?: number;
  calories?: number;
  caloriesFromMacros?: number;
  caloriesInput?: number;
  notes?: string | null;
  serving?: MealServingSelection | null;
  item?: NutritionItemSnapshot | null;
  entrySource?: "search" | "barcode" | "manual" | string;
}

export interface DailyLogDocument {
  meals: MealRecord[];
  totals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    alcohol: number;
  };
  updatedAt?: Timestamp;
}

export interface WorkoutExercise {
  id: string;
  name: string;
  sets: number;
  reps: number;
  done?: boolean;
}

export interface WorkoutDay {
  day: string;
  exercises: WorkoutExercise[];
}

export interface WorkoutPlan {
  id?: string;
  active?: boolean;
  createdAt: Timestamp;
  prefs?: Record<string, any>;
  days: WorkoutDay[];
}

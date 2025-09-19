import type { Timestamp } from "firebase-admin/firestore";

export interface ScanDocument {
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  status: string;
  legacyStatus?: string;
  statusV1?: string;
  files?: string[];
  metrics?: Record<string, any>;
  mock?: boolean;
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

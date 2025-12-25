import type { Timestamp } from "firebase-admin/firestore";

export interface ScanEstimate {
  bodyFatPercent: number;
  bmi: number | null;
  notes: string;
  leanMassKg?: number | null;
  fatMassKg?: number | null;
  bmiCategory?: string | null;
  keyObservations?: string[];
  goalRecommendations?: string[];
}

export interface ScanWorkoutPlan {
  summary: string;
  progressionRules: string[];
  weeks: {
    weekNumber: number;
    days: {
      day: string;
      focus: string;
      exercises: {
        name: string;
        sets: number;
        reps: string;
        notes?: string;
      }[];
    }[];
  }[];
}

export interface ScanNutritionPlan {
  caloriesPerDay: number;
  proteinGrams: number;
  carbsGrams: number;
  fatsGrams: number;
  adjustmentRules: string[];
  sampleDay: {
    mealName: string;
    description: string;
    calories: number;
    proteinGrams: number;
    carbsGrams: number;
    fatsGrams: number;
  }[];
}

export interface ScanDocument {
  id: string;
  uid: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt?: Timestamp | null;
  status:
    | "uploading"
    | "uploaded"
    | "pending"
    | "queued"
    | "processing"
    | "complete"
    | "error";
  errorMessage?: string;
  errorReason?: string | null;
  errorInfo?: {
    code?: string;
    message?: string;
    stage?: string;
    debugId?: string;
    stack?: string;
  } | null;
  lastStep?: string | null;
  lastStepAt?: Timestamp | null;
  progress?: number | null;
  correlationId?: string | null;
  processingRequestedAt?: Timestamp | null;
  processingStartedAt?: Timestamp | null;
  processingHeartbeatAt?: Timestamp | null;
  processingAttemptId?: string | null;
  submitRequestId?: string | null;
  /** Stored once at scan time so the result page doesn't call OpenAI again. */
  recommendations?: string[] | null;
  photoPaths: {
    front: string;
    back: string;
    left: string;
    right: string;
  };
  input: {
    currentWeightKg: number;
    goalWeightKg: number;
  };
  estimate: ScanEstimate | null;
  workoutPlan: ScanWorkoutPlan | null;
  nutritionPlan: ScanNutritionPlan | null;
  /** Optional: structured list of focus areas (bullets). */
  improvementAreas?: string[] | null;
  /** Optional: explicit disclaimer (UI can render verbatim). */
  disclaimer?: string | null;
  /** Optional alias for workoutPlan for newer clients. */
  workoutProgram?: ScanWorkoutPlan | null;
  /** Markdown summary of the result (ChatGPT-style). */
  planMarkdown?: string | null;
  legacyStatus?: string;
  statusV1?: string;
  files?: string[];
  metrics?: Record<string, unknown>;
  usedFallback?: boolean;
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
  /** Optional diary grouping bucket. Backward compatible (older entries omit). */
  mealType?: "breakfast" | "lunch" | "dinner" | "snacks" | string;
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
  reps: number | string;
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
  updatedAt?: Timestamp;
  /** "deterministic" | "openai" | "catalog" | "custom" (client may omit) */
  source?: string;
  /** Human-friendly plan name shown in UI. */
  title?: string;
  /** Goal label (free-form for now; keep short). */
  goal?: string;
  /** Experience/level label (free-form for now; keep short). */
  level?: string;
  /** Catalog program id when source==="catalog". */
  catalogProgramId?: string;
  /** Plan lifecycle status (null/undefined treated as active). */
  status?: "active" | "paused" | "ended";
  pausedAt?: Timestamp | null;
  endedAt?: Timestamp | null;
  prefs?: Record<string, unknown>;
  /** Customization preferences captured when source==="custom". */
  customPrefs?: Record<string, unknown>;
  days: WorkoutDay[];
}

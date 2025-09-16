export interface MacroBreakdown {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface NormalizedFood {
  id: string;
  source: "fdc" | "off";
  name: string;
  brand?: string;
  barcode?: string;
  per100g: MacroBreakdown;
  perPortion?: MacroBreakdown;
  portion?: { label: string; grams?: number };
}

export interface DayLogEntry {
  id: string;
  item: NormalizedFood;
  qty: number;
  macros: MacroBreakdown;
  addedAt: FirebaseFirestore.Timestamp;
}

export interface DayLogDocument {
  entries: DayLogEntry[];
  totals: MacroBreakdown;
  updatedAt: FirebaseFirestore.Timestamp;
}

export type WorkoutBlockType = "warmup" | "main" | "accessory" | "conditioning";

export interface WorkoutBlock {
  type: WorkoutBlockType;
  name: string;
  sets: number;
  reps: string;
  rir?: number;
  restSec?: number;
  tips?: string;
}

export interface WorkoutDay {
  name: string;
  dayOfWeek: number;
  blocks: WorkoutBlock[];
}

export interface PlanWeek {
  number: number;
  days: WorkoutDay[];
  changes?: string[];
}

export interface PlanMeta {
  planId: string;
  lengthWeeks: number;
  daysPerWeek: number;
  sessionMins: number;
  goal: string;
  weakSpots?: string[];
  equipment?: string[];
  startDate: FirebaseFirestore.Timestamp;
  nutrition: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  cardioSessions: number;
  rirTarget: number;
  volumeLevel: number;
}

export interface Plan {
  weeks: PlanWeek[];
  meta: PlanMeta;
}

export interface ScanResult {
  bfPercent: number;
  weight: number;
  bmi: number;
  leanMass: number;
  muscleMass: number;
  bmr: number;
  tee: number;
  visceralFat: number;
  photos: string[];
  completedAt: FirebaseFirestore.Timestamp;
}

export interface EntitlementResponse {
  subscribed: boolean;
  plan?: "monthly" | "annual" | "iap" | "trial";
  credits?: number;
  iap_receipt_pending?: boolean;
}

export interface CoachCheckIn {
  avgWeightNow: number;
  avgWeightPrev: number;
  nutritionAdherence: number;
  proteinAdherence: number;
  workoutAdherence: number;
  recoveryScore: number;
  avgSleepHours: number;
  cardioFeedback?: string;
  injuriesNote?: string;
  preference?: string;
  createdAt: FirebaseFirestore.Timestamp;
  adjustments: string[];
  nextWeek: number;
}

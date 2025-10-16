import type { FoodItem } from "@/lib/nutrition/types";
import { persistDemoFlags } from "@/lib/demoFlag";

type DemoOfflineListener = (state: DemoOfflineState) => void;

export interface DemoOfflineState {
  active: boolean;
  reason?: string;
  timestamp: number;
}

const listeners = new Set<DemoOfflineListener>();
let state: DemoOfflineState = { active: false, timestamp: 0 };

function emit() {
  for (const listener of listeners) {
    try {
      listener(state);
    } catch (error) {
      console.warn("[demo-offline] listener error", error);
    }
  }
}

export function subscribeDemoOffline(listener: DemoOfflineListener): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export function getDemoOfflineState(): DemoOfflineState {
  return state;
}

export function isDemoOffline(): boolean {
  return state.active;
}

export function markDemoOffline(reason?: string): void {
  const nextReason = reason ?? state.reason;
  const next: DemoOfflineState = {
    active: true,
    reason: nextReason,
    timestamp: Date.now(),
  };
  const changed = !state.active || state.reason !== next.reason;
  state = next;
  if (changed) {
    emit();
  }
}

export function clearDemoOffline(): void {
  if (!state.active) return;
  state = { active: false, timestamp: Date.now() };
  emit();
}

export function activateOfflineDemo(reason?: string): void {
  try {
    persistDemoFlags();
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("[demo-offline] persist flags failed", error);
    }
  }
  markDemoOffline(reason);
}

export function shouldFallbackToOffline(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof DOMException && error.name === "AbortError") {
    return false;
  }
  const code = typeof (error as any)?.code === "string" ? (error as any).code : "";
  if (code.includes("network") || code.includes("unavailable") || code.includes("timeout")) {
    return true;
  }
  const status = (error as any)?.status;
  if (status === 0 || status === 408 || status === 502 || status === 503 || status === 504) {
    return true;
  }
  const message = typeof (error as any)?.message === "string" ? (error as any).message : "";
  if (/network|offline|unreachable|fetch|timeout/i.test(message)) {
    return true;
  }
  if ((error as any)?.name === "TypeError" && message.includes("fetch")) {
    return true;
  }
  return false;
}

export const OFFLINE_DEMO_UID = "offline-demo-user";

export const OFFLINE_DEMO_CREDITS = {
  credits: 1,
  unlimited: false,
  tester: false,
};

const OFFLINE_NUTRITION_ITEMS: FoodItem[] = [
  {
    id: "offline-greek-yogurt",
    name: "Greek yogurt parfait",
    brand: "Offline Pantry",
    source: "USDA",
    kcal: 360,
    protein: 28,
    carbs: 34,
    fat: 9,
    servingGrams: 220,
    per: "serving",
    basePer100g: { kcal: 163, protein: 12.7, carbs: 15.4, fat: 4.1 },
    servings: [
      { id: "srv-1", label: "1 bowl", grams: 220, isDefault: true },
      { id: "srv-2", label: "100 g", grams: 100, isDefault: false },
    ],
    serving: { qty: 1, unit: "bowl", text: "1 bowl" },
    per_serving: { kcal: 360, protein_g: 28, carbs_g: 34, fat_g: 9 },
    per_100g: { kcal: 163, protein_g: 12.7, carbs_g: 15.4, fat_g: 4.1 },
    gtin: undefined,
    fdcId: undefined,
    raw: null,
  },
  {
    id: "offline-chicken-bowl",
    name: "Chicken quinoa bowl",
    brand: "Offline Pantry",
    source: "USDA",
    kcal: 520,
    protein: 42,
    carbs: 48,
    fat: 12,
    servingGrams: 320,
    per: "serving",
    basePer100g: { kcal: 162, protein: 13.1, carbs: 15, fat: 3.8 },
    servings: [
      { id: "srv-1", label: "1 bowl", grams: 320, isDefault: true },
      { id: "srv-2", label: "100 g", grams: 100, isDefault: false },
    ],
    serving: { qty: 1, unit: "bowl", text: "1 bowl" },
    per_serving: { kcal: 520, protein_g: 42, carbs_g: 48, fat_g: 12 },
    per_100g: { kcal: 162, protein_g: 13.1, carbs_g: 15, fat_g: 3.8 },
    gtin: undefined,
    fdcId: undefined,
    raw: null,
  },
  {
    id: "offline-salmon-dinner",
    name: "Salmon with roasted potatoes",
    brand: "Offline Pantry",
    source: "USDA",
    kcal: 540,
    protein: 38,
    carbs: 44,
    fat: 18,
    servingGrams: 300,
    per: "serving",
    basePer100g: { kcal: 180, protein: 12.7, carbs: 14.7, fat: 6 },
    servings: [
      { id: "srv-1", label: "1 plate", grams: 300, isDefault: true },
      { id: "srv-2", label: "100 g", grams: 100, isDefault: false },
    ],
    serving: { qty: 1, unit: "plate", text: "1 plate" },
    per_serving: { kcal: 540, protein_g: 38, carbs_g: 44, fat_g: 18 },
    per_100g: { kcal: 180, protein_g: 12.7, carbs_g: 14.7, fat_g: 6 },
    gtin: undefined,
    fdcId: undefined,
    raw: null,
  },
  {
    id: "offline-protein-shake",
    name: "Vanilla whey protein shake",
    brand: "Offline Pantry",
    source: "USDA",
    kcal: 220,
    protein: 30,
    carbs: 8,
    fat: 4,
    servingGrams: 350,
    per: "serving",
    basePer100g: { kcal: 63, protein: 8.6, carbs: 2.3, fat: 1.1 },
    servings: [
      { id: "srv-1", label: "1 shake", grams: 350, isDefault: true },
      { id: "srv-2", label: "100 g", grams: 100, isDefault: false },
    ],
    serving: { qty: 1, unit: "shake", text: "1 prepared shake" },
    per_serving: { kcal: 220, protein_g: 30, carbs_g: 8, fat_g: 4 },
    per_100g: { kcal: 63, protein_g: 8.6, carbs_g: 2.3, fat_g: 1.1 },
    gtin: undefined,
    fdcId: undefined,
    raw: null,
  },
  {
    id: "offline-overnight-oats",
    name: "Berry overnight oats",
    brand: "Offline Pantry",
    source: "USDA",
    kcal: 410,
    protein: 18,
    carbs: 55,
    fat: 12,
    servingGrams: 260,
    per: "serving",
    basePer100g: { kcal: 157, protein: 6.9, carbs: 21.1, fat: 4.6 },
    servings: [
      { id: "srv-1", label: "1 jar", grams: 260, isDefault: true },
      { id: "srv-2", label: "100 g", grams: 100, isDefault: false },
    ],
    serving: { qty: 1, unit: "jar", text: "1 mason jar" },
    per_serving: { kcal: 410, protein_g: 18, carbs_g: 55, fat_g: 12 },
    per_100g: { kcal: 157, protein_g: 6.9, carbs_g: 21.1, fat_g: 4.6 },
    gtin: undefined,
    fdcId: undefined,
    raw: null,
  },
];

export function offlineNutritionSearch(query: string) {
  const normalized = query.trim().toLowerCase();
  const items = OFFLINE_NUTRITION_ITEMS.filter((item) => {
    if (!normalized) return true;
    const haystack = `${item.name} ${item.brand ?? ""}`.toLowerCase();
    return haystack.includes(normalized);
  });
  return {
    items: items.length ? items : OFFLINE_NUTRITION_ITEMS,
    primarySource: "USDA" as const,
    fallbackUsed: true,
    sourceErrors: { offline: true },
  };
}

export type OfflineCoachMessage = {
  id: string;
  text: string;
  response: string;
  createdAt: Date;
  usedLLM: boolean;
};

const OFFLINE_COACH_MESSAGES: OfflineCoachMessage[] = [
  {
    id: "offline-1",
    text: "How should I train this week?",
    response:
      "Here's a balanced 3-day plan while you're offline: Day 1 Upper Body with bench press 4×8, row 3×12, incline push-ups 3×15. Day 2 Lower Body with trap-bar deadlift 3×6, split squat 3×10/leg, plank 3×45s. Day 3 Conditioning with 20 min zone 2 bike, kettlebell swings 3×15, side planks 3×40s. Keep RPE around 7 and focus on control.",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4),
    usedLLM: false,
  },
  {
    id: "offline-2",
    text: "What should I eat today?",
    response:
      "Aim for ~2,200 kcal split across high-protein meals: Greek yogurt parfait breakfast, chicken quinoa bowl lunch, salmon with roasted potatoes dinner, and a protein shake snack. Hydrate with 90 oz water and include colorful veggies with each plate. Offline tips only—log your meals once you're back online.",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3),
    usedLLM: false,
  },
];

export function offlineCoachHistory(): OfflineCoachMessage[] {
  return OFFLINE_COACH_MESSAGES.map((msg, idx) => ({
    ...msg,
    id: `${msg.id}-${idx}`,
  }));
}

export function offlineCoachResponse(prompt: string): OfflineCoachMessage {
  const lower = prompt.trim().toLowerCase();
  let response =
    "Here's a simple offline workout: Warm up 5 minutes, then rotate through squats 3×10, push-ups 3×12, dumbbell rows 3×12, and finish with a 10 minute brisk walk. Keep RPE 6-7 and stretch afterward.";
  if (lower.includes("recovery") || lower.includes("sore") || lower.includes("rest")) {
    response =
      "Use today as active recovery: 10 minutes easy cardio, mobility flow for hips and thoracic spine, then 3×30s dead bugs and bird-dogs. Hydrate well and focus on sleep tonight.";
  } else if (lower.includes("nutrition") || lower.includes("food") || lower.includes("eat")) {
    response =
      "Build each meal offline with lean protein (~30g), colorful veggies, complex carbs, and healthy fats. Example day: yogurt parfait breakfast, chicken quinoa bowl lunch, salmon with potatoes dinner, plus a protein shake snack.";
  }
  return {
    id: `offline-${Date.now()}`,
    text: prompt,
    response,
    createdAt: new Date(),
    usedLLM: false,
  };
}

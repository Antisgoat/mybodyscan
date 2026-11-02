export type MealPhotoEstimate = {
  name: string;
  protein: number;
  carbs: number;
  fat: number;
  grams: number;
  notes: string;
  requestId: string;
  confidence: number;
};

/** Treat network output as untrusted even when the server validates it too. */
export function readMealPhotoEstimate(value: unknown): MealPhotoEstimate {
  const raw = value as Partial<MealPhotoEstimate> | null;
  if (
    !raw ||
    typeof raw.name !== "string" ||
    !raw.name.trim() ||
    raw.name.length > 120 ||
    typeof raw.notes !== "string" ||
    raw.notes.length > 600 ||
    typeof raw.requestId !== "string" ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(raw.requestId) ||
    typeof raw.confidence !== "number" ||
    !Number.isFinite(raw.confidence) ||
    raw.confidence < 0 ||
    raw.confidence > 1
  ) {
    throw new Error("invalid_meal_estimate");
  }
  for (const key of ["protein", "carbs", "fat", "grams"] as const) {
    const n = raw[key];
    if (
      typeof n !== "number" ||
      !Number.isFinite(n) ||
      n < 0 ||
      n > (key === "grams" ? 3000 : 500)
    )
      throw new Error("invalid_meal_estimate");
  }
  const result = raw as MealPhotoEstimate;
  const macros = result.protein + result.carbs + result.fat;
  if (result.grams <= 0 || macros <= 0 || macros > result.grams)
    throw new Error("invalid_meal_estimate");
  return {
    name: result.name.trim(),
    notes: result.notes.trim(),
    requestId: result.requestId,
    confidence: result.confidence,
    grams: result.grams,
    protein: result.protein,
    carbs: result.carbs,
    fat: result.fat,
  };
}

export const MEAL_PHOTO_PORTIONS = [25, 50, 75, 100, 150, 200] as const;

/** Local-only scaling: a portion choice must never trigger another AI request. */
export function mealPhotoPortion(estimate: MealPhotoEstimate, percent: number) {
  if (!(MEAL_PHOTO_PORTIONS as readonly number[]).includes(percent))
    throw new Error("invalid_meal_portion");
  const factor = percent / 100;
  const protein = Math.round(estimate.protein * factor * 10) / 10;
  const carbs = Math.round(estimate.carbs * factor * 10) / 10;
  const fat = Math.round(estimate.fat * factor * 10) / 10;
  return {
    protein,
    carbs,
    fat,
    calories: Math.round(protein * 4 + carbs * 4 + fat * 9),
  };
}

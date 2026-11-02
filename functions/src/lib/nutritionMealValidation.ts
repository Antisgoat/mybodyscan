import { HttpsError } from "firebase-functions/v2/https";
import type { MealRecord } from "../types.js";

/** Reject malformed diary writes before arithmetic or a Firestore transaction. */
export function validateMeal(meal: MealRecord) {
  if (
    typeof meal.name !== "string" ||
    !meal.name.trim() ||
    meal.name.length > 140
  ) {
    throw new HttpsError(
      "invalid-argument",
      "A meal name of 1–140 characters is required"
    );
  }
  if (typeof meal.id !== "string" || !meal.id.trim() || meal.id.length > 120) {
    throw new HttpsError("invalid-argument", "Invalid meal identifier");
  }
  if (
    meal.notes != null &&
    (typeof meal.notes !== "string" || meal.notes.length > 1000)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Meal notes must be at most 1000 characters"
    );
  }
  const fields = ["calories", "protein", "carbs", "fat", "alcohol"] as const;
  let known = false;
  for (const field of fields) {
    const value = meal[field];
    if (value == null) continue;
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > (field === "calories" ? 100000 : 10000)
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Nutrition values must be finite, non-negative numbers within logging limits"
      );
    }
    known = true;
  }
  if (!known)
    throw new HttpsError(
      "invalid-argument",
      "At least one nutrition value is required"
    );
}

export function safeNutritionNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

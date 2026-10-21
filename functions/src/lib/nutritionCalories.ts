import type { MealRecord } from "../types.js";

function round(value: number, decimals = 0) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function computeCalories(meal: MealRecord) {
  const protein = round(meal.protein || 0, 1);
  const carbs = round(meal.carbs || 0, 1);
  const fat = round(meal.fat || 0, 1);
  const alcohol = round(meal.alcohol || 0, 1);
  const macrosEnergy = protein * 4 + carbs * 4 + fat * 9 + alcohol * 7;
  const caloriesFromMacros = round(macrosEnergy, 0);
  let calories = caloriesFromMacros;
  let caloriesInput: number | undefined;
  if (typeof meal.calories === "number") {
    caloriesInput = meal.calories;
    // Quick add / calories-only entries: if macros are empty, trust the explicit calories.
    if (
      (meal.item && Number.isFinite(meal.calories) && meal.calories >= 0) ||
      (macrosEnergy <= 0.1 && meal.calories > 0)
    ) {
      calories = round(meal.calories, 0);
      return {
        protein,
        carbs,
        fat,
        alcohol,
        calories,
        caloriesFromMacros,
        caloriesInput,
      };
    }
    if (Math.abs(meal.calories - caloriesFromMacros) <= 5) {
      calories = round(meal.calories, 0);
    }
  }
  return {
    protein,
    carbs,
    fat,
    alcohol,
    calories,
    caloriesFromMacros,
    caloriesInput,
  };
}

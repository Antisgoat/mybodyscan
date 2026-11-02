import {
  availableServingUnits,
  calculateSelection,
  type ServingUnit,
} from "@/lib/nutritionMath";
import type { FoodItem } from "./types";

export type MeasuredIngredient = {
  item: FoodItem;
  qty: number;
  unit: ServingUnit;
};
export type RecipeMacros = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

/** Database/label arithmetic only: never infer quantities or missing nutrients. */
export function calculateRecipeTotals(
  ingredients: readonly MeasuredIngredient[],
  servings: number
) {
  if (!Number.isInteger(servings) || servings < 1 || servings > 100)
    throw new Error("Choose a whole number of servings between 1 and 100.");
  if (!ingredients.length || ingredients.length > 50)
    throw new Error("Add between 1 and 50 measured ingredients.");
  const total: RecipeMacros = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  for (const ingredient of ingredients) {
    if (!availableServingUnits(ingredient.item).includes(ingredient.unit))
      throw new Error(
        `${ingredient.item.name} has no nutrition conversion for that unit.`
      );
    if (
      !Number.isFinite(ingredient.qty) ||
      ingredient.qty <= 0 ||
      ingredient.qty > 100_000
    )
      throw new Error("Each ingredient needs a valid, positive quantity.");
    const selected = calculateSelection(
      ingredient.item,
      ingredient.qty,
      ingredient.unit
    );
    for (const key of ["calories", "protein", "carbs", "fat"] as const) {
      const value = selected[key];
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
        throw new Error(
          `${ingredient.item.name} is missing valid nutrients for that portion.`
        );
      total[key] += value;
    }
  }
  const perServing = Object.fromEntries(
    Object.entries(total).map(([key, value]) => [
      key,
      Math.round((value / servings) * 100) / 100,
    ])
  ) as RecipeMacros;
  return { total, perServing };
}

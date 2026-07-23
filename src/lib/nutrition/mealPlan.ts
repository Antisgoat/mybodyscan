export type MealPlanDiet =
  | "balanced"
  | "lower_carb"
  | "vegetarian"
  | "vegan";

export type MealPlanTargets = {
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
};

export type MealPlanMeal = MealPlanTargets & {
  slot: "Breakfast" | "Lunch" | "Snack" | "Dinner";
  title: string;
};

export type MealPlanDay = {
  day: string;
  meals: MealPlanMeal[];
  totals: MealPlanTargets;
};

export type WeeklyMealPlan = {
  diet: MealPlanDiet;
  dietLabel: string;
  days: MealPlanDay[];
};

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const SLOTS = ["Breakfast", "Lunch", "Snack", "Dinner"] as const;
const SPLITS = [0.25, 0.3, 0.15, 0.3] as const;

type MealSlot = (typeof SLOTS)[number];

const MEALS: Record<MealPlanDiet, Record<MealSlot, readonly string[]>> = {
  balanced: {
    Breakfast: [
      "Greek yogurt, oats, berries, and walnuts",
      "Eggs, whole-grain toast, avocado, and fruit",
      "Protein oatmeal with banana and peanut butter",
      "Cottage cheese bowl with fruit and granola",
      "Spinach egg wrap with salsa and fruit",
      "Overnight oats with yogurt, chia, and berries",
      "Whole-grain waffles with yogurt and fruit",
    ],
    Lunch: [
      "Chicken quinoa bowl with greens and tahini",
      "Turkey avocado wrap with crunchy vegetables",
      "Tuna rice bowl with cucumber and edamame",
      "Chicken pesto pasta salad with tomatoes",
      "Salmon grain bowl with greens and lemon",
      "Turkey burger bowl with potatoes and slaw",
      "Chicken hummus pita with chopped salad",
    ],
    Snack: [
      "Apple with Greek yogurt and almonds",
      "Cottage cheese with pineapple",
      "Protein smoothie with milk and berries",
      "Hummus with vegetables and whole-grain crackers",
      "Greek yogurt with banana",
      "Trail mix and a protein shake",
      "String cheese, fruit, and pistachios",
    ],
    Dinner: [
      "Salmon, roasted potatoes, and green beans",
      "Lean beef stir-fry with rice and vegetables",
      "Chicken tacos with beans, slaw, and salsa",
      "Turkey meatballs with pasta and broccoli",
      "Shrimp fried rice with mixed vegetables",
      "Chicken curry with rice and spinach",
      "Baked cod, quinoa, and roasted vegetables",
    ],
  },
  lower_carb: {
    Breakfast: [
      "Egg scramble with spinach, feta, and avocado",
      "Greek yogurt with berries, chia, and walnuts",
      "Cottage cheese, cucumber, tomato, and eggs",
      "Vegetable omelet with avocado",
      "Chia yogurt bowl with berries and almonds",
      "Egg muffins with turkey and peppers",
      "Smoked salmon, eggs, cucumber, and tomato",
    ],
    Lunch: [
      "Chicken chopped salad with avocado and seeds",
      "Turkey lettuce wraps with crunchy vegetables",
      "Tuna salad bowl with olives and greens",
      "Chicken cauliflower-rice bowl with salsa",
      "Salmon salad with cucumber and lemon",
      "Lean burger salad with slaw and pickles",
      "Chicken Greek salad with hummus",
    ],
    Snack: [
      "Greek yogurt and walnuts",
      "Cottage cheese and cucumber",
      "Protein shake and almonds",
      "Vegetables with hummus",
      "Two eggs and cherry tomatoes",
      "Cheese, peppers, and pistachios",
      "Greek yogurt with chia",
    ],
    Dinner: [
      "Salmon, cauliflower mash, and green beans",
      "Lean beef stir-fry with extra vegetables",
      "Chicken fajita bowl over cauliflower rice",
      "Turkey meatballs with zucchini and marinara",
      "Shrimp vegetable skillet with avocado",
      "Chicken curry with cauliflower rice and spinach",
      "Baked cod with roasted vegetables and tahini",
    ],
  },
  vegetarian: {
    Breakfast: [
      "Greek yogurt, oats, berries, and walnuts",
      "Eggs, whole-grain toast, avocado, and fruit",
      "Protein oatmeal with banana and peanut butter",
      "Cottage cheese bowl with fruit and granola",
      "Spinach egg wrap with salsa and fruit",
      "Overnight oats with yogurt, chia, and berries",
      "Whole-grain waffles with yogurt and fruit",
    ],
    Lunch: [
      "Lentil quinoa bowl with greens and tahini",
      "Egg and avocado wrap with crunchy vegetables",
      "Tofu rice bowl with cucumber and edamame",
      "Chickpea pesto pasta salad with tomatoes",
      "Tempeh grain bowl with greens and lemon",
      "Black bean burger bowl with potatoes and slaw",
      "Falafel hummus pita with chopped salad",
    ],
    Snack: [
      "Apple with Greek yogurt and almonds",
      "Cottage cheese with pineapple",
      "Protein smoothie with milk and berries",
      "Hummus with vegetables and whole-grain crackers",
      "Greek yogurt with banana",
      "Trail mix and a protein shake",
      "String cheese, fruit, and pistachios",
    ],
    Dinner: [
      "Tofu, roasted potatoes, and green beans",
      "Tempeh stir-fry with rice and vegetables",
      "Black bean tacos with slaw and salsa",
      "Lentil meatballs with pasta and broccoli",
      "Egg fried rice with edamame and vegetables",
      "Chickpea curry with rice and spinach",
      "Baked tofu, quinoa, and roasted vegetables",
    ],
  },
  vegan: {
    Breakfast: [
      "Soy yogurt, oats, berries, chia, and walnuts",
      "Tofu scramble, whole-grain toast, and avocado",
      "Protein oatmeal with banana and peanut butter",
      "Chia pudding with soy milk, fruit, and granola",
      "Tofu spinach wrap with salsa and fruit",
      "Overnight oats with soy yogurt and berries",
      "Whole-grain waffles with nut butter and fruit",
    ],
    Lunch: [
      "Lentil quinoa bowl with greens and tahini",
      "Tempeh avocado wrap with crunchy vegetables",
      "Tofu rice bowl with cucumber and edamame",
      "Chickpea pesto pasta salad with tomatoes",
      "Seitan grain bowl with greens and lemon",
      "Black bean burger bowl with potatoes and slaw",
      "Falafel hummus pita with chopped salad",
    ],
    Snack: [
      "Apple with soy yogurt and almonds",
      "Roasted edamame with fruit",
      "Plant-protein smoothie with soy milk and berries",
      "Hummus with vegetables and whole-grain crackers",
      "Soy yogurt with banana and chia",
      "Trail mix and a plant-protein shake",
      "Roasted chickpeas, fruit, and pistachios",
    ],
    Dinner: [
      "Tofu, roasted potatoes, and green beans",
      "Tempeh stir-fry with rice and vegetables",
      "Black bean tacos with slaw and salsa",
      "Lentil balls with pasta and broccoli",
      "Tofu fried rice with edamame and vegetables",
      "Chickpea curry with rice and spinach",
      "Baked seitan, quinoa, and roasted vegetables",
    ],
  },
};

const LABELS: Record<MealPlanDiet, string> = {
  balanced: "Balanced",
  lower_carb: "Lower-carb",
  vegetarian: "Vegetarian",
  vegan: "Vegan",
};

function safeTarget(value: number, fallback: number, min: number): number {
  return Math.max(
    min,
    Math.round(Number.isFinite(value) ? value : fallback)
  );
}

function distribute(total: number): number[] {
  const allocations = SPLITS.map((split) => Math.round(total * split));
  allocations[allocations.length - 1] +=
    total - allocations.reduce((sum, value) => sum + value, 0);
  return allocations;
}

export function normalizeMealPlanDiet(value: unknown): MealPlanDiet {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  if (normalized === "vegan") return "vegan";
  if (normalized === "vegetarian") return "vegetarian";
  if (
    normalized === "low_carb" ||
    normalized === "keto" ||
    normalized === "ketogenic"
  ) {
    return "lower_carb";
  }
  return "balanced";
}

export function buildWeeklyMealPlan(
  requestedTargets: MealPlanTargets,
  requestedDiet?: unknown
): WeeklyMealPlan {
  const targets: MealPlanTargets = {
    calories: safeTarget(requestedTargets.calories, 2200, 1200),
    proteinGrams: safeTarget(requestedTargets.proteinGrams, 140, 0),
    carbsGrams: safeTarget(requestedTargets.carbsGrams, 220, 0),
    fatGrams: safeTarget(requestedTargets.fatGrams, 70, 0),
  };
  const diet = normalizeMealPlanDiet(requestedDiet);
  const calories = distribute(targets.calories);
  const protein = distribute(targets.proteinGrams);
  const carbs = distribute(targets.carbsGrams);
  const fat = distribute(targets.fatGrams);

  return {
    diet,
    dietLabel: LABELS[diet],
    days: DAYS.map((day, dayIndex) => ({
      day,
      totals: targets,
      meals: SLOTS.map((slot, mealIndex) => ({
        slot,
        title: MEALS[diet][slot][dayIndex],
        calories: calories[mealIndex],
        proteinGrams: protein[mealIndex],
        carbsGrams: carbs[mealIndex],
        fatGrams: fat[mealIndex],
      })),
    })),
  };
}

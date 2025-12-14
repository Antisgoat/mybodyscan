export type NutritionGoal = "lose_fat" | "gain_muscle" | "maintain" | "recomp";

export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "very"
  | "extra";

export type DerivedNutritionPlan = {
  caloriesPerDay: number;
  proteinGrams: number;
  carbsGrams: number;
  fatsGrams: number;
  bmr: number | null;
  tdee: number | null;
  goal: NutritionGoal;
};

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function roundInt(n: number): number {
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function activityFactor(level: ActivityLevel | null | undefined): number {
  switch (level) {
    case "sedentary":
      return 1.2;
    case "light":
      return 1.375;
    case "moderate":
      return 1.55;
    case "very":
      return 1.725;
    case "extra":
      return 1.9;
    default:
      return 1.55;
  }
}

function inferGoalFromWeights(args: {
  currentWeightKg?: number | null;
  goalWeightKg?: number | null;
}): NutritionGoal {
  const current = Number(args.currentWeightKg);
  const goal = Number(args.goalWeightKg);
  if (!Number.isFinite(current) || !Number.isFinite(goal) || current <= 0 || goal <= 0) {
    return "maintain";
  }
  if (goal < current - 0.25) return "lose_fat";
  if (goal > current + 0.25) return "gain_muscle";
  return "maintain";
}

/**
 * Deterministic macro/energy targets used across Scan/Meals/Coach.
 * Keep this aligned with `src/lib/nutritionGoals.ts`.
 */
export function deriveNutritionPlan(input: {
  weightKg?: number | null;
  bodyFatPercent?: number | null;
  goal?: NutritionGoal | null;
  goalWeightKg?: number | null;
  activityLevel?: ActivityLevel | null;
  overrides?: Partial<
    Pick<DerivedNutritionPlan, "caloriesPerDay" | "proteinGrams" | "carbsGrams" | "fatsGrams">
  >;
}): DerivedNutritionPlan {
  const weightKg = Number(input.weightKg);
  const weightOk = Number.isFinite(weightKg) && weightKg > 0 ? weightKg : null;
  const bfPct = Number(input.bodyFatPercent);
  const bfOk =
    Number.isFinite(bfPct) && bfPct > 2 && bfPct < 80 ? bfPct / 100 : null;

  const goal: NutritionGoal =
    input.goal ??
    inferGoalFromWeights({ currentWeightKg: weightOk, goalWeightKg: input.goalWeightKg });

  const lbmKg =
    weightOk != null && bfOk != null ? Math.max(0, weightOk * (1 - bfOk)) : null;
  const bmr =
    lbmKg != null
      ? roundInt(370 + 21.6 * lbmKg)
      : weightOk != null
        ? roundInt(22 * weightOk)
        : null;

  const tdee =
    bmr != null ? roundInt(bmr * activityFactor(input.activityLevel)) : null;

  const caloriesPerDay =
    typeof input.overrides?.caloriesPerDay === "number" &&
    Number.isFinite(input.overrides.caloriesPerDay)
      ? roundInt(input.overrides.caloriesPerDay)
      : tdee != null
        ? roundInt(
            tdee +
              (goal === "lose_fat"
                ? -450
                : goal === "gain_muscle"
                  ? 250
                  : goal === "recomp"
                    ? -200
                    : 0)
          )
        : 2200;

  const weightLb = weightOk != null ? weightOk * 2.2046226218 : null;
  const proteinPerLb =
    goal === "lose_fat"
      ? 1.0
      : goal === "recomp"
        ? 0.95
        : goal === "maintain"
          ? 0.9
          : 0.85;
  const proteinGrams =
    typeof input.overrides?.proteinGrams === "number" &&
    Number.isFinite(input.overrides.proteinGrams)
      ? roundInt(input.overrides.proteinGrams)
      : weightLb != null
        ? roundInt(weightLb * proteinPerLb)
        : 140;

  const fatPerLb =
    goal === "lose_fat"
      ? 0.28
      : goal === "recomp"
        ? 0.3
        : goal === "maintain"
          ? 0.33
          : 0.38;
  const fatsGrams =
    typeof input.overrides?.fatsGrams === "number" &&
    Number.isFinite(input.overrides.fatsGrams)
      ? roundInt(input.overrides.fatsGrams)
      : weightLb != null
        ? roundInt(weightLb * fatPerLb)
        : roundInt((caloriesPerDay * 0.25) / 9);

  const fixedMacroCalories = proteinGrams * 4 + fatsGrams * 9;
  const remainingForCarbs = Math.max(0, caloriesPerDay - fixedMacroCalories);
  const carbsGrams =
    typeof input.overrides?.carbsGrams === "number" &&
    Number.isFinite(input.overrides.carbsGrams)
      ? roundInt(input.overrides.carbsGrams)
      : roundInt(remainingForCarbs / 4);

  // Clamp macros to avoid pathological outputs on missing inputs.
  const safeProtein = Math.max(0, clamp(proteinGrams, 0, 500));
  const safeFat = Math.max(0, clamp(fatsGrams, 0, 200));
  const safeCarbs = Math.max(0, clamp(carbsGrams, 0, 800));

  return {
    caloriesPerDay: roundInt(caloriesPerDay),
    proteinGrams: roundInt(safeProtein),
    carbsGrams: roundInt(safeCarbs),
    fatsGrams: roundInt(safeFat),
    bmr,
    tdee,
    goal,
  };
}


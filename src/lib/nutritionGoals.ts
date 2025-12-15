export type NutritionGoal = "lose_fat" | "gain_muscle" | "maintain" | "recomp";

export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "very"
  | "extra";

export type NutritionGoals = {
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  proteinPct: number;
  carbsPct: number;
  fatPct: number;
  /** Best-effort estimates for display; may be null if insufficient inputs. */
  bmr: number | null;
  tdee: number | null;
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
 * Single source of truth for nutrition targets.
 *
 * Design goals:
 * - Stable and deterministic (no OpenAI needed).
 * - Works even when only partial profile fields exist.
 * - Lets caller override known targets (e.g. coach plan's calorieTarget/proteinFloor).
 *
 * Notes:
 * - BMR uses Katch-McArdle when body fat % is provided; otherwise falls back to a
 *   conservative estimate from body weight only.
 * - Macros are computed with a protein-first approach, then fats, then carbs fill.
 */
export function deriveNutritionGoals(input: {
  /** Current body weight. */
  weightKg?: number | null;
  /** Body fat percent (0-100). If present, improves BMR estimate. */
  bodyFatPercent?: number | null;
  /** Training goal. If omitted, can be inferred from current/goal weights when provided. */
  goal?: NutritionGoal | null;
  /** Optional goal weight (kg) for goal inference. */
  goalWeightKg?: number | null;
  /** Optional activity level for TDEE. */
  activityLevel?: ActivityLevel | null;
  /**
   * Overrides from persisted plan data (e.g. coach plan).
   * If calories/protein are provided, carbs/fats are derived to match.
   */
  overrides?: Partial<Pick<NutritionGoals, "calories" | "proteinGrams" | "carbsGrams" | "fatGrams">>;
}): NutritionGoals {
  const weightKg = Number(input.weightKg);
  const weightOk = Number.isFinite(weightKg) && weightKg > 0 ? weightKg : null;
  const bfPct = Number(input.bodyFatPercent);
  const bfOk =
    Number.isFinite(bfPct) && bfPct > 2 && bfPct < 80 ? bfPct / 100 : null;

  const goal: NutritionGoal =
    input.goal ??
    inferGoalFromWeights({ currentWeightKg: weightOk, goalWeightKg: input.goalWeightKg });

  // Katch-McArdle if possible: BMR = 370 + 21.6 * LBM_kg
  const lbmKg =
    weightOk != null && bfOk != null ? Math.max(0, weightOk * (1 - bfOk)) : null;
  const bmr =
    lbmKg != null
      ? roundInt(370 + 21.6 * lbmKg)
      : weightOk != null
        ? // fallback: ~22 kcal/kg/day (rough average), used only if BF% unknown
          roundInt(22 * weightOk)
        : null;

  const tdee =
    bmr != null ? roundInt(bmr * activityFactor(input.activityLevel)) : null;

  // Calorie target: small adjustments around TDEE.
  const calorieTarget =
    typeof input.overrides?.calories === "number" && Number.isFinite(input.overrides.calories)
      ? roundInt(input.overrides.calories)
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

  // Protein target: 0.8–1.0 g/lb body weight depending on goal.
  const weightLb = weightOk != null ? weightOk * 2.2046226218 : null;
  const proteinPerLb =
    goal === "lose_fat" ? 1.0 : goal === "recomp" ? 0.95 : goal === "maintain" ? 0.9 : 0.85;
  const proteinTarget =
    typeof input.overrides?.proteinGrams === "number" &&
    Number.isFinite(input.overrides.proteinGrams)
      ? roundInt(input.overrides.proteinGrams)
      : weightLb != null
        ? roundInt(weightLb * proteinPerLb)
        : 140;

  // Fat target: 0.25–0.4 g/lb depending on goal, but clamp to reasonable energy share.
  const fatPerLb =
    goal === "lose_fat" ? 0.28 : goal === "recomp" ? 0.3 : goal === "maintain" ? 0.33 : 0.38;
  const fatTarget =
    typeof input.overrides?.fatGrams === "number" && Number.isFinite(input.overrides.fatGrams)
      ? roundInt(input.overrides.fatGrams)
      : weightLb != null
        ? roundInt(weightLb * fatPerLb)
        : roundInt((calorieTarget * 0.25) / 9);

  const fixedMacroCalories = proteinTarget * 4 + fatTarget * 9;
  const remainingForCarbs = Math.max(0, calorieTarget - fixedMacroCalories);
  const carbsTarget =
    typeof input.overrides?.carbsGrams === "number" &&
    Number.isFinite(input.overrides.carbsGrams)
      ? roundInt(input.overrides.carbsGrams)
      : roundInt(remainingForCarbs / 4);

  const totalMacroCalories = Math.max(
    1,
    proteinTarget * 4 + carbsTarget * 4 + fatTarget * 9
  );
  const proteinPct = clamp((proteinTarget * 4 * 100) / totalMacroCalories, 0, 100);
  const carbsPct = clamp((carbsTarget * 4 * 100) / totalMacroCalories, 0, 100);
  const fatPct = clamp((fatTarget * 9 * 100) / totalMacroCalories, 0, 100);

  return {
    calories: roundInt(calorieTarget),
    proteinGrams: Math.max(0, roundInt(proteinTarget)),
    carbsGrams: Math.max(0, roundInt(carbsTarget)),
    fatGrams: Math.max(0, roundInt(fatTarget)),
    proteinPct,
    carbsPct,
    fatPct,
    bmr,
    tdee,
  };
}


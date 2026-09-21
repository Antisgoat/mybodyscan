import type { ScanDocument } from "@/lib/api/scan";
import type { CoachPlan, CoachProfile } from "@/lib/coach/types";
import { deriveNutritionGoals } from "@/lib/nutritionGoals";
import { isSuccessfulPersistedScan } from "@/lib/scanContract";

export function resolveNutritionTargets(args: {
  scan?: ScanDocument | null;
  profile?: CoachProfile | null;
  plan?: CoachPlan | null;
  calorieDelta?: number;
}) {
  const { scan, profile, plan } = args;
  const scanPlan =
    scan && isSuccessfulPersistedScan(scan) ? scan.nutritionPlan : null;
  const delta = Number.isFinite(args.calorieDelta) ? Number(args.calorieDelta) : 0;
  const baseCalories = scanPlan?.caloriesPerDay ?? plan?.calorieTarget;
  const calories =
    typeof baseCalories === "number" && Number.isFinite(baseCalories)
      ? baseCalories
      : undefined;
  const proteinGrams = scanPlan?.proteinGrams ?? plan?.proteinFloor;
  const input = {
    weightKg:
      scanPlan && scan ? scan.input.currentWeightKg :
      (profile?.weight_kg ?? profile?.weightKg ?? null),
    bodyFatPercent: scanPlan ? scan?.estimate?.bodyFatPercent : null,
    goalWeightKg: scanPlan ? scan?.input.goalWeightKg : null,
    heightCm: profile?.height_cm ?? profile?.heightCm ?? null,
    age: profile?.age ?? null,
    sex: profile?.sex ?? null,
    goal:
      profile?.goal === "lose_fat" || profile?.goal === "gain_muscle"
        ? profile.goal
        : null,
    activityLevel: profile?.activity_level ?? null,
    overrides: {
      calories,
      proteinGrams,
      carbsGrams: scanPlan?.carbsGrams,
      fatGrams: scanPlan?.fatsGrams,
    },
  } as const;
  const baseGoals = deriveNutritionGoals(input);
  const goals = delta === 0
    ? baseGoals
    : deriveNutritionGoals({
        ...input,
        overrides: {
          calories: Math.max(1200, baseGoals.calories + delta),
          proteinGrams: baseGoals.proteinGrams,
          fatGrams: baseGoals.fatGrams,
        },
      });
  return { goals, source: scanPlan ? "scan" as const : "profile" as const };
}

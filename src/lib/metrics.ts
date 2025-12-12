// Fitness metrics calculations for Pro Report (US units)

export interface UserProfile {
  weightLbs: number;
  heightIn: number;
  age: number;
  gender: "male" | "female";
  activityFactor?: number; // default 1.4
}

export interface BodyComposition {
  bodyFatPct: number;
  weightLbs: number;
}

export interface Measurements {
  waistIn?: number;
  hipIn?: number;
  chestIn?: number;
  thighIn?: number;
  armIn?: number;
}

export interface MacroBreakdown {
  proteinG: number;
  proteinKcal: number;
  fatG: number;
  fatKcal: number;
  carbsG: number;
  carbsKcal: number;
  totalKcal: number;
}

export interface EnergyMetrics {
  bmr: number;
  tdee: number;
  cutCalories: number;
  maintainCalories: number;
  gainCalories: number;
}

// BMR using Mifflin-St Jeor equation
export function bmrMifflin({
  weightLbs,
  heightIn,
  age,
  gender,
}: UserProfile): number {
  if (gender === "male") {
    return 66 + 6.23 * weightLbs + 12.7 * heightIn - 6.8 * age;
  } else {
    return 655 + 4.35 * weightLbs + 4.7 * heightIn - 4.7 * age;
  }
}

// BMR using Katch-McArdle equation (requires lean body mass)
export function bmrKatchMcArdle({ lbmLbs }: { lbmLbs: number }): number {
  const lbmKg = lbmLbs / 2.205; // convert lbs to kg
  return 370 + 21.6 * lbmKg;
}

// TDEE calculation
export function tdee(bmr: number, activityFactor: number = 1.4): number {
  return bmr * activityFactor;
}

// Calculate lean and fat mass
export function bodyComposition({ weightLbs, bodyFatPct }: BodyComposition) {
  const fatMassLbs = weightLbs * (bodyFatPct / 100);
  const leanMassLbs = weightLbs - fatMassLbs;
  return { leanMassLbs, fatMassLbs };
}

// Macro plan for given calorie target
export function macroPlan({
  calories,
  lbmLbs,
  weightLbs,
}: {
  calories: number;
  lbmLbs: number;
  weightLbs: number;
}): MacroBreakdown {
  // Protein: 1g per lb of LBM
  const proteinG = Math.round(lbmLbs);
  const proteinKcal = proteinG * 4;

  // Fat: 0.35g per lb of body weight
  const fatG = Math.round(0.35 * weightLbs);
  const fatKcal = fatG * 9;

  // Carbs: remaining calories
  const remainingKcal = calories - proteinKcal - fatKcal;
  const carbsG = Math.round(Math.max(0, remainingKcal / 4));
  const carbsKcal = carbsG * 4;

  return {
    proteinG,
    proteinKcal,
    fatG,
    fatKcal,
    carbsG,
    carbsKcal,
    totalKcal: proteinKcal + fatKcal + carbsKcal,
  };
}

// Waist-to-height ratio and risk assessment
export function waistHeightRatio(
  waistIn: number,
  heightIn: number
): {
  ratio: number;
  riskLevel: "Low" | "Moderate" | "High";
} {
  const ratio = waistIn / heightIn;
  let riskLevel: "Low" | "Moderate" | "High";

  if (ratio < 0.5) {
    riskLevel = "Low";
  } else if (ratio <= 0.6) {
    riskLevel = "Moderate";
  } else {
    riskLevel = "High";
  }

  return { ratio, riskLevel };
}

// Calculate energy metrics for all targets
export function calculateEnergyMetrics(
  profile: UserProfile,
  lbmLbs?: number
): EnergyMetrics {
  // Use Katch-McArdle if LBM available, otherwise Mifflin-St Jeor
  const bmr = lbmLbs ? bmrKatchMcArdle({ lbmLbs }) : bmrMifflin(profile);
  const tdeeValue = tdee(bmr, profile.activityFactor || 1.4);

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdeeValue),
    cutCalories: Math.round(tdeeValue - 500), // 500 kcal deficit
    maintainCalories: Math.round(tdeeValue),
    gainCalories: Math.round(tdeeValue + 300), // 300 kcal surplus
  };
}

// Format measurements with fallback
export function formatMeasurement(value?: number, unit: string = "in"): string {
  return value ? `${value.toFixed(1)} ${unit}` : "—";
}

// Calculate changes between scans
export function calculateChanges(current: any, previous: any) {
  if (!previous) return null;

  const deltaWeight =
    current.weightLbs && previous.weightLbs
      ? current.weightLbs - previous.weightLbs
      : null;
  const deltaBF =
    current.bodyFatPct && previous.bodyFatPct
      ? current.bodyFatPct - previous.bodyFatPct
      : null;
  const deltaWaist =
    current.measurements?.waistIn && previous.measurements?.waistIn
      ? current.measurements.waistIn - previous.measurements.waistIn
      : null;

  return {
    deltaWeight,
    deltaBF,
    deltaWaist,
  };
}

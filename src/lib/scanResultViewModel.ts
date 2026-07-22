import type { ScanDocument } from "@/lib/api/scan";
import { canonicalizeScanStatus } from "@/lib/scanStatus";
import { isSuccessfulPersistedScan } from "@/lib/scanContract";
import { kgToLb } from "@/lib/units";
import type { CoachPlan, CoachProfile } from "@/hooks/useUserProfile";
import { normalizeProgramPreferences } from "@/lib/programs/preferences";

type UnitSystem = "metric" | "us";

export type CanonicalScanResultViewModel = {
  isValidResult: boolean;
  isFailedOrFallback: boolean;
  sourceLabel:
    | "AI analysis"
    | "Demo only"
    | "Failed"
    | "Fallback/invalid"
    | "Processing";
  failureTitle: string;
  failureMessage: string;
  status: string;
  primary: {
    bodyFatPercent: number | null;
    weightKg: number | null;
    bmi: number | null;
    leanMassKg: number | null;
    fatMassKg: number | null;
    goalProgressText: string;
  };
  nutrition: {
    available: boolean;
    calories: number | null;
    proteinGrams: number | null;
    carbsGrams: number | null;
    fatsGrams: number | null;
    fiberGrams: number | null;
    trainingDayCalories: number | null;
    restDayCalories: number | null;
    adjustmentRule: string | null;
  };
  composition: {
    heightCm: number | null;
    age: number | null;
    profileCategory: string | null;
    goalWeightKg: number | null;
    maintenanceCalories: number | null;
    confidence: string | null;
    estimateRange: string | null;
    scanQuality: string | null;
  };
  observations: { label: string; value: string }[];
  regions: { label: string; value: string }[];
  plan: {
    available: boolean;
    daysPerWeek: number | null;
    focus: string;
    summary: string;
    setupNeeded: boolean;
    detailLines: string[];
    progressionRules: string[];
    exercisePriorities: string[];
  };
  diagnostics: {
    provider: string | null;
    processingStatus: string | null;
    errorCode: string | null;
    resultSource: string | null;
    usedFallback: boolean;
    charged: boolean | null;
    refunded: boolean;
  };
};

export type ScanComparisonViewModel = {
  previousScanId: string;
  daysSincePrevious: number | null;
  weightDeltaKg: number | null;
  bodyFatDeltaPoints: number | null;
  fatMassDeltaKg: number | null;
  leanMassDeltaKg: number | null;
  calorieTargetDelta: number | null;
};

function finite(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round(value: number | null, digits = 0): number | null {
  if (value == null) return null;
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

function dateMillis(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" || typeof value === "string") {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (
    value &&
    typeof (value as { toMillis?: unknown }).toMillis === "function"
  ) {
    const parsed = (value as { toMillis: () => number }).toMillis();
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function delta(current: number | null, previous: number | null, digits = 1) {
  return current != null && previous != null
    ? round(current - previous, digits)
    : null;
}

export function buildScanComparisonViewModel(
  current: ScanDocument,
  previous: ScanDocument
): ScanComparisonViewModel | null {
  if (
    !isSuccessfulPersistedScan(current) ||
    !isSuccessfulPersistedScan(previous)
  ) {
    return null;
  }
  const currentVm = buildScanResultViewModel({ scan: current });
  const previousVm = buildScanResultViewModel({ scan: previous });
  const currentAt = dateMillis(current.completedAt ?? current.createdAt);
  const previousAt = dateMillis(previous.completedAt ?? previous.createdAt);
  const daysSincePrevious =
    currentAt != null && previousAt != null && currentAt >= previousAt
      ? Math.floor((currentAt - previousAt) / (24 * 60 * 60 * 1000))
      : null;

  return {
    previousScanId: previous.id,
    daysSincePrevious,
    weightDeltaKg: delta(
      currentVm.primary.weightKg,
      previousVm.primary.weightKg
    ),
    bodyFatDeltaPoints: delta(
      currentVm.primary.bodyFatPercent,
      previousVm.primary.bodyFatPercent
    ),
    fatMassDeltaKg: delta(
      currentVm.primary.fatMassKg,
      previousVm.primary.fatMassKg
    ),
    leanMassDeltaKg: delta(
      currentVm.primary.leanMassKg,
      previousVm.primary.leanMassKg
    ),
    calorieTargetDelta: delta(
      currentVm.nutrition.calories,
      previousVm.nutrition.calories,
      0
    ),
  };
}

export function formatKgForUnits(
  valueKg: number | null,
  units: UnitSystem
): string {
  if (valueKg == null) return "—";
  if (units === "us") return `${kgToLb(valueKg).toFixed(1)} lb`;
  return `${valueKg.toFixed(1)} kg`;
}

export function buildScanResultViewModel(args: {
  scan: ScanDocument;
  profile?: CoachProfile | null;
  plan?: CoachPlan | null;
}): CanonicalScanResultViewModel {
  const { scan, profile, plan } = args;
  const canonical = canonicalizeScanStatus(scan.status);
  const usedFallback =
    scan.usedFallback === true || scan.resultSource === "fallback";
  const processingStatus = scan.aiProcessing?.status ?? null;
  const resultSource = scan.resultSource ?? (usedFallback ? "fallback" : null);
  const bf = finite(scan.estimate?.bodyFatPercent);
  const weightKg =
    finite(scan.input?.currentWeightKg) ??
    finite(profile?.weight_kg) ??
    finite(profile?.weightKg);
  const heightCm =
    finite(scan.input?.heightCm) ??
    finite(profile?.height_cm) ??
    finite(profile?.heightCm);
  const bmi =
    weightKg != null && heightCm != null && heightCm > 0
      ? weightKg / Math.pow(heightCm / 100, 2)
      : null;
  const fatMassKg =
    weightKg != null && bf != null ? weightKg * (bf / 100) : null;
  const leanMassKg =
    weightKg != null && fatMassKg != null ? weightKg - fatMassKg : null;
  const hasNutrition =
    Boolean(scan.nutritionPlan) &&
    finite(scan.nutritionPlan?.caloriesPerDay) != null;
  const isComplete = canonical === "complete";
  const isValidResult =
    isSuccessfulPersistedScan(scan) && bf != null && Boolean(scan.estimate);
  const isFailedOrFallback =
    canonical === "error" || usedFallback || (isComplete && !isValidResult);

  const goalWeightKg =
    finite(scan.input?.goalWeightKg) ??
    finite((profile as any)?.goal_weight_kg);
  const metrics = (scan.metrics ?? {}) as Record<string, unknown>;
  const estimate = (scan.estimate ?? {}) as any;
  const visualObservations =
    estimate.visualObservations &&
    typeof estimate.visualObservations === "object"
      ? estimate.visualObservations
      : {};
  const observationSource = Array.isArray(estimate.keyObservations)
    ? estimate.keyObservations
    : [];
  const safeText = (value: unknown) => {
    if (typeof value !== "string" || !value.trim()) return null;
    const text = value.trim();
    return /\b(diagnos(?:is|ed)|injur(?:y|ed)|tear|disease|disorder|syndrome|condition|scoliosis|kyphosis|lordosis|inflammation|hernia|surgery|tumou?r|lesion|fracture|arthritis|pain|visceral|subcutaneous|internal\s+(?:fat|tissue|organ))\b/i.test(
      text
    )
      ? null
      : text;
  };
  const safeObservation = (value: unknown) => {
    const text = safeText(value);
    if (!text) return null;
    if (
      /\d+(?:\.\d+)?\s*(?:%|percent\b|kg\b|kilograms?\b|lb\b|lbs\b|pounds?\b)/i.test(
        text
      )
    ) {
      return null;
    }
    return text;
  };
  const observations = [
    [
      "Muscular development",
      metrics.muscularDevelopment ?? visualObservations.muscularDevelopment,
    ],
    [
      "Upper-body development",
      metrics.upperBodyDevelopment ?? visualObservations.upperBodyDevelopment,
    ],
    [
      "Lower-body development",
      metrics.lowerBodyDevelopment ?? visualObservations.lowerBodyDevelopment,
    ],
    [
      "Midsection definition",
      metrics.midsectionDefinition ?? visualObservations.midsectionDefinition,
    ],
    [
      "Posture observation",
      metrics.postureObservation ?? visualObservations.postureObservation,
    ],
    [
      "Visible left/right balance",
      metrics.balanceObservation ?? visualObservations.balanceObservation,
    ],
    [
      "Strongest areas",
      metrics.strongestAreas ?? visualObservations.strongestAreas,
    ],
    [
      "Priority improvement areas",
      metrics.priorityAreas ?? visualObservations.priorityAreas,
    ],
  ]
    .map(([label, value]) => ({
      label: String(label),
      value: safeObservation(value),
    }))
    .filter(
      (item): item is { label: string; value: string } => item.value != null
    );
  if (!observations.length) {
    observationSource.slice(0, 4).forEach((value: unknown, index: number) => {
      const safe = safeObservation(value);
      if (safe)
        observations.push({
          label: `Visual observation ${index + 1}`,
          value: safe,
        });
    });
  }
  const regions = [
    [
      "Shoulders / chest",
      metrics.shouldersChest ?? visualObservations.shouldersChest,
    ],
    ["Arms", metrics.arms ?? visualObservations.arms],
    ["Torso / core", metrics.torsoCore ?? visualObservations.torsoCore],
    ["Hips", metrics.hips ?? visualObservations.hips],
    ["Legs", metrics.legs ?? visualObservations.legs],
  ]
    .map(([label, value]) => ({
      label: String(label),
      value: safeObservation(value),
    }))
    .filter(
      (item): item is { label: string; value: string } => item.value != null
    );
  const goalProgressText = (() => {
    if (weightKg == null || goalWeightKg == null)
      return "Add a goal to track progress";
    const delta = Math.abs(weightKg - goalWeightKg);
    return `${delta.toFixed(1)} kg from goal weight`;
  })();

  const prefsRaw = profile?.programPreferences as any;
  const hasPrefs = Boolean(prefsRaw && typeof prefsRaw === "object");
  const prefs = hasPrefs ? normalizeProgramPreferences(prefsRaw) : null;
  const scanWorkout = scan.workoutPlan;
  const firstWeek = scanWorkout?.weeks?.[0];
  const scanDays = Array.isArray(firstWeek?.days) ? firstWeek.days : [];
  const planDays =
    (scanDays.length > 0 ? scanDays.length : null) ??
    finite(plan?.days) ??
    prefs?.daysPerWeek ??
    null;
  const planFocus =
    (typeof scanWorkout?.summary === "string" && scanWorkout.summary.trim()) ||
    plan?.split ||
    (prefs ? prefs.focus.replace(/_/g, " ") : "Plan setup needed");
  const planAvailable = Boolean(
    scanDays.length > 0 ||
      (plan &&
        planDays &&
        Array.isArray(plan.sessions) &&
        plan.sessions.length > 0)
  );
  const detailLines = scanDays.length
    ? scanDays.slice(0, 4).map((day) => `${day.day}: ${day.focus}`)
    : (plan?.sessions?.slice(0, 3).map((session) => {
        const focuses = session.blocks
          ?.map((block) => block.focus || block.title)
          .filter(Boolean)
          .slice(0, 2)
          .join(" + ");
        return `${session.day}: ${focuses || "training"}`;
      }) ?? []);
  const progressionRules = Array.isArray(scanWorkout?.progressionRules)
    ? scanWorkout.progressionRules
        .filter((rule): rule is string =>
          Boolean(typeof rule === "string" && rule.trim())
        )
        .slice(0, 4)
    : [];
  const exercisePriorities = Array.from(
    new Set(
      scanDays.flatMap((day) =>
        Array.isArray(day.exercises)
          ? day.exercises
              .map((exercise) => exercise.name?.trim())
              .filter((name): name is string => Boolean(name))
          : []
      )
    )
  ).slice(0, 5);

  return {
    isValidResult,
    isFailedOrFallback,
    sourceLabel: usedFallback
      ? "Fallback/invalid"
      : resultSource === "demo"
        ? "Demo only"
        : canonical === "error"
          ? "Failed"
          : isValidResult
            ? "AI analysis"
            : canonical === "complete"
              ? "Fallback/invalid"
              : "Processing",
    failureTitle: "We could not complete this scan",
    failureMessage:
      "No estimate was created for this scan. Please retry processing or re-upload the scan photos.",
    status: canonical,
    primary: {
      bodyFatPercent: isValidResult ? round(bf, 1) : null,
      weightKg: isValidResult ? round(weightKg, 1) : weightKg,
      bmi: isValidResult ? round(bmi, 1) : null,
      leanMassKg: isValidResult ? round(leanMassKg, 1) : null,
      fatMassKg: isValidResult ? round(fatMassKg, 1) : null,
      goalProgressText,
    },
    nutrition: {
      available: isValidResult && hasNutrition,
      calories: isValidResult
        ? round(finite(scan.nutritionPlan?.caloriesPerDay))
        : null,
      proteinGrams: isValidResult
        ? round(finite(scan.nutritionPlan?.proteinGrams))
        : null,
      carbsGrams: isValidResult
        ? round(finite(scan.nutritionPlan?.carbsGrams))
        : null,
      fatsGrams: isValidResult
        ? round(finite(scan.nutritionPlan?.fatsGrams))
        : null,
      fiberGrams: isValidResult
        ? round(finite((scan.nutritionPlan as any)?.fiberGrams))
        : null,
      trainingDayCalories: isValidResult
        ? round(finite(scan.nutritionPlan?.trainingDay?.calories))
        : null,
      restDayCalories: isValidResult
        ? round(finite(scan.nutritionPlan?.restDay?.calories))
        : null,
      adjustmentRule:
        isValidResult && scan.nutritionPlan?.adjustmentRules?.length
          ? scan.nutritionPlan.adjustmentRules[0]
          : null,
    },
    composition: {
      heightCm: isValidResult ? round(heightCm, 1) : null,
      age: isValidResult ? round(finite((profile as any)?.age)) : null,
      profileCategory: isValidResult ? safeText((profile as any)?.sex) : null,
      goalWeightKg: isValidResult ? round(goalWeightKg, 1) : null,
      maintenanceCalories: isValidResult
        ? round(finite((scan.nutritionPlan as any)?.maintenanceCalories))
        : null,
      confidence: isValidResult ? safeText(estimate.confidence) : null,
      estimateRange: isValidResult ? safeText(estimate.bodyFatRange) : null,
      scanQuality: isValidResult ? safeText(estimate.scanQuality) : null,
    },
    observations: isValidResult ? observations : [],
    regions: isValidResult ? regions : [],
    plan: {
      available: isValidResult && planAvailable,
      daysPerWeek: planAvailable ? planDays : null,
      focus: planFocus,
      summary: planAvailable
        ? `${planDays} days/week · ${planFocus}`
        : "Complete plan setup to receive a personalized training plan.",
      setupNeeded: !planAvailable,
      detailLines,
      progressionRules,
      exercisePriorities,
    },
    diagnostics: {
      provider: scan.aiProcessing?.provider ?? null,
      processingStatus,
      errorCode: scan.errorReason ?? scan.aiProcessing?.errorCode ?? null,
      resultSource,
      usedFallback,
      charged: scan.charged ?? null,
      refunded: Boolean(scan.refundedAt || scan.creditStatus === "refunded"),
    },
  };
}

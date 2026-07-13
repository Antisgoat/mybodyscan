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
    goalProgressText: string;
  };
  nutrition: {
    available: boolean;
    calories: number | null;
    proteinGrams: number | null;
    carbsGrams: number | null;
    fatsGrams: number | null;
  };
  plan: {
    available: boolean;
    daysPerWeek: number | null;
    focus: string;
    summary: string;
    setupNeeded: boolean;
    detailLines: string[];
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

function finite(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round(value: number | null, digits = 0): number | null {
  if (value == null) return null;
  const f = 10 ** digits;
  return Math.round(value * f) / f;
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
    finite(scan.estimate?.bmi) ??
    (weightKg && heightCm ? weightKg / Math.pow(heightCm / 100, 2) : null);
  const leanMassKg =
    finite(scan.estimate?.leanMassKg) ??
    finite(scan.metrics?.leanMassKg) ??
    (weightKg != null && bf != null ? weightKg * (1 - bf / 100) : null);
  const hasNutrition =
    Boolean(scan.nutritionPlan) &&
    finite(scan.nutritionPlan?.caloriesPerDay) != null;
  const isComplete = canonical === "complete";
  const isValidResult =
    isSuccessfulPersistedScan(scan) &&
    bf != null &&
    Boolean(scan.estimate) &&
    hasNutrition;
  const isFailedOrFallback =
    canonical === "error" || usedFallback || (isComplete && !isValidResult);

  const goalWeightKg =
    finite(scan.input?.goalWeightKg) ??
    finite((profile as any)?.goal_weight_kg);
  const goalProgressText = (() => {
    if (weightKg == null || goalWeightKg == null)
      return "Add a goal to track progress";
    const delta = Math.abs(weightKg - goalWeightKg);
    return `${delta.toFixed(1)} kg from goal weight`;
  })();

  const prefsRaw = profile?.programPreferences as any;
  const hasPrefs = Boolean(prefsRaw && typeof prefsRaw === "object");
  const prefs = hasPrefs ? normalizeProgramPreferences(prefsRaw) : null;
  const planDays = finite(plan?.days) ?? prefs?.daysPerWeek ?? null;
  const planFocus =
    plan?.split ||
    (prefs ? prefs.focus.replaceAll("_", " ") : "Plan setup needed");
  const planAvailable = Boolean(
    plan && planDays && Array.isArray(plan.sessions) && plan.sessions.length > 0
  );
  const detailLines =
    plan?.sessions?.slice(0, 3).map((session) => {
      const focuses = session.blocks
        ?.map((block) => block.focus || block.title)
        .filter(Boolean)
        .slice(0, 2)
        .join(" + ");
      return `${session.day}: ${focuses || "training"}`;
    }) ?? [];

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
    },
    plan: {
      available: isValidResult && planAvailable,
      daysPerWeek: planAvailable ? planDays : null,
      focus: planFocus,
      summary: planAvailable
        ? `${planDays} days/week · ${planFocus}`
        : "Complete plan setup to receive a personalized training plan.",
      setupNeeded: !planAvailable,
      detailLines,
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

import {
  cmToIn,
  kgToLb,
  lbToKg,
  formatBmi,
  formatWeight,
  type DisplayUnits,
} from "@/lib/units";
import type { NormalizedScanMetrics } from "@/lib/scans";

export interface ScanMetricSummary {
  bodyFatPercent: number | null;
  bodyFatText: string;
  weightLb: number | null;
  weightText: string;
  bmi: number | null;
  bmiText: string;
}

function roundToTenths(value: number): number {
  return Math.round(value * 10) / 10;
}

export function summarizeScanMetrics(
  metrics: NormalizedScanMetrics | null,
  units: DisplayUnits = "us"
): ScanMetricSummary {
  const bodyFatPercent = metrics?.bodyFatPercent ?? null;
  const bodyFatText =
    bodyFatPercent != null ? `${bodyFatPercent.toFixed(1)}%` : "—";

  // Normalize legacy/misalabeled weights:
  // - Canonical storage is kg.
  // - If we have both `weightKg` and `weightLb` but they are numerically ~equal,
  //   treat `weightLb` as a mis-stored kg value and ignore it.
  const weightKg =
    typeof metrics?.weightKg === "number" && Number.isFinite(metrics.weightKg)
      ? metrics.weightKg
      : null;
  let weightLb =
    typeof metrics?.weightLb === "number" && Number.isFinite(metrics.weightLb)
      ? metrics.weightLb
      : null;
  if (weightKg != null && weightLb != null && Math.abs(weightLb - weightKg) < 0.75) {
    weightLb = null;
  }

  const normalizedKg =
    weightKg != null
      ? weightKg
      : weightLb != null
        ? lbToKg(weightLb)
        : null;

  const preferredUnit = units === "metric" ? "kg" : "lb";
  const formatted = formatWeight({ kg: normalizedKg, preferredUnit, digits: 1 });
  const weightText =
    formatted.value != null ? `${formatted.value.toFixed(1)} ${formatted.unitLabel}` : "—";

  // Preserve weightLb for callers that use it (best-effort).
  if (weightLb == null && normalizedKg != null) {
    const pounds = kgToLb(normalizedKg);
    weightLb = Number.isFinite(pounds) ? roundToTenths(pounds) : null;
  }

  const bmi = metrics?.bmi ?? null;
  const bmiText = bmi != null ? formatBmi(bmi, 1) : "—";

  return {
    bodyFatPercent,
    bodyFatText,
    weightLb,
    weightText,
    bmi,
    bmiText,
  };
}

export function formatCentimetersAsInches(
  cm?: number | null,
  digits = 1
): string {
  if (cm == null) return "—";
  const inches = cmToIn(cm);
  if (!Number.isFinite(inches)) return "—";
  return `${inches.toFixed(digits)} in`;
}

export function formatInches(value?: number | null, digits = 1): string {
  if (value == null) return "—";
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)} in`;
}

export function formatPounds(value?: number | null, digits = 1): string {
  if (value == null) return "—";
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)} lb`;
}

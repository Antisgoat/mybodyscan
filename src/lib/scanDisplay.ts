import { cmToIn, kgToLb, formatBmi } from "@app/lib/units.ts";
import type { NormalizedScanMetrics } from "@app/lib/scans.ts";

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

export function summarizeScanMetrics(metrics: NormalizedScanMetrics | null): ScanMetricSummary {
  const bodyFatPercent = metrics?.bodyFatPercent ?? null;
  const bodyFatText = bodyFatPercent != null ? `${bodyFatPercent.toFixed(1)}%` : "—";

  let weightLb = metrics?.weightLb ?? null;
  if (weightLb == null && metrics?.weightKg != null) {
    const pounds = kgToLb(metrics.weightKg);
    weightLb = Number.isFinite(pounds) ? roundToTenths(pounds) : null;
  }
  const weightText = weightLb != null ? `${weightLb.toFixed(1)} lb` : "—";

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

export function formatCentimetersAsInches(cm?: number | null, digits = 1): string {
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

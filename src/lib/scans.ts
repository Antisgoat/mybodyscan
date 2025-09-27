import { kgToLb } from "@/lib/units";

export interface NormalizedScanMetrics {
  bodyFatPercent: number | null;
  bmi: number | null;
  weightKg: number | null;
  weightLb: number | null;
  method: string | null;
  confidence: number | null;
}

function firstNumber(...candidates: unknown[]): number | null {
  for (const value of candidates) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

export function extractScanMetrics(scan: any): NormalizedScanMetrics {
  const metrics = scan?.metrics ?? {};
  const result = scan?.result ?? {};
  const results = scan?.results ?? result;
  const measurements = scan?.measurements ?? {};
  const fallback = scan ?? {};

  const bodyFatPercent = firstNumber(
    metrics.bf_percent,
    metrics.bodyFatPct,
    metrics.bfPct,
    metrics.body_fat,
    results.bf_percent,
    results.bodyFatPct,
    fallback.bfPct,
    fallback.bodyFatPercentage,
    fallback.body_fat,
    fallback.bodyfat,
    measurements.bodyFatPct
  );

  const bmi = firstNumber(
    metrics.bmi,
    metrics.body_mass_index,
    results.bmi,
    fallback.bmi,
    fallback.bmiValue,
    measurements.bmi
  );

  const weightKg = firstNumber(
    metrics.weight_kg,
    metrics.weightKg,
    results.weight_kg,
    results.weightKg,
    fallback.weightKg,
    fallback.weight_kg,
    measurements.weightKg,
    measurements.weight_kg
  );

  const weightLbDirect = firstNumber(
    metrics.weight_lb,
    metrics.weightLb,
    metrics.weight,
    results.weight_lb,
    results.weightLb,
    fallback.weight_lbs,
    fallback.weightLb,
    fallback.weight,
    measurements.weightLb,
    measurements.weight_lbs
  );

  const weightLb = weightLbDirect ?? (weightKg != null ? kgToLb(weightKg) : null);

  const method = typeof metrics.method === "string"
    ? metrics.method
    : typeof fallback.method === "string"
      ? fallback.method
      : typeof results.method === "string"
        ? results.method
        : null;

  const confidence = firstNumber(
    metrics.confidence,
    fallback.confidence,
    results.confidence
  );

  return {
    bodyFatPercent,
    bmi,
    weightKg,
    weightLb,
    method,
    confidence,
  };
}

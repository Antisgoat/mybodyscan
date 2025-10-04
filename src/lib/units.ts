export type DisplayUnits = "us" | "metric";

export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

export function cmToIn(cm: number): number {
  return cm / CM_PER_IN;
}

export function inToFtIn(totalInches: number): { ft: number; inches: number } {
  const ft = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches - ft * 12);
  return { ft, inches };
}

export function ftInToCm(ft: number, inches: number): number {
  return (ft * 12 + inches) * CM_PER_IN;
}

// Formatting helpers for UI (US)
export function formatWeightFromKg(kg?: number, digits = 0): string {
  if (kg == null) return "—";
  return `${kgToLb(kg).toFixed(digits)} lb`;
}

export function formatHeightFromCm(cm?: number): string {
  if (cm == null) return "—";
  const { ft, inches } = inToFtIn(cmToIn(cm));
  return `${ft}′ ${inches}″`;
}

export function formatBmi(bmi?: number, digits = 1): string {
  if (bmi == null) return "—";
  // BMI is unitless; just format
  return bmi.toFixed(digits);
}

// Convenience wrappers per app decisions
export function toMetric(heightIn?: number | null, weightLb?: number | null): { heightCm?: number; weightKg?: number } {
  const heightCm = typeof heightIn === "number" && Number.isFinite(heightIn) ? heightIn * CM_PER_IN : undefined;
  const weightKg = typeof weightLb === "number" && Number.isFinite(weightLb) ? weightLb * KG_PER_LB : undefined;
  return { heightCm, weightKg };
}

export function toUS(heightCm?: number | null, weightKg?: number | null): { heightIn?: number; weightLb?: number } {
  const heightIn = typeof heightCm === "number" && Number.isFinite(heightCm) ? heightCm / CM_PER_IN : undefined;
  const weightLb = typeof weightKg === "number" && Number.isFinite(weightKg) ? weightKg / KG_PER_LB : undefined;
  return { heightIn, weightLb };
}

export function formatWeight(kg?: number | null, digits = 0): string {
  if (kg == null) return "—";
  return `${kgToLb(kg).toFixed(digits)} lb`;
}

export function formatHeight(cm?: number | null): string {
  if (cm == null) return "—";
  const { ft, inches } = inToFtIn(cmToIn(cm));
  return `${ft}′ ${inches}″`;
}

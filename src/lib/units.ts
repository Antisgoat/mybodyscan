/**
 * Pipeline map — Measurement helpers:
 * - Provides kg↔lb and cm↔ft/in conversions so UI can display user preferences while Firestore stays metric.
 * - Formatting helpers back Scan, Settings, and History views when showing BMI/weight results.
 */
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
export function formatWeightFromKg(
  kg?: number,
  digits = 0,
  units: DisplayUnits = "us"
): string {
  if (kg == null) return "—";
  const value = units === "metric" ? kg : kgToLb(kg);
  const label = units === "metric" ? "kg" : "lb";
  return `${value.toFixed(digits)} ${label}`;
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

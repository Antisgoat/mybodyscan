/**
 * Pipeline map — Measurement helpers:
 * - Provides kg↔lb and cm↔ft/in conversions so UI can display user preferences while Firestore stays metric.
 * - Formatting helpers back Scan, Settings, and History views when showing BMI/weight results.
 */
export type DisplayUnits = "us" | "metric";
export type WeightUnit = "lb" | "kg";

export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

/** Canonical converters (explicit names) */
export function weightKgToLb(kg: number): number {
  return kgToLb(kg);
}

export function weightLbToKg(lb: number): number {
  return lbToKg(lb);
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

export function round0(n: number): number {
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

export function round1(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : NaN;
}

/**
 * Single source of truth for formatting stored kg into a preferred display unit.
 * Canonical storage is kilograms.
 */
export function formatWeight(args: {
  kg: number | null | undefined;
  preferredUnit: WeightUnit;
  digits?: number;
}): { value: number | null; unitLabel: WeightUnit } {
  const kg = args.kg;
  const digits = typeof args.digits === "number" ? args.digits : 1;
  if (kg == null || !Number.isFinite(kg)) {
    return { value: null, unitLabel: args.preferredUnit };
  }
  const raw = args.preferredUnit === "kg" ? kg : kgToLb(kg);
  const factor = Math.pow(10, digits);
  const rounded = Number.isFinite(raw) ? Math.round(raw * factor) / factor : NaN;
  return {
    value: Number.isFinite(rounded) ? rounded : null,
    unitLabel: args.preferredUnit,
  };
}

// Formatting helpers for UI (US)
export function formatWeightFromKg(
  kg?: number,
  digits = 0,
  units: DisplayUnits = "us"
): string {
  if (kg == null) return "—";
  const preferredUnit: WeightUnit = units === "metric" ? "kg" : "lb";
  const formatted = formatWeight({ kg, preferredUnit, digits });
  return formatted.value != null ? `${formatted.value.toFixed(digits)} ${formatted.unitLabel}` : "—";
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

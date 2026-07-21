export interface ScanInput {
  currentWeightKg: number;
  goalWeightKg: number;
  heightCm?: number;
}

/** Firestore rejects undefined values, so optional inputs must be omitted. */
export function buildScanInput(
  currentWeightKg: number,
  goalWeightKg: number,
  heightCm?: number
): ScanInput {
  return {
    currentWeightKg,
    goalWeightKg,
    ...(Number.isFinite(heightCm) && Number(heightCm) > 0
      ? { heightCm: Number(heightCm) }
      : {}),
  };
}

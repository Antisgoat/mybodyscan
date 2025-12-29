import { lbToKg, type WeightUnit } from "@/lib/units";

export type WeightFieldsInput = {
  weightKg?: unknown;
  weight_kg?: unknown;
  weight?: unknown;
  unit?: unknown;
};

export type NormalizedWeightFields = {
  /** Canonical storage */
  weightKg: number | null;
  /** Preferred display unit */
  unit: WeightUnit;
  /** Patch to write back (merge), or null if none needed */
  patch: { weightKg: number; weight_kg: number; unit: WeightUnit } | null;
};

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asWeightUnit(value: unknown): WeightUnit | null {
  if (value === "lb" || value === "kg") return value;
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if (lower === "lb" || lower === "lbs") return "lb";
    if (lower === "kg" || lower === "kgs") return "kg";
  }
  return null;
}

/**
 * Backward-compatible normalization for user profile weight fields.
 *
 * Rules:
 * - Canonical storage is `weightKg` (number, kg).
 * - Preferred display unit is `unit` ("lb"|"kg"), defaulting to "lb" when missing.
 * - Legacy support:
 *   - `weight_kg` treated as kg.
 *   - `weight` treated as unit if `unit` exists; else heuristic:
 *     - if weight > 120 => treat as lb
 *     - else treat as kg
 * - When normalization is possible, return a `patch` to write back (merge) so future reads are stable.
 */
export function normalizeWeightFields(
  input: WeightFieldsInput
): NormalizedWeightFields {
  const weightKgDirect = asFiniteNumber(input.weightKg);
  const weightKgLegacy = asFiniteNumber(input.weight_kg);
  const weightAmbiguous = asFiniteNumber(input.weight);

  const unit = asWeightUnit(input.unit) ?? "lb";

  // 1) Trust explicit kg fields first.
  const canonicalKg =
    weightKgDirect != null
      ? weightKgDirect
      : weightKgLegacy != null
        ? weightKgLegacy
        : null;

  // 2) Fall back to ambiguous `weight`.
  const inferredKg =
    canonicalKg != null
      ? canonicalKg
      : weightAmbiguous != null
        ? (() => {
            const providedUnit = asWeightUnit(input.unit);
            if (providedUnit === "lb") return lbToKg(weightAmbiguous);
            if (providedUnit === "kg") return weightAmbiguous;
            // No unit: heuristic
            if (weightAmbiguous > 120) return lbToKg(weightAmbiguous);
            return weightAmbiguous;
          })()
        : null;

  const weightKg = inferredKg != null && Number.isFinite(inferredKg) ? inferredKg : null;

  const shouldWrite =
    weightKg != null &&
    (weightKgDirect == null ||
      weightKgLegacy == null ||
      asWeightUnit(input.unit) == null);

  const patch =
    shouldWrite && weightKg != null
      ? {
          weightKg: Number(weightKg.toFixed(4)),
          weight_kg: Number(weightKg.toFixed(4)),
          unit,
        }
      : null;

  return { weightKg, unit, patch };
}


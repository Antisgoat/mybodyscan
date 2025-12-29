import { auth, db } from "@/lib/firebase";
import { doc } from "firebase/firestore";
import { kgToLb, lbToKg } from "@/lib/units";

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

  // Prefer explicit pound fields. Avoid ambiguous `weight` fields unless we have
  // no better option; some legacy scan docs stored kg into `weight` but UI treated it as lb.
  const weightLbDirect = firstNumber(
    metrics.weight_lb,
    metrics.weightLb,
    results.weight_lb,
    results.weightLb,
    fallback.weight_lbs,
    fallback.weightLb,
    measurements.weightLb,
    measurements.weight_lbs
  );

  // Ambiguous weight fields: interpret as kg by default (canonical), unless clearly lb.
  const weightAmbiguous = firstNumber(
    metrics.weight,
    results.weight,
    fallback.weight
  );

  const inferred = (() => {
    // 1) If we have kg, trust it and compute lb.
    if (weightKg != null) {
      const lb = weightLbDirect != null ? weightLbDirect : kgToLb(weightKg);
      // If direct lb value equals kg value, it's almost certainly mis-stored kg -> ignore.
      const safeLb =
        weightLbDirect != null && Math.abs(weightLbDirect - weightKg) < 0.75
          ? kgToLb(weightKg)
          : lb;
      return { weightKg, weightLb: safeLb };
    }

    // 2) If we have explicit lb, compute kg.
    if (weightLbDirect != null) {
      return { weightKg: lbToKg(weightLbDirect), weightLb: weightLbDirect };
    }

    // 3) Fall back to ambiguous `weight`:
    // - If it looks like a typical lb value (>=140), treat as lb.
    // - Otherwise treat as kg (canonical).
    if (weightAmbiguous != null) {
      if (weightAmbiguous >= 140) {
        return {
          weightKg: lbToKg(weightAmbiguous),
          weightLb: weightAmbiguous,
        };
      }
      return {
        weightKg: weightAmbiguous,
        weightLb: kgToLb(weightAmbiguous),
      };
    }

    return { weightKg: null, weightLb: null };
  })();

  const method =
    typeof metrics.method === "string"
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
    weightKg: inferred.weightKg,
    weightLb: inferred.weightLb,
    method,
    confidence,
  };
}

export type ScanStatus =
  | "pending"
  | "processing"
  | "complete"
  | "error"
  | "unknown";

export type ScanDoc = {
  id?: string;
  createdAt?: any;
  completedAt?: any;
  status?: ScanStatus;
  error?: string | null;
  results?: any;
  notes?: string;
};

export function scanDocRef(scanId: string) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("No current user");
  return doc(db, "users", uid, "scans", scanId);
}

export type ScanMetrics = {
  bodyFatPct: number | null; // %
  weightLb: number | null; // lb
  bmi: number | null;
};

export function normalizeScanMetrics(
  d: ScanDoc | null | undefined
): ScanMetrics {
  if (!d) return { bodyFatPct: null, weightLb: null, bmi: null };
  const r = d.results || {};

  const bf =
    num(r.bodyFatPct) ??
    num(r.bodyFatPercent) ??
    num(r.bodyFatEstimate) ??
    num(r.bfPercent) ??
    num(r.bf);

  const weightValue = num(r.weight);
  const weightKgValue = num(r.weightKg);
  const weightUnit = (r.weightUnit || "").toLowerCase();
  const heightMValue = num(r.heightM);

  const weightLb =
    num(r.weightLb) ??
    (weightValue != null && weightUnit === "lb" ? weightValue : null) ??
    (weightKgValue != null ? kgToLb(weightKgValue) : null) ??
    (weightValue != null && weightUnit === "kg" ? kgToLb(weightValue) : null);

  const bmi =
    num(r.bmi) ??
    (weightKgValue != null && heightMValue != null
      ? round2(weightKgValue / (heightMValue * heightMValue))
      : null);

  return {
    bodyFatPct: bf != null ? round1(bf) : null,
    weightLb: weightLb != null ? round1(weightLb) : null,
    bmi: bmi != null ? round1(bmi) : null,
  };
}

export function statusOf(d: ScanDoc | null | undefined): ScanStatus {
  const s = (d?.status || "").toLowerCase();
  if (s === "queued" || s === "pending") return "pending";
  if (s === "processing" || s === "in_progress") return "processing";
  if (s === "completed" || s === "complete" || s === "done") return "complete";
  if (s === "error" || s === "failed" || s === "failure") return "error";
  return "unknown";
}

function num(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

import { auth, db } from "@/lib/firebase";
import { doc } from "firebase/firestore";
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

export type ScanStatus = "queued" | "processing" | "completed" | "error" | "unknown";

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

export function normalizeScanMetrics(d: ScanDoc | null | undefined): ScanMetrics {
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
  if (s === "queued" || s === "processing" || s === "completed" || s === "error") return s as ScanStatus;
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

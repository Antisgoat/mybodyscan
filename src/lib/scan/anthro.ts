const DEG_TO_LOG = Math.log(10);

function log10(value: number) {
  return Math.log(value) / DEG_TO_LOG;
}

function clamp(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

export function usNavyMale(waistCm: number, neckCm: number, heightCm: number): number {
  if (!waistCm || !neckCm || !heightCm || waistCm <= neckCm) return NaN;
  const bf =
    86.010 * log10(waistCm - neckCm) -
    70.041 * log10(heightCm) +
    36.76;
  return clamp(Number(bf.toFixed(1)), 3, 65);
}

export function usNavyFemale(waistCm: number, neckCm: number, hipCm: number, heightCm: number): number {
  if (!waistCm || !neckCm || !hipCm || !heightCm || waistCm + hipCm <= neckCm) return NaN;
  const bf =
    163.205 * log10(waistCm + hipCm - neckCm) -
    97.684 * log10(heightCm) -
    78.387;
  return clamp(Number(bf.toFixed(1)), 8, 65);
}

export function bmiFromKgCm(weightKg: number, heightCm: number): number {
  if (!weightKg || !heightCm) return NaN;
  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  return Number(bmi.toFixed(1));
}

export function reconcileBodyFat(primary: number, secondary: number): number {
  const values = [primary, secondary].filter((v) => Number.isFinite(v));
  if (!values.length) return NaN;
  const avg = values.reduce((acc, value) => acc + value, 0) / values.length;
  return clamp(Number(avg.toFixed(1)), 3, 65);
}

export interface BodyFatInput {
  sex?: "male" | "female";
  height_cm: number;
  neck_cm?: number;
  waist_cm?: number;
  hip_cm?: number;
  weight_kg?: number;
}

export interface BodyFatResult {
  bfPercent: number | null;
  method: "circumference" | "bmi" | "unknown";
  confidence: number;
  sources: string[];
  notes: string[];
}

function alternateEstimator(input: BodyFatInput): number {
  const { waist_cm, hip_cm, neck_cm, height_cm, sex } = input;
  if (!waist_cm || !height_cm) return NaN;
  const waistToHeight = waist_cm / height_cm;
  const hipAdj = hip_cm ? hip_cm / height_cm : waistToHeight;
  const neckAdj = neck_cm ? neck_cm / height_cm : waistToHeight * 0.6;
  let base = 100 * waistToHeight * 0.9 + 100 * hipAdj * 0.15 - 100 * neckAdj * 0.2;
  base += sex === "female" ? 5.5 : -2.2;
  return clamp(Number(base.toFixed(1)), 5, 60);
}

export function computeBodyFat(input: BodyFatInput): BodyFatResult {
  const notes: string[] = [];
  const sources: string[] = [];
  const { sex, height_cm, neck_cm, waist_cm, hip_cm, weight_kg } = input;
  if (!height_cm) {
    return { bfPercent: null, method: "unknown", confidence: 0, sources, notes: ["missing_height"] };
  }

  let bfFromCircumference: number | undefined;
  let bfSecondary: number | undefined;

  if (waist_cm && height_cm) {
    if (sex === "female") {
      const navy = usNavyFemale(waist_cm, neck_cm ?? NaN, hip_cm ?? NaN, height_cm);
      if (Number.isFinite(navy)) {
        bfFromCircumference = navy;
        sources.push("us_navy_female");
      }
    } else {
      const navy = usNavyMale(waist_cm, neck_cm ?? NaN, height_cm);
      if (Number.isFinite(navy)) {
        bfFromCircumference = navy;
        sources.push("us_navy_male");
      }
    }
    const alt = alternateEstimator(input);
    if (Number.isFinite(alt)) {
      bfSecondary = alt;
      sources.push("waist_height_ratio");
    }
  }

  if (bfFromCircumference != null && Number.isFinite(bfFromCircumference)) {
    const reconciled = reconcileBodyFat(bfFromCircumference, bfSecondary ?? NaN);
    const hasSecondary = Number.isFinite(bfSecondary ?? NaN);
    const spread = hasSecondary ? Math.abs(bfFromCircumference - (bfSecondary as number)) : 0;
    const confidence = spread > 6 ? 0.65 : spread > 3 ? 0.78 : 0.88;
    if (spread > 6) notes.push("estimators_diverged");
    return {
      bfPercent: Number.isFinite(reconciled) ? reconciled : null,
      method: "circumference",
      confidence,
      sources,
      notes,
    };
  }

  const bmi = bmiFromKgCm(weight_kg ?? NaN, height_cm);
  if (Number.isFinite(bmi)) {
    sources.push("bmi");
    const bfEstimate = sex === "female" ? 1.2 * bmi + 0.23 * 30 - 5.4 : 1.2 * bmi + 0.23 * 30 - 16.2;
    notes.push("circumference_missing");
    return {
      bfPercent: clamp(Number(bfEstimate.toFixed(1)), 5, 60),
      method: "bmi",
      confidence: 0.45,
      sources,
      notes,
    };
  }

  notes.push("insufficient_data");
  return { bfPercent: null, method: "unknown", confidence: 0, sources, notes };
}

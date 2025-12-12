import type { PhotoFeatures } from "@/lib/vision/features";
import { bai, deurenberg, navyFemale, navyMale, wthr } from "./formulas";

export interface EstimateInput {
  sex: "male" | "female";
  age?: number;
  heightIn: number;
  weightLb?: number;
  photoFeatures?: PhotoFeatures | null;
  manualCircumferences?: {
    neckIn?: number;
    waistIn?: number;
    hipIn?: number;
  } | null;
}

export interface EstimateResult {
  bodyFatPct: number;
  bmi: number;
  usedWeight: number | null;
}

function clamp01(value: number | undefined | null): number {
  if (!Number.isFinite(value ?? NaN)) return 0;
  if ((value as number) < 0) return 0;
  if ((value as number) > 1) return 1;
  return value as number;
}

function sanitize(value?: number | null): number | undefined {
  if (!Number.isFinite(value ?? NaN)) return undefined;
  if (!value || value <= 0) return undefined;
  return value;
}

function toInches(
  value: number | undefined,
  scale: number | undefined
): number | undefined {
  if (!Number.isFinite(value ?? NaN) || !Number.isFinite(scale ?? NaN)) {
    return undefined;
  }
  if (!value || value <= 0 || !scale || scale <= 0) {
    return undefined;
  }
  return value * scale;
}

type MeasurementSource = "manual" | "photo" | null;

type Measurement = { value?: number; source: MeasurementSource };

function resolveMeasurement(manual?: number, photo?: number): Measurement {
  const manualValue = sanitize(manual);
  if (manualValue != null) {
    return { value: manualValue, source: "manual" };
  }
  const photoValue = sanitize(photo);
  if (photoValue != null) {
    return { value: photoValue, source: "photo" };
  }
  return { value: undefined, source: null };
}

function measurementConfidence(
  source: MeasurementSource,
  pose: number
): number {
  if (source === "manual") {
    return 1;
  }
  if (source === "photo") {
    return 0.4 + 0.6 * pose;
  }
  return 0;
}

function average(values: number[]): number {
  if (!values.length) return 0;
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function weightedMedian(
  entries: Array<{ value: number; weight: number }>
): number {
  const valid = entries
    .filter((entry) => Number.isFinite(entry.value) && entry.weight > 0)
    .sort((a, b) => a.value - b.value);
  if (!valid.length) {
    return NaN;
  }
  const totalWeight = valid.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) {
    return NaN;
  }
  let cumulative = 0;
  const target = totalWeight / 2;
  for (const entry of valid) {
    cumulative += entry.weight;
    if (cumulative >= target) {
      return entry.value;
    }
  }
  return valid[valid.length - 1]?.value ?? NaN;
}

export function estimateBodyComp(input: EstimateInput): EstimateResult {
  const { sex, age, heightIn, weightLb, photoFeatures, manualCircumferences } =
    input;
  const poseScore = clamp01(photoFeatures?.poseScore ?? 0);

  const averages = photoFeatures?.averages;
  const heightPixels = sanitize(averages?.heightPixels);
  const scale = heightPixels ? heightIn / heightPixels : undefined;

  const photoNeckIn = toInches(averages?.neckWidth, scale);
  const photoWaistIn = toInches(averages?.waistWidth, scale);
  const photoHipIn = toInches(averages?.hipWidth, scale);

  const neck = resolveMeasurement(
    manualCircumferences?.neckIn ?? undefined,
    photoNeckIn
  );
  const waist = resolveMeasurement(
    manualCircumferences?.waistIn ?? undefined,
    photoWaistIn
  );
  const hip = resolveMeasurement(
    manualCircumferences?.hipIn ?? undefined,
    photoHipIn
  );

  const circumferenceSources = [neck.source, waist.source, hip.source];
  const manualCount = circumferenceSources.filter(
    (source) => source === "manual"
  ).length;
  const photoCount = circumferenceSources.filter(
    (source) => source === "photo"
  ).length;
  const circumferencePresence = manualCount + photoCount;

  const navyEstimate =
    sex === "female"
      ? navyFemale({
          waistIn: waist.value,
          neckIn: neck.value,
          hipIn: hip.value,
          heightIn,
        })
      : navyMale({ waistIn: waist.value, neckIn: neck.value, heightIn });
  const navyConfidenceComponents =
    sex === "female" ? [waist, neck, hip] : [waist, neck];
  const navyWeight = average(
    navyConfidenceComponents.map((measurement) =>
      measurementConfidence(measurement.source, poseScore)
    )
  );

  const baiEstimate = bai({ hipIn: hip.value, heightIn });
  const baiWeight = measurementConfidence(hip.source, poseScore);

  const wthrEstimate = wthr({ waistIn: waist.value, heightIn, sex });
  const wthrWeight = measurementConfidence(waist.source, poseScore);

  const bmi = weightLb
    ? Number(((weightLb / (heightIn * heightIn)) * 703).toFixed(1))
    : NaN;
  const deurenbergEstimate = deurenberg({ weightLb, heightIn, age, sex });
  const weightConfidence = weightLb ? 0.6 : 0;
  const circumferenceBonus =
    circumferencePresence >= 2 ? 0.3 : circumferencePresence === 1 ? 0.15 : 0;
  const deurenbergWeight = weightConfidence + circumferenceBonus;

  const combined = weightedMedian([
    { value: navyEstimate, weight: navyWeight },
    { value: deurenbergEstimate, weight: deurenbergWeight },
    { value: baiEstimate, weight: baiWeight },
    { value: wthrEstimate, weight: wthrWeight },
  ]);

  const bodyFatPct = Number.isFinite(combined)
    ? Number((combined as number).toFixed(1))
    : NaN;

  return {
    bodyFatPct,
    bmi: Number.isFinite(bmi) ? bmi : NaN,
    usedWeight: weightLb ? Number(weightLb.toFixed(1)) : null,
  };
}

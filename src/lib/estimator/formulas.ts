const LOG10 = Math.log(10);

function log10(value: number): number {
  return Math.log(value) / LOG10;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function round(value: number): number {
  return Number(value.toFixed(1));
}

export function navyMale({
  waistIn,
  neckIn,
  heightIn,
}: {
  waistIn?: number;
  neckIn?: number;
  heightIn?: number;
}): number {
  if (!waistIn || !neckIn || !heightIn || waistIn <= neckIn) {
    return NaN;
  }
  const bf = 86.01 * log10(waistIn - neckIn) - 70.041 * log10(heightIn) + 36.76;
  return clamp(round(bf), 3, 65);
}

export function navyFemale({
  waistIn,
  neckIn,
  hipIn,
  heightIn,
}: {
  waistIn?: number;
  neckIn?: number;
  hipIn?: number;
  heightIn?: number;
}): number {
  if (!waistIn || !neckIn || !hipIn || !heightIn || waistIn + hipIn <= neckIn) {
    return NaN;
  }
  const bf =
    163.205 * log10(waistIn + hipIn - neckIn) -
    97.684 * log10(heightIn) -
    78.387;
  return clamp(round(bf), 5, 65);
}

export function deurenberg({
  weightLb,
  heightIn,
  age,
  sex,
}: {
  weightLb?: number;
  heightIn?: number;
  age?: number;
  sex: "male" | "female";
}): number {
  if (!weightLb || !heightIn || !age || !Number.isFinite(age)) {
    return NaN;
  }
  const bmi = (weightLb / (heightIn * heightIn)) * 703;
  if (!Number.isFinite(bmi) || bmi <= 0) {
    return NaN;
  }
  const sexFlag = sex === "male" ? 1 : 0;
  const bf = 1.2 * bmi + 0.23 * age - 10.8 * sexFlag - 5.4;
  return clamp(round(bf), 3, 65);
}

export function bai({
  hipIn,
  heightIn,
}: {
  hipIn?: number;
  heightIn?: number;
}): number {
  if (!hipIn || !heightIn) {
    return NaN;
  }
  const hipCm = hipIn * 2.54;
  const heightM = heightIn * 0.0254;
  if (heightM <= 0) {
    return NaN;
  }
  const bf = hipCm / Math.pow(heightM, 1.5) - 18;
  return clamp(round(bf), 3, 65);
}

export function wthr({
  waistIn,
  heightIn,
  sex,
}: {
  waistIn?: number;
  heightIn?: number;
  sex: "male" | "female";
}): number {
  if (!waistIn || !heightIn) {
    return NaN;
  }
  const ratio = waistIn / heightIn;
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return NaN;
  }
  const adjustment = sex === "female" ? 6 : 2.2;
  const bf = ratio * 100 * 1.1 + adjustment;
  return clamp(round(bf), 5, 60);
}

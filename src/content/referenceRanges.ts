export type Sex = "male" | "female";

export interface LabeledRange {
  band: string;
  label: string;
  min: number;
  max: number;
  color: string;
}

interface AgeBandDefinition {
  band: string;
  minAge: number;
  maxAge?: number;
  ranges: Omit<LabeledRange, "band">[];
}

const RANGE_COLORS = [
  "bg-emerald-500",
  "bg-green-500",
  "bg-lime-500",
  "bg-amber-500",
  "bg-orange-500",
];

const MALE_BANDS: AgeBandDefinition[] = [
  {
    band: "20-29",
    minAge: 20,
    maxAge: 29,
    ranges: [
      { label: "Athletic", min: 3, max: 11, color: RANGE_COLORS[0] },
      { label: "Lean", min: 11, max: 17, color: RANGE_COLORS[1] },
      { label: "Average", min: 17, max: 22, color: RANGE_COLORS[2] },
      { label: "Above Average", min: 22, max: 27, color: RANGE_COLORS[3] },
      { label: "High", min: 27, max: 40, color: RANGE_COLORS[4] },
    ],
  },
  {
    band: "30-39",
    minAge: 30,
    maxAge: 39,
    ranges: [
      { label: "Athletic", min: 4, max: 12, color: RANGE_COLORS[0] },
      { label: "Lean", min: 12, max: 18, color: RANGE_COLORS[1] },
      { label: "Average", min: 18, max: 23, color: RANGE_COLORS[2] },
      { label: "Above Average", min: 23, max: 28, color: RANGE_COLORS[3] },
      { label: "High", min: 28, max: 41, color: RANGE_COLORS[4] },
    ],
  },
  {
    band: "40-49",
    minAge: 40,
    maxAge: 49,
    ranges: [
      { label: "Athletic", min: 5, max: 13, color: RANGE_COLORS[0] },
      { label: "Lean", min: 13, max: 19, color: RANGE_COLORS[1] },
      { label: "Average", min: 19, max: 24, color: RANGE_COLORS[2] },
      { label: "Above Average", min: 24, max: 29, color: RANGE_COLORS[3] },
      { label: "High", min: 29, max: 42, color: RANGE_COLORS[4] },
    ],
  },
  {
    band: "50-59",
    minAge: 50,
    maxAge: 59,
    ranges: [
      { label: "Athletic", min: 6, max: 14, color: RANGE_COLORS[0] },
      { label: "Lean", min: 14, max: 20, color: RANGE_COLORS[1] },
      { label: "Average", min: 20, max: 25, color: RANGE_COLORS[2] },
      { label: "Above Average", min: 25, max: 30, color: RANGE_COLORS[3] },
      { label: "High", min: 30, max: 43, color: RANGE_COLORS[4] },
    ],
  },
  {
    band: "60+",
    minAge: 60,
    ranges: [
      { label: "Athletic", min: 7, max: 15, color: RANGE_COLORS[0] },
      { label: "Lean", min: 15, max: 21, color: RANGE_COLORS[1] },
      { label: "Average", min: 21, max: 26, color: RANGE_COLORS[2] },
      { label: "Above Average", min: 26, max: 31, color: RANGE_COLORS[3] },
      { label: "High", min: 31, max: 44, color: RANGE_COLORS[4] },
    ],
  },
];

const FEMALE_BANDS: AgeBandDefinition[] = [
  {
    band: "20-29",
    minAge: 20,
    maxAge: 29,
    ranges: [
      { label: "Athletic", min: 12, max: 22, color: RANGE_COLORS[0] },
      { label: "Lean", min: 22, max: 28, color: RANGE_COLORS[1] },
      { label: "Average", min: 28, max: 34, color: RANGE_COLORS[2] },
      { label: "Above Average", min: 34, max: 40, color: RANGE_COLORS[3] },
      { label: "High", min: 40, max: 52, color: RANGE_COLORS[4] },
    ],
  },
  {
    band: "30-39",
    minAge: 30,
    maxAge: 39,
    ranges: [
      { label: "Athletic", min: 13, max: 23, color: RANGE_COLORS[0] },
      { label: "Lean", min: 23, max: 29, color: RANGE_COLORS[1] },
      { label: "Average", min: 29, max: 35, color: RANGE_COLORS[2] },
      { label: "Above Average", min: 35, max: 41, color: RANGE_COLORS[3] },
      { label: "High", min: 41, max: 53, color: RANGE_COLORS[4] },
    ],
  },
  {
    band: "40-49",
    minAge: 40,
    maxAge: 49,
    ranges: [
      { label: "Athletic", min: 14, max: 24, color: RANGE_COLORS[0] },
      { label: "Lean", min: 24, max: 30, color: RANGE_COLORS[1] },
      { label: "Average", min: 30, max: 36, color: RANGE_COLORS[2] },
      { label: "Above Average", min: 36, max: 42, color: RANGE_COLORS[3] },
      { label: "High", min: 42, max: 54, color: RANGE_COLORS[4] },
    ],
  },
  {
    band: "50-59",
    minAge: 50,
    maxAge: 59,
    ranges: [
      { label: "Athletic", min: 15, max: 25, color: RANGE_COLORS[0] },
      { label: "Lean", min: 25, max: 31, color: RANGE_COLORS[1] },
      { label: "Average", min: 31, max: 37, color: RANGE_COLORS[2] },
      { label: "Above Average", min: 37, max: 43, color: RANGE_COLORS[3] },
      { label: "High", min: 43, max: 55, color: RANGE_COLORS[4] },
    ],
  },
  {
    band: "60+",
    minAge: 60,
    ranges: [
      { label: "Athletic", min: 16, max: 26, color: RANGE_COLORS[0] },
      { label: "Lean", min: 26, max: 32, color: RANGE_COLORS[1] },
      { label: "Average", min: 32, max: 38, color: RANGE_COLORS[2] },
      { label: "Above Average", min: 38, max: 44, color: RANGE_COLORS[3] },
      { label: "High", min: 44, max: 56, color: RANGE_COLORS[4] },
    ],
  },
];

const SEX_BANDS: Record<Sex, AgeBandDefinition[]> = {
  male: MALE_BANDS,
  female: FEMALE_BANDS,
};

function normalizeSex(sex: string | undefined): Sex {
  const value = (sex ?? "").toLowerCase();
  return value === "female" ? "female" : "male";
}

function getBandForAge(bands: AgeBandDefinition[], age: number): AgeBandDefinition {
  for (const band of bands) {
    if (age < band.minAge) continue;
    if (band.maxAge == null || age <= band.maxAge) {
      return band;
    }
  }
  return bands[bands.length - 1];
}

export function getSexAgeBands(sex: string, age: number): LabeledRange[] {
  if (!Number.isFinite(age)) {
    return [];
  }
  const normalized = normalizeSex(sex);
  const bands = SEX_BANDS[normalized];
  const band = getBandForAge(bands, age);
  return band.ranges.map((range) => ({
    band: band.band,
    label: range.label,
    min: range.min,
    max: range.max,
    color: range.color,
  }));
}

export function findRangeForValue(ranges: LabeledRange[], value: number): LabeledRange | null {
  if (!Number.isFinite(value)) return null;
  const lastIndex = ranges.length - 1;
  for (let index = 0; index < ranges.length; index += 1) {
    const range = ranges[index];
    if (value < range.min) continue;
    if (index === lastIndex) return range;
    if (value < ranges[index + 1].min) return range;
    if (value <= range.max) return range;
  }
  return null;
}

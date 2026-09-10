import type { ScanDocument } from "@/lib/api/scan";
import type { CanonicalScanResultViewModel } from "@/lib/scanResultViewModel";

export type BodyView = "front" | "side" | "back";
export type BodyRegionId = "upper" | "arms" | "core" | "hips" | "legs";

export type BodyRegionInsight = {
  id: BodyRegionId;
  label: string;
  value: string;
  score: number | null;
};

export type ParametricBodyProfile = {
  heightScale: number;
  shoulderScale: number;
  chestScale: number;
  waistScale: number;
  hipScale: number;
  armScale: number;
  legScale: number;
  depthScale: number;
  regions: BodyRegionInsight[];
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const finite = (value: unknown): number | null => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const score = (
  values: Record<string, unknown>,
  keys: string[]
): number | null => {
  for (const key of keys) {
    const value = finite(values[key]);
    if (value != null) return clamp(value, 1, 10);
  }
  return null;
};

const scoreLabel = (value: number | null) =>
  value == null ? "Scan insight" : `${value.toFixed(1)} / 10 development`;

/**
 * Creates conservative visual proportions from existing supported scan data.
 * This is an illustrative wellness model, not a photo-derived body mesh.
 */
export function buildParametricBodyProfile(
  vm: CanonicalScanResultViewModel,
  scan: ScanDocument
): ParametricBodyProfile {
  const heightCm = vm.composition.heightCm ?? 175;
  const bmi = vm.primary.bmi ?? 24;
  const bodyFat = vm.primary.bodyFatPercent ?? 22;
  const scores = (scan.estimate?.physiqueScores ?? {}) as Record<
    string,
    unknown
  >;

  const chestScore = score(scores, ["chest", "back"]);
  const shoulderScore = score(scores, ["shoulders", "back", "chest"]);
  const armScore = score(scores, ["arms"]);
  const coreScore = score(scores, ["core"]);
  const legScore = score(scores, ["legs"]);

  const massFactor = clamp((bmi - 22) / 30, -0.12, 0.35);
  const softnessFactor = clamp((bodyFat - 18) / 55, -0.08, 0.32);
  const development = (value: number | null) =>
    value == null ? 0 : clamp((value - 5) / 30, -0.1, 0.16);

  const observationByLabel = new Map(
    vm.regions.map((region) => [region.label.toLowerCase(), region.value])
  );
  const insightValue = (
    labels: string[],
    scoreValue: number | null
  ): string => {
    for (const label of labels) {
      const value = observationByLabel.get(label.toLowerCase());
      if (value) return value;
    }
    return scoreLabel(scoreValue);
  };

  return {
    heightScale: clamp(heightCm / 175, 0.9, 1.12),
    shoulderScale: clamp(
      1 + massFactor * 0.28 + development(shoulderScore),
      0.88,
      1.28
    ),
    chestScale: clamp(
      1 + massFactor * 0.35 + development(chestScore),
      0.88,
      1.32
    ),
    waistScale: clamp(1 + massFactor * 0.55 + softnessFactor, 0.82, 1.42),
    hipScale: clamp(1 + massFactor * 0.34 + softnessFactor * 0.55, 0.86, 1.3),
    armScale: clamp(1 + massFactor * 0.2 + development(armScore), 0.88, 1.25),
    legScale: clamp(1 + massFactor * 0.22 + development(legScore), 0.9, 1.28),
    depthScale: clamp(1 + massFactor * 0.42 + softnessFactor * 0.8, 0.82, 1.42),
    regions: [
      {
        id: "upper",
        label: "Shoulders & chest",
        value: insightValue(
          ["Shoulders/chest", "Chest", "Shoulders"],
          chestScore
        ),
        score: chestScore,
      },
      {
        id: "arms",
        label: "Arms",
        value: insightValue(["Arms"], armScore),
        score: armScore,
      },
      {
        id: "core",
        label: "Torso & core",
        value: insightValue(["Torso/core", "Core"], coreScore),
        score: coreScore,
      },
      {
        id: "hips",
        label: "Hips",
        value: insightValue(["Hips"], null),
        score: null,
      },
      {
        id: "legs",
        label: "Legs",
        value: insightValue(["Legs"], legScore),
        score: legScore,
      },
    ],
  };
}

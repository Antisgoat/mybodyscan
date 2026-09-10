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
  source: "photo_proportions" | "metric_estimate";
  proportionConfidence: number | null;
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
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const score = (
  values: Record<string, unknown>,
  keys: string[]
): number | null => {
  for (const key of keys) {
    const value = finite(values[key]);
    if (value != null) return clamp(value, 0, 100);
  }
  return null;
};

const scoreLabel = (value: number | null) =>
  value == null ? "Scan insight" : `${Math.round(value)} / 100 development`;

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
  const proportions = scan.estimate?.visualProportions ?? {};
  const proportionConfidence = finite(proportions.confidence);
  const suppliedProportionCount = Object.entries(proportions).filter(
    ([key, value]) => key !== "confidence" && finite(value) != null
  ).length;
  const usePhotoProportions =
    suppliedProportionCount >= 3 &&
    (proportionConfidence == null || proportionConfidence >= 0.5);
  const trustedProportions = usePhotoProportions ? proportions : {};

  const chestScore = score(scores, ["chest", "back"]);
  const shoulderScore = score(scores, ["shoulders", "back", "chest"]);
  const armScore = score(scores, ["arms"]);
  const coreScore = score(scores, ["core"]);
  const legScore = score(scores, ["legs"]);

  const massFactor = clamp((bmi - 22) / 30, -0.12, 0.35);
  const softnessFactor = clamp((bodyFat - 18) / 55, -0.08, 0.32);
  const development = (value: number | null) =>
    value == null ? 0 : clamp((value - 50) / 300, -0.1, 0.16);
  const ratioScale = (
    value: unknown,
    reference: number,
    fallback: number,
    min: number,
    max: number
  ) => {
    const ratio = finite(value);
    return ratio == null ? fallback : clamp(ratio / reference, min, max);
  };
  const fallbackShoulders = clamp(
    1 + massFactor * 0.28 + development(shoulderScore),
    0.88,
    1.28
  );
  const fallbackChest = clamp(
    1 + massFactor * 0.35 + development(chestScore),
    0.88,
    1.32
  );
  const fallbackWaist = clamp(
    1 + massFactor * 0.55 + softnessFactor,
    0.82,
    1.42
  );
  const fallbackHips = clamp(
    1 + massFactor * 0.34 + softnessFactor * 0.55,
    0.86,
    1.3
  );
  const fallbackArms = clamp(
    1 + massFactor * 0.2 + development(armScore),
    0.88,
    1.25
  );
  const fallbackLegs = clamp(
    1 + massFactor * 0.22 + development(legScore),
    0.9,
    1.28
  );
  const fallbackDepth = clamp(
    1 + massFactor * 0.42 + softnessFactor * 0.8,
    0.82,
    1.42
  );

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
    source: usePhotoProportions ? "photo_proportions" : "metric_estimate",
    proportionConfidence,
    heightScale: clamp(heightCm / 175, 0.9, 1.12),
    shoulderScale: ratioScale(
      trustedProportions.shoulderWidthToHeight,
      0.25,
      fallbackShoulders,
      0.8,
      1.36
    ),
    chestScale: ratioScale(
      trustedProportions.chestWidthToHeight,
      0.22,
      fallbackChest,
      0.8,
      1.4
    ),
    waistScale: ratioScale(
      trustedProportions.waistWidthToHeight,
      0.2,
      fallbackWaist,
      0.72,
      1.52
    ),
    hipScale: ratioScale(
      trustedProportions.hipWidthToHeight,
      0.225,
      fallbackHips,
      0.78,
      1.42
    ),
    armScale: ratioScale(
      trustedProportions.armWidthToHeight,
      0.055,
      fallbackArms,
      0.72,
      1.5
    ),
    legScale: ratioScale(
      trustedProportions.thighWidthToHeight,
      0.09,
      fallbackLegs,
      0.72,
      1.5
    ),
    depthScale: ratioScale(
      trustedProportions.torsoDepthToHeight,
      0.16,
      fallbackDepth,
      0.68,
      1.56
    ),
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

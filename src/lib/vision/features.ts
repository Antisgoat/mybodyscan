import type { Landmarks } from "./landmarks.ts";

export type ViewName = "front" | "side" | "left" | "right" | "back" | (string & {});

export type PhotoFeatures = {
  /**
   * Pose confidence on a 0-1 scale aggregated from the provided views.
   * The stub produces deterministic values purely from the input landmarks.
   */
  poseScore: number;
  /** The individual landmarks grouped by view when available. */
  views: Partial<Record<ViewName, Landmarks>>;
  /** Average pixel-based body measurements when at least one view is present. */
  averages: {
    waistWidth: number;
    hipWidth: number;
    neckWidth: number;
    heightPixels: number;
  } | null;
};

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round((total / values.length) * 10_000) / 10_000;
}

function collectDefined<T>(entries: Array<[ViewName, T | undefined]>): Array<[ViewName, T]> {
  return entries.filter((entry): entry is [ViewName, T] => entry[1] !== undefined);
}

export function combineLandmarks(
  front?: Landmarks,
  side?: Landmarks,
  left?: Landmarks,
  right?: Landmarks,
  back?: Landmarks,
): PhotoFeatures {
  const defined = collectDefined([
    ["front", front],
    ["side", side],
    ["left", left],
    ["right", right],
    ["back", back],
  ]);

  const poseScore = defined.length
    ? mean(defined.map(([, data]) => data.quality.poseScore))
    : 0;

  const waistValues = defined.map(([, data]) => data.waistWidth);
  const hipValues = defined.map(([, data]) => data.hipWidth);
  const neckValues = defined.map(([, data]) => data.neckWidth);
  const heightValues = defined.map(([, data]) => data.heightPixels);

  const averages = defined.length
    ? {
        waistWidth: mean(waistValues),
        hipWidth: mean(hipValues),
        neckWidth: mean(neckValues),
        heightPixels: mean(heightValues),
      }
    : null;

  const views: Partial<Record<ViewName, Landmarks>> = {};
  for (const [key, value] of defined) {
    views[key] = value;
  }

  return {
    poseScore,
    views,
    averages,
  };
}

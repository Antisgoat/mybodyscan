import { describe, expect, it } from "vitest";
import { evaluateGateMetrics, type GateEvaluationInput } from "../gates";

const baseMetrics: GateEvaluationInput = {
  brightness: 120,
  contrast: 26,
  sharpness: 24,
  aspectRatio: 2.1,
  centerOffsetRatio: 0.05,
  subjectCoverage: 0.35,
  subjectHeightPx: 1800,
  shoulderWidth: 420,
  waistWidth: 320,
  hipWidth: 340,
  height: 2000,
  width: 950,
  longEdge: 2000,
  imageIndex: 0,
};

describe("scan quality gate", () => {
  it("rewards well-balanced photos", () => {
    const result = evaluateGateMetrics(baseMetrics);
    expect(result.score).toBeGreaterThan(0.8);
    expect(result.reasons).toHaveLength(0);
  });

  it("flags low-resolution images", () => {
    const result = evaluateGateMetrics({
      ...baseMetrics,
      longEdge: 400,
      imageIndex: 1,
    });
    expect(result.score).toBeLessThan(1);
    expect(result.reasons).toContain(
      "Use a higher-resolution photo (long edge ≥1080px)"
    );
  });

  it("detects arms resting against torso", () => {
    const result = evaluateGateMetrics({
      ...baseMetrics,
      shoulderWidth: 320,
      waistWidth: 315,
    });
    expect(result.score).toBeLessThan(0.9);
    expect(result.reasons).toContain(
      "Raise arms slightly so they are visible away from the torso"
    );
  });
});

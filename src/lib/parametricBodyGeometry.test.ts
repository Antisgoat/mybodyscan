import { describe, expect, it } from "vitest";
import { createBodyLoftGeometry } from "./parametricBodyGeometry";

describe("createBodyLoftGeometry", () => {
  it("creates a capped, smooth geometry from body cross-sections", () => {
    const geometry = createBodyLoftGeometry([
      { y: 0, radiusX: 0.4, radiusZ: 0.25 },
      { y: 1, radiusX: 0.6, radiusZ: 0.35, centerZ: 0.04 },
      { y: 2, radiusX: 0.3, radiusZ: 0.2 },
    ]);

    expect(geometry.getAttribute("position").count).toBe(522);
    expect(geometry.getAttribute("normal").count).toBe(522);
    expect(geometry.index?.count).toBe(3_120);
    expect(geometry.boundingSphere?.radius).toBeGreaterThan(1);
  });

  it("rejects an incomplete loft", () => {
    expect(() =>
      createBodyLoftGeometry([{ y: 0, radiusX: 1, radiusZ: 1 }])
    ).toThrow(/at least two/);
  });
});

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

  it("can omit caps where adjoining body surfaces overlap", () => {
    const geometry = createBodyLoftGeometry(
      [
        { y: 0, radiusX: 0.4, radiusZ: 0.25 },
        { y: 1, radiusX: 0.6, radiusZ: 0.35 },
        { y: 2, radiusX: 0.3, radiusZ: 0.2 },
      ],
      40,
      6,
      { start: false, end: false }
    );

    expect(geometry.getAttribute("position").count).toBe(520);
    expect(geometry.index?.count).toBe(2_880);
  });

  it("does not create silhouette spikes between measured sections", () => {
    const geometry = createBodyLoftGeometry([
      { y: 0, radiusX: 0.2, radiusZ: 0.2 },
      { y: 1, radiusX: 1, radiusZ: 0.8 },
      { y: 2, radiusX: 0.22, radiusZ: 0.21 },
    ]);
    const position = geometry.getAttribute("position");
    let maxX = 0;
    let maxZ = 0;
    for (let index = 0; index < position.count; index += 1) {
      maxX = Math.max(maxX, Math.abs(position.getX(index)));
      maxZ = Math.max(maxZ, Math.abs(position.getZ(index)));
    }
    expect(maxX).toBeLessThanOrEqual(1.00001);
    expect(maxZ).toBeLessThanOrEqual(0.80001);
  });
});

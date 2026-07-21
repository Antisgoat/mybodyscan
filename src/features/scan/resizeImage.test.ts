import { describe, expect, it } from "vitest";
import {
  orientedOutputDimensions,
  scanPhotoDimensionsAreValid,
} from "./resizeImage";

describe("scan photo output dimensions", () => {
  it("accepts a valid mobile-sized portrait image", () => {
    expect(scanPhotoDimensionsAreValid(720, 1280)).toBe(true);
  });

  it("rejects a decoded thumbnail", () => {
    expect(scanPhotoDimensionsAreValid(360, 640)).toBe(false);
  });

  it("accepts correctly sized images regardless of compressed byte size", () => {
    const highlyCompressibleBytes = 9_000;
    expect(highlyCompressibleBytes).toBeLessThan(10_000);
    expect(scanPhotoDimensionsAreValid(900, 1600)).toBe(true);
  });

  it("preserves valid dimensions when EXIF orientation rotates the output", () => {
    const rotated = orientedOutputDimensions(1600, 1000, 6, 1280);
    expect(rotated).toEqual({ width: 800, height: 1280 });
    expect(scanPhotoDimensionsAreValid(rotated.width, rotated.height)).toBe(
      true
    );
  });
});

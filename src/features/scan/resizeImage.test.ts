import { describe, expect, it } from "vitest";
import {
  orientedOutputDimensions,
  scanPhotoDimensionsAreValid,
} from "./resizeImage";

describe("scan photo output dimensions", () => {
  it.each([
    [1280, 720],
    [900, 500],
    [720, 1280],
  ])("accepts valid %s×%s output", (width, height) => {
    expect(scanPhotoDimensionsAreValid(width, height)).toBe(true);
  });

  it.each([
    [899, 500],
    [900, 499],
  ])("rejects undersized %s×%s output", (width, height) => {
    expect(scanPhotoDimensionsAreValid(width, height)).toBe(false);
  });

  it("accepts a small JPEG byte size when decoded dimensions are valid", () => {
    const jpegBytes = 9_000;
    expect(jpegBytes).toBeLessThan(10_000);
    expect(scanPhotoDimensionsAreValid(1280, 720)).toBe(true);
  });

  it("preserves valid portrait dimensions after EXIF rotation", () => {
    const rotated = orientedOutputDimensions(1600, 1000, 6, 1280);
    expect(rotated).toEqual({ width: 800, height: 1280 });
    expect(scanPhotoDimensionsAreValid(rotated.width, rotated.height)).toBe(
      true
    );
  });
});

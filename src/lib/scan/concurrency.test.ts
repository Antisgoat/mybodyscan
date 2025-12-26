import { describe, expect, it } from "vitest";
import { computeUploadConcurrency } from "./concurrency";

describe("computeUploadConcurrency", () => {
  it("caps concurrency to 2 on mobile Safari-like devices", () => {
    expect(computeUploadConcurrency(4, true)).toBe(2);
    expect(computeUploadConcurrency(1, true)).toBe(1);
  });

  it("allows up to 4 concurrent uploads on desktop", () => {
    expect(computeUploadConcurrency(4, false)).toBe(4);
    expect(computeUploadConcurrency(10, false)).toBe(4);
  });

  it("falls back to at least 1 worker", () => {
    expect(computeUploadConcurrency(0, false)).toBe(1);
    expect(computeUploadConcurrency(-3, true)).toBe(1);
  });
});

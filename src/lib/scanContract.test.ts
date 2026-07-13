import { describe, expect, it } from "vitest";
import {
  hasAllRequiredPhotoPaths,
  isSuccessfulPersistedScan,
  normalizeScanStatus,
} from "./scanContract";

describe("scanContract", () => {
  const paths = {
    front: "scans/u/s/front.jpg",
    back: "scans/u/s/back.jpg",
    left: "scans/u/s/left.jpg",
    right: "scans/u/s/right.jpg",
  };

  it("requires all four photo paths", () => {
    expect(hasAllRequiredPhotoPaths(paths)).toBe(true);
    expect(hasAllRequiredPhotoPaths({ ...paths, right: "" })).toBe(false);
  });

  it("accepts legacy aliases only at status boundaries", () => {
    expect(normalizeScanStatus("pending")).toBe("queued");
    expect(normalizeScanStatus("completed")).toBe("complete");
    expect(normalizeScanStatus("done")).toBe("complete");
    expect(normalizeScanStatus("failed")).toBe("error");
  });

  it("does not treat fallback or unpersisted estimates as successful scans", () => {
    const complete = {
      status: "complete",
      resultSource: "ai",
      usedFallback: false,
      completedAt: new Date(),
      photoPaths: paths,
      input: { currentWeightKg: 82 },
      estimate: { bodyFatPercent: 18.5 },
    };
    expect(isSuccessfulPersistedScan(complete)).toBe(true);
    expect(isSuccessfulPersistedScan({ ...complete, usedFallback: true })).toBe(
      false
    );
    expect(
      isSuccessfulPersistedScan({ ...complete, resultSource: "fallback" })
    ).toBe(false);
    expect(isSuccessfulPersistedScan({ ...complete, completedAt: null })).toBe(
      false
    );
  });
});

import { describe, it, expect } from "vitest";
import { getUploadStallReason, validateScanUploadInputs } from "./scan";

describe("scan flow helpers", () => {
  it("detects stalls correctly", () => {
    const now = 1_000_000;
    expect(
      getUploadStallReason({
        lastBytes: 0,
        lastBytesAt: now - 5_000,
        now,
        stallTimeoutMs: 20_000,
      })
    ).toBeNull();
    expect(
      getUploadStallReason({
        lastBytes: 0,
        lastBytesAt: now - 25_000,
        now,
        stallTimeoutMs: 20_000,
      })
    ).toBe("no_progress");
    expect(
      getUploadStallReason({
        lastBytes: 123,
        lastBytesAt: now - 25_000,
        now,
        stallTimeoutMs: 20_000,
      })
    ).toBe("stalled");
  });

  it("validates upload inputs", () => {
    const fakeFile = new File([new Blob(["x"])], "front.jpg", { type: "image/jpeg" });
    const result = validateScanUploadInputs({
      storagePaths: { front: "a", back: "b", left: "c", right: "d" },
      photos: { front: fakeFile, back: fakeFile, left: fakeFile, right: fakeFile },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.uploadTargets).toHaveLength(4);
      expect(result.data.totalBytes).toBeGreaterThan(0);
    }
  });
});


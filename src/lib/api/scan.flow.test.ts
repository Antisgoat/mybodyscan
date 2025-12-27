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
      uid: "u1",
      scanId: "s1",
      photos: { front: fakeFile, back: fakeFile, left: fakeFile, right: fakeFile },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.uploadTargets).toHaveLength(4);
      expect(result.data.totalBytes).toBeGreaterThan(0);
    }
  });

  it("builds an upload plan with paths and byte sizes", () => {
    const front = new File([new Blob(["front-bytes"])], "front.jpg", { type: "image/jpeg" });
    const back = new File([new Blob(["back-bytes"])], "back.jpg", { type: "image/jpeg" });
    const left = new File([new Blob(["left-bytes"])], "left.jpg", { type: "image/jpeg" });
    const right = new File([new Blob(["right-bytes"])], "right.jpg", { type: "image/jpeg" });
    const result = validateScanUploadInputs({
      uid: "u1",
      scanId: "s1",
      photos: { front, back, left, right },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.uploadTargets.map((t) => t.path)).toEqual([
        "scans/u1/s1/front.jpg",
        "scans/u1/s1/back.jpg",
        "scans/u1/s1/left.jpg",
        "scans/u1/s1/right.jpg",
      ]);
      const expectedBytes = front.size + back.size + left.size + right.size;
      expect(result.data.totalBytes).toBe(expectedBytes);
    }
  });
});

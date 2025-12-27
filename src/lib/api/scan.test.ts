import { describe, expect, it } from "vitest";
import { getUploadStallReason, validateScanUploadInputs } from "@/lib/api/scan";

describe("scan upload stall detection", () => {
  it("returns null before stall timeout", () => {
    expect(
      getUploadStallReason({
        lastBytes: 0,
        lastBytesAt: 1000,
        now: 1500,
        stallTimeoutMs: 1000,
      })
    ).toBeNull();
  });

  it("distinguishes no_progress vs stalled", () => {
    expect(
      getUploadStallReason({
        lastBytes: 0,
        lastBytesAt: 0,
        now: 60_000,
        stallTimeoutMs: 30_000,
      })
    ).toBe("no_progress");

    expect(
      getUploadStallReason({
        lastBytes: 123,
        lastBytesAt: 0,
        now: 60_000,
        stallTimeoutMs: 30_000,
      })
    ).toBe("stalled");
  });
});

describe("scan client guardrails", () => {
  it("rejects zero-byte files with a clear message (prevents 0% upload stalls)", async () => {
    const zero = new File([""], "empty.jpg", { type: "image/jpeg" });
    const result = validateScanUploadInputs({
      uid: "user-123",
      scanId: "scan-1",
      photos: { front: zero, back: zero, left: zero, right: zero },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reason).toBe("upload_failed");
      expect(result.error.message.toLowerCase()).toContain("retake");
    }
  });
});


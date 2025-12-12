import { describe, it, expect } from "vitest";
import { validateScanUploadInputs } from "@/lib/api/scan";

describe("scan client guardrails", () => {
  it("rejects zero-byte files with a clear message (prevents 0% upload stalls)", async () => {
    const zero = new File([""], "empty.jpg", { type: "image/jpeg" });
    const result = validateScanUploadInputs({
      storagePaths: {
        front: "x/front.jpg",
        back: "x/back.jpg",
        left: "x/left.jpg",
        right: "x/right.jpg",
      },
      photos: { front: zero, back: zero, left: zero, right: zero },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reason).toBe("upload_failed");
      expect(result.error.message.toLowerCase()).toContain("retake");
    }
  });
});


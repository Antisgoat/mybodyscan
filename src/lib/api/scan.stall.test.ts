import { describe, expect, it } from "vitest";

import { isUploadStalled } from "@/lib/api/scan";

describe("scan upload stall detection", () => {
  it("returns false for invalid inputs", () => {
    expect(
      isUploadStalled({
        // @ts-expect-error
        lastProgressAtMs: NaN,
        nowMs: Date.now(),
        stallTimeoutMs: 60_000,
      })
    ).toBe(false);

    expect(
      isUploadStalled({
        lastProgressAtMs: Date.now(),
        // @ts-expect-error
        nowMs: NaN,
        stallTimeoutMs: 60_000,
      })
    ).toBe(false);

    expect(
      isUploadStalled({
        lastProgressAtMs: Date.now(),
        nowMs: Date.now(),
        stallTimeoutMs: 0,
      })
    ).toBe(false);
  });

  it("returns true when elapsed time exceeds stall timeout", () => {
    const start = 1_000_000;
    expect(
      isUploadStalled({
        lastProgressAtMs: start,
        nowMs: start + 59_999,
        stallTimeoutMs: 60_000,
      })
    ).toBe(false);

    expect(
      isUploadStalled({
        lastProgressAtMs: start,
        nowMs: start + 60_000,
        stallTimeoutMs: 60_000,
      })
    ).toBe(true);
  });
});

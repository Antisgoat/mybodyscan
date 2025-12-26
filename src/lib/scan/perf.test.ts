import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("@/lib/telemetry", () => ({
  reportError: vi.fn(async () => {}),
}));

import { flush, mark, measure } from "./perf";

describe("scan perf tracer", () => {
  beforeEach(() => {
    // ensure no marks leak between tests
    void flush();
  });

  it("collects marks and measures without throwing in test env", async () => {
    expect(() => mark("upload_start", { pose: "front", scanId: "scan-1" })).not.toThrow();
    expect(() => mark("upload_end", { pose: "front", scanId: "scan-1" })).not.toThrow();
    expect(() =>
      measure("upload_duration", "upload_start", "upload_end", { pose: "front" })
    ).not.toThrow();
    await expect(flush()).resolves.toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import { canonicalizeScanStatus, scanStatusLabel } from "@/lib/scanStatus";

describe("scanStatus", () => {
  it("canonicalizes queued status", () => {
    expect(canonicalizeScanStatus("queued")).toBe("queued");
  });

  it("labels queued scans", () => {
    const meta = scanStatusLabel("queued", new Date());
    expect(meta.canonical).toBe("queued");
    expect(meta.label.toLowerCase()).toContain("queued");
  });

  it("handles transition to complete", () => {
    const meta = scanStatusLabel("complete", new Date());
    expect(meta.showMetrics).toBe(true);
    expect(meta.canonical).toBe("complete");
  });
});

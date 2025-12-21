import { describe, expect, it } from "vitest";
import { computeProcessingTimeouts, latestHeartbeatMillis } from "@/lib/scanHeartbeat";

describe("scanHeartbeat", () => {
  it("uses the latest heartbeat timestamp", () => {
    const updatedAt = new Date("2024-01-01T00:00:10Z");
    const heartbeatAt = new Date("2024-01-01T00:00:30Z");
    const lastStepAt = new Date("2024-01-01T00:00:20Z");
    const latest = latestHeartbeatMillis({ updatedAt, heartbeatAt, lastStepAt });
    expect(latest).toBe(heartbeatAt.getTime());
  });

  it("computes long-processing and hard-timeout based on heartbeat", () => {
    const startedAt = 1000;
    const lastHeartbeatAt = 4000;
    const now = 50_000;
    const result = computeProcessingTimeouts({
      startedAt,
      lastHeartbeatAt,
      now,
      warningMs: 20_000,
      timeoutMs: 40_000,
    });
    expect(result.showLongProcessing).toBe(true);
    expect(result.hardTimeout).toBe(true);
  });

  it("does not flag timeout when updates are fresh", () => {
    const startedAt = 1000;
    const lastHeartbeatAt = 45_000;
    const now = 50_000;
    const result = computeProcessingTimeouts({
      startedAt,
      lastHeartbeatAt,
      now,
      warningMs: 20_000,
      timeoutMs: 40_000,
    });
    expect(result.showLongProcessing).toBe(false);
    expect(result.hardTimeout).toBe(false);
  });
});

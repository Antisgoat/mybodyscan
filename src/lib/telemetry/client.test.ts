import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  enqueue,
  flush,
  getDebugSnapshot,
  __telemetryClientTestInternals,
} from "@/lib/telemetry/client";

describe("telemetry client", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __telemetryClientTestInternals.reset();
    // Minimal window/location needed by resolveTelemetryUrl()
    (globalThis as any).window = (globalThis as any).window ?? {};
    try {
      Object.defineProperty((globalThis as any).window, "location", {
        configurable: true,
        value: {
          origin: "http://localhost:3000",
          pathname: "/auth",
          href: "http://localhost:3000/auth",
        },
      });
    } catch {
      (globalThis as any).window.location = {
        origin: "http://localhost:3000",
        pathname: "/auth",
        href: "http://localhost:3000/auth",
      };
    }
    (globalThis as any).document = (globalThis as any).document ?? {
      addEventListener() {},
      visibilityState: "visible",
    };
    (globalThis as any).navigator = (globalThis as any).navigator ?? {};

    // Force fetch path (no beacon)
    (globalThis as any).navigator.sendBeacon = undefined;
    const fetchMock = vi.fn(async () => ({ status: 204 })) as any;
    (globalThis as any).fetch = fetchMock;
    (globalThis as any).window.fetch = fetchMock;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("dedupes same (kind+route+uid) within 30s", async () => {
    enqueue(
      { kind: "auth.init", message: "auth.init", extra: { phase: "start" } },
      { route: "/auth", uid: "u1" }
    );
    enqueue(
      { kind: "auth.init", message: "auth.init", extra: { phase: "start" } },
      { route: "/auth", uid: "u1" }
    );
    const snap = getDebugSnapshot();
    expect(snap.queueSize).toBe(1);
    expect(snap.counts.droppedDedupe).toBe(1);

    await flush({ useBeacon: false, reason: "test" });
    expect((globalThis as any).fetch).toHaveBeenCalledTimes(1);
  });

  it("throttles to at most 1 request per 5 seconds", async () => {
    enqueue({ kind: "k1", message: "m1" }, { route: "/r", uid: "u" });
    await flush({ useBeacon: false, reason: "t1" });
    expect((globalThis as any).fetch).toHaveBeenCalledTimes(1);

    enqueue({ kind: "k2", message: "m2" }, { route: "/r", uid: "u" });
    await flush({ useBeacon: false, reason: "t2" });
    // Still 1 due to throttle
    expect((globalThis as any).fetch).toHaveBeenCalledTimes(1);

    // Advance past throttle window
    vi.advanceTimersByTime(5_100);
    await flush({ useBeacon: false, reason: "t3" });
    expect((globalThis as any).fetch).toHaveBeenCalledTimes(2);
  });
});


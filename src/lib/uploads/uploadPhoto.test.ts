import { describe, expect, it } from "vitest";
import {
  isIOSWebKitDevice,
  shouldFallbackToFunction,
  shouldFallbackToStorage,
} from "@/lib/uploads/uploadPhoto";

describe("uploadPhoto decisions", () => {
  it("prefers function uploads on iOS WebKit", () => {
    expect(
      isIOSWebKitDevice({
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        maxTouchPoints: 5,
      })
    ).toBe(true);
  });

  it("treats iPadOS desktop-mode UA as iOS WebKit", () => {
    expect(
      isIOSWebKitDevice({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        maxTouchPoints: 5,
      })
    ).toBe(true);
  });

  it("uses storage on non-iOS desktop browsers", () => {
    expect(
      isIOSWebKitDevice({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.117 Safari/537.36",
        maxTouchPoints: 0,
      })
    ).toBe(false);
  });

  it("falls back to function uploads for storage stalls", () => {
    expect(shouldFallbackToFunction("upload_paused")).toBe(true);
    expect(shouldFallbackToFunction("upload_no_progress")).toBe(true);
  });

  it("falls back to storage uploads for function errors", () => {
    expect(shouldFallbackToStorage("function/unavailable")).toBe(true);
    expect(shouldFallbackToStorage("cors_blocked")).toBe(true);
    expect(shouldFallbackToStorage("function/unauthenticated")).toBe(false);
  });
});

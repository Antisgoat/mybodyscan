import { describe, expect, it } from "vitest";
import { isSubscriberOnlyPath } from "./SubscriberFeatureGate";

describe("subscriber-only route policy", () => {
  it("gates recurring coaching, tracking, and Momentum routes", () => {
    [
      "/today",
      "/coach",
      "/coach/chat",
      "/programs/quiz",
      "/nutrition",
      "/workouts/completed",
      "/meals",
      "/meals/plan",
      "/barcode",
      "/health",
      "/settings/health",
      "/results/scan-1/transformation-preview",
    ].forEach((path) => expect(isSubscriberOnlyPath(path)).toBe(true));
  });

  it("keeps purchased scans and their complete reports available", () => {
    [
      "/home",
      "/scan",
      "/capture/photos",
      "/processing/user/scan-1",
      "/results/scan-1",
      "/history",
      "/plans",
      "/settings",
    ].forEach((path) => expect(isSubscriberOnlyPath(path)).toBe(false));
  });
});

import { describe, it, expect } from "vitest";
import { computeFeatureStatuses } from "@/lib/envStatus";

describe("envStatus coach defaults", () => {
  it("does not gate coach on COACH_RPM (coach should be enabled when OpenAI is configured)", () => {
    const summary = computeFeatureStatuses({
      openaiConfigured: true,
      openaiKeyPresent: true,
      coachRpmPresent: false,
      coachConfigured: true,
    });
    expect(summary.coachConfigured).toBe(true);
    const coachStatus = summary.statuses.find((s) => s.id === "coach");
    expect(coachStatus?.configured).toBe(true);
  });
});


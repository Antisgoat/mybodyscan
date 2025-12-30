import { describe, expect, it } from "vitest";
import { isPathAllowedInDemo } from "@/lib/demoFlag";

describe("demo allowed paths", () => {
  it("allows workouts routes in demo", () => {
    expect(isPathAllowedInDemo("/workouts")).toBe(true);
    expect(isPathAllowedInDemo("/workouts/library")).toBe(true);
    expect(isPathAllowedInDemo("/workouts/completed")).toBe(true);
  });
});


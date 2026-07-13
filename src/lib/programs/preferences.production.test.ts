import { describe, expect, it } from "vitest";
import { normalizeProgramPreferences } from "./preferences";

describe("ProgramPreferences production support", () => {
  it("preserves 2-day plans", () => {
    const prefs = normalizeProgramPreferences({ daysPerWeek: 2 });
    expect(prefs.daysPerWeek).toBe(2);
  });
});

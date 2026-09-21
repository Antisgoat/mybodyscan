import { describe, expect, it } from "vitest";
import { requestFunctionPath, unwrapRequestFunctionResponse } from "./legacyRequestRoute";

describe("legacy HTTP function routing", () => {
  it("routes browser writes through Hosting's /api rewrite", () => {
    expect(requestFunctionPath("addMeal", false)).toBe("/api/addMeal");
    expect(requestFunctionPath("getPlan", false)).toBe("/api/getPlan");
    expect(requestFunctionPath("weeklyReview", false)).toBe("/api/weeklyReview");
  });

  it("keeps native calls on standalone HTTP functions", () => {
    expect(requestFunctionPath("addMeal", true)).toBe("/addMeal");
    expect(requestFunctionPath("getPlan", true)).toBe("/getPlan");
  });

  it("unwraps the gateway envelope without changing direct responses", () => {
    const meal = { meal: { name: "Egg" }, totals: { calories: 70 } };
    expect(unwrapRequestFunctionResponse("addMeal", { ok: true, data: meal })).toEqual(meal);
    expect(unwrapRequestFunctionResponse("addMeal", meal)).toEqual(meal);
  });
});

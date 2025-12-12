import { describe, expect, it } from "vitest";

import { normalizeRichFoodItem } from "@/lib/nutrition/toFoodItem";
import { macrosToNumbers } from "@/lib/nutrition/numbers";

describe("nutrition item normalization", () => {
  it("does not throw and yields numeric basePer100g when macros are missing", () => {
    const normalized = normalizeRichFoodItem({
      id: "x",
      name: "Mystery Food",
      // basePer100g missing
      // per_serving missing
    });

    expect(normalized.id).toBe("x");
    expect(normalized.name).toBe("Mystery Food");
    expect(typeof normalized.basePer100g.kcal).toBe("number");
    expect(typeof normalized.basePer100g.protein).toBe("number");
    expect(typeof normalized.basePer100g.carbs).toBe("number");
    expect(typeof normalized.basePer100g.fat).toBe("number");

    expect(macrosToNumbers((normalized as any).per_serving)).toEqual({
      kcal: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
    });
  });
});

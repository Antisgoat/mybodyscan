import { describe, expect, it } from "vitest";
import { matchSavedAllergens } from "@/lib/nutritionSafety";

describe("matchSavedAllergens", () => {
  it("matches common source labels to the saved FDA major allergen", () => {
    expect(
      matchSavedAllergens(
        ["en:milk", "tree-nuts", "soybeans"],
        ["milk", "tree_nuts", "soy", "wheat"]
      )
    ).toEqual(["milk", "tree_nuts", "soy"]);
  });

  it("does not flag allergens that the user did not save", () => {
    expect(matchSavedAllergens(["milk", "peanuts"], ["wheat"])).toEqual([]);
  });
});

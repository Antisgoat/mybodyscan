import { describe, expect, it } from "vitest";
import { deriveProductInsight } from "./productInsight";

function product(nutriments: Record<string, number>, extra: Record<string, unknown> = {}) {
  return { raw: { raw: { nutriments, ...extra } } };
}

describe("MBS Product Insight", () => {
  it("rewards fiber/protein and explains every score adjustment", () => {
    const result = deriveProductInsight(
      product({
        "energy-kcal_100g": 180,
        proteins_100g: 18,
        fiber_100g: 8,
        "saturated-fat_100g": 1,
        sodium_100g: 0.1,
        "added-sugars_100g": 2,
      }, { ingredients_text: "Beans, vegetables", allergens_tags: ["en:soy"] })
    );
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.confidence).toBe("high");
    expect(result.factors.some((factor) => factor.key === "fiber" && factor.impact > 0)).toBe(true);
    expect(result.allergens).toEqual(["soy"]);
  });

  it("penalizes nutrients to limit without labeling additives as unsafe", () => {
    const result = deriveProductInsight(
      product({
        "energy-kcal_100g": 500,
        proteins_100g: 2,
        fiber_100g: 1,
        "saturated-fat_100g": 12,
        sodium_100g: 1.5,
        sugars_100g: 30,
      }, { additives_tags: ["en:e330", "en:e322"] })
    );
    expect(result.score).toBeLessThan(50);
    expect(result.additives).toEqual(["e330", "e322"]);
    expect(result.factors.every((factor) => !factor.label.toLowerCase().includes("additive"))).toBe(true);
  });

  it("refuses to score products with insufficient core data", () => {
    const result = deriveProductInsight(product({ proteins_100g: 5 }));
    expect(result.score).toBeNull();
    expect(result.label).toBe("Insufficient data");
    expect(result.confidence).toBe("low");
  });

  it("surfaces seed-derived oils as neutral ingredient notes without changing the score", () => {
    const withOil = deriveProductInsight(
      product(
        {
          "energy-kcal_100g": 200,
          proteins_100g: 8,
          fiber_100g: 4,
          "saturated-fat_100g": 2,
          sodium_100g: 0.2,
          sugars_100g: 3,
        },
        { ingredients_text: "Chicken, sunflower oil, spices" }
      )
    );
    const withoutOil = deriveProductInsight(
      product(
        {
          "energy-kcal_100g": 200,
          proteins_100g: 8,
          fiber_100g: 4,
          "saturated-fat_100g": 2,
          sodium_100g: 0.2,
          sugars_100g: 3,
        },
        { ingredients_text: "Chicken, spices" }
      )
    );
    expect(withOil.ingredientHighlights).toContain("Seed-derived oil listed");
    expect(withOil.score).toBe(withoutOil.score);
  });

  it("clamps scores to the documented 0-100 range", () => {
    const result = deriveProductInsight(
      product({
        "energy-kcal_100g": 100,
        proteins_100g: 100,
        fiber_100g: 100,
        "saturated-fat_100g": 0,
        sodium_100g: 0,
        "added-sugars_100g": 0,
      })
    );
    expect(result.score).toBe(100);
  });
});

import { describe, expect, it } from "vitest";
import type { FoodItem } from "@/lib/nutrition/types";
import { deriveProductAlternatives } from "./productAlternatives";

function food(
  id: string,
  scoreShape: { fiber: number; sugar: number },
  categories: string[]
): FoodItem {
  const nutriments = {
    "energy-kcal_100g": 180,
    proteins_100g: 10,
    fiber_100g: scoreShape.fiber,
    "saturated-fat_100g": 2,
    sodium_100g: 0.2,
    sugars_100g: scoreShape.sugar,
  };
  return {
    id,
    name: `Food ${id}`,
    brand: null,
    source: "Open Food Facts",
    basePer100g: { kcal: 180, protein: 10, carbs: 20, fat: 4 },
    servings: [{ id: "100g", label: "100 g", grams: 100 }],
    serving: { qty: 100, unit: "g" },
    per_serving: { kcal: 180, protein_g: 10, carbs_g: 20, fat_g: 4 },
    raw: { nutriments, categories_tags_en: categories },
  };
}

describe("product alternatives", () => {
  it("returns only strictly higher-scoring products sharing a category", () => {
    const current = food("current", { fiber: 1, sugar: 25 }, [
      "Snacks",
      "Crackers",
    ]);
    const higher = food("higher", { fiber: 8, sugar: 2 }, [
      "Snacks",
      "Crackers",
    ]);
    const unrelated = food("unrelated", { fiber: 9, sugar: 1 }, ["Beverages"]);
    const lower = food("lower", { fiber: 0, sugar: 35 }, [
      "Snacks",
      "Crackers",
    ]);
    const result = deriveProductAlternatives(current, [
      higher,
      unrelated,
      lower,
    ]);
    expect(result.map((entry) => entry.item.id)).toEqual(["higher"]);
    expect(result[0]?.scoreDifference).toBeGreaterThan(0);
    expect(result[0]?.sharedCategory).toBe("crackers");
  });

  it("does not recommend when the current product cannot be scored", () => {
    const current = food("current", { fiber: 1, sugar: 25 }, ["Crackers"]);
    current.raw = {
      nutriments: { proteins_100g: 1 },
      categories_tags_en: ["Crackers"],
    };
    expect(
      deriveProductAlternatives(current, [
        food("higher", { fiber: 8, sugar: 2 }, ["Crackers"]),
      ])
    ).toEqual([]);
  });
});

import assert from "node:assert/strict";
import test from "node:test";
import { rankNutritionResults } from "../lib/nutritionSearch.js";

function food({ id, name, brand = null, dataType = "Branded" }) {
  return {
    id,
    name,
    brand,
    source: "USDA",
    basePer100g: { kcal: 165, protein: 31, carbs: 0, fat: 3.6 },
    servings: [{ id: `${id}-100g`, label: "100 g", grams: 100 }],
    serving: { qty: 100, unit: "g", text: "100 g" },
    per_serving: { kcal: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6 },
    raw: { dataType },
  };
}

test("generic authoritative foods rank ahead of unrelated branded matches", () => {
  const ranked = rankNutritionResults(
    [
      food({
        id: "branded",
        name: "CHICKEN BREAST",
        brand: "Example Packaged Foods",
      }),
      food({
        id: "foundation",
        name: "Chicken breast, boneless, skinless, cooked",
        dataType: "Foundation",
      }),
    ],
    "chicken breast"
  );
  assert.equal(ranked[0].id, "foundation");
});

test("a requested brand remains relevant when the query names it", () => {
  const ranked = rankNutritionResults(
    [
      food({
        id: "generic",
        name: "Chicken breast, cooked",
        dataType: "Foundation",
      }),
      food({
        id: "tyson",
        name: "Chicken breast strips",
        brand: "Tyson Foods",
      }),
    ],
    "Tyson chicken breast"
  );
  assert.equal(ranked[0].id, "tyson");
});

test("ties preserve the upstream order", () => {
  const first = food({ id: "first", name: "Oatmeal" });
  const second = food({ id: "second", name: "Oatmeal" });
  assert.deepEqual(
    rankNutritionResults([first, second], "oatmeal").map((item) => item.id),
    ["first", "second"]
  );
});

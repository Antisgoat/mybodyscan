import assert from "node:assert/strict";
import test from "node:test";
import {
  curatedWholeFoods,
  preferWholeFoodMatches,
  isPlainWholeFoodQuery,
} from "../lib/lib/wholeFoodSearch.js";
import { WHOLE_FOOD_REFERENCE } from "../lib/data/wholeFoodReference.js";
import {
  curateNutritionResults,
  fromUsdaFood,
  usdaDataTypesForQuery,
} from "../lib/nutritionSearch.js";

test("ground beef is a short brand-neutral set, one reference per lean ratio and weight state", () => {
  const foods = curatedWholeFoods("ground beef");
  assert.equal(foods.length, 12);
  assert.equal(new Set(foods.map((food) => food.name)).size, 12);
  assert.ok(
    foods.every(
      (food) => food.brand === null && food.fdcId && food.serving.qty === 100
    )
  );
  for (const lean of [80, 85, 90, 93, 95, 97]) {
    assert.equal(
      foods.filter((food) => food.wholeFood.leanPercent === lean).length,
      2
    );
  }
});

test("ratio spelling and preparation identify the same source, without averaging blends", () => {
  for (const term of [
    "93/7 ground beef raw",
    "ground beef 93-7 raw",
    "ground beef 93% lean 7% fat raw",
    "raw 93 ground beef",
  ]) {
    const foods = curateNutritionResults([], term);
    assert.equal(foods.length, 1);
    assert.equal(foods[0].fdcId, 173110);
    assert.deepEqual(foods[0].basePer100g, {
      kcal: 152,
      protein: 20.8,
      carbs: 0,
      fat: 7,
    });
  }
  assert.equal(curatedWholeFoods("93/7 beef cooked")[0].fdcId, 174755);
  assert.equal(curatedWholeFoods("85/15 beef raw")[0].fdcId, 171796);
  assert.equal(curatedWholeFoods("beef 93 10 raw"), null);
  assert.equal(curatedWholeFoods("beef 96/4 raw"), null);
});

test("chicken cut, skin, and raw/cooked state remain distinct", () => {
  const raw = curatedWholeFoods("boneless skinless chicken breast raw");
  assert.equal(raw.length, 1);
  assert.equal(raw[0].fdcId, 2646170);
  assert.equal(
    curatedWholeFoods("chicken breast with skin raw")[0].fdcId,
    2727569
  );
  assert.equal(
    curatedWholeFoods("roasted skinless chicken thigh")[0].fdcId,
    172388
  );
  assert.equal(
    curatedWholeFoods("chicken breast skin off cooked")[0].fdcId,
    171477
  );
});

test("prepared dishes, unsupported cuts/methods, and brand searches are never silently made generic", () => {
  for (const query of [
    "Tyson chicken breast",
    "chicken nuggets",
    "chicken with sauce",
    "fried chicken",
    "ground chicken",
    "chicken soup",
    "beef ribeye",
    "grilled chicken breast",
    "beef and chicken",
  ]) {
    assert.equal(curatedWholeFoods(query), null, query);
  }
});

test("all references are complete and source-linked; cooked and raw nutrition are not interchanged", () => {
  for (const row of WHOLE_FOOD_REFERENCE) {
    assert.ok(row.fdcId > 0 && row.description.length > 10);
    assert.ok(
      Object.values(row.macros).every((value) => Number.isFinite(value))
    );
    assert.ok(row.macros.kcal > 0 && row.macros.protein > 0);
  }
  for (const food of [
    ...curatedWholeFoods("chicken"),
    ...curatedWholeFoods("beef"),
  ]) {
    assert.ok(Object.values(food.basePer100g).every((value) => value >= 0));
  }
  const beef = curatedWholeFoods("ground beef 93/7");
  assert.equal(
    beef.find((food) => food.wholeFood.preparation === "raw").basePer100g.kcal,
    152
  );
  assert.equal(
    beef.find((food) => food.wholeFood.preparation === "cooked").basePer100g
      .kcal,
    209
  );
});

test("new Foundation Atwater energy fields never become a zero-calorie food", () => {
  const item = fromUsdaFood({
    fdcId: 1,
    description: "Plain chicken",
    foodNutrients: [
      { nutrientId: 2048, value: 120 },
      { nutrientId: 2047, value: 118 },
      { nutrientId: 1003, value: 22 },
      { nutrientId: 1004, value: 3 },
      { nutrientId: 1005, value: 0 },
    ],
  });
  assert.equal(item.basePer100g.kcal, 120);
});

test("plain-food duplicate removal retains differing preparation and never merges a requested brand", () => {
  const base = { source: "USDA", brand: null, raw: { dataType: "Foundation" } };
  const foods = [
    { ...base, id: "first", name: "Rice, white, cooked" },
    { ...base, id: "duplicate", name: "RICE WHITE COOKED" },
    { ...base, id: "raw", name: "Rice, white, raw" },
    { ...base, id: "brand", name: "Rice, white, cooked", brand: "Example" },
  ];
  assert.deepEqual(
    preferWholeFoodMatches(foods, "white rice").map((food) => food.id),
    ["first", "raw"]
  );
  assert.deepEqual(preferWholeFoodMatches(foods, "Example rice"), foods);
  assert.equal(isPlainWholeFoodQuery("rice pudding"), false);
  assert.equal(isPlainWholeFoodQuery("raw salmon"), true);
});

test("egg component searches narrow the list without changing standard portions", () => {
  assert.deepEqual(
    curateNutritionResults([], "egg whites").map((item) => item.name),
    ["Egg white, large"]
  );
  assert.deepEqual(
    curateNutritionResults([], "egg yolk").map((item) => item.name),
    ["Egg yolk, large"]
  );
  assert.equal(curateNutritionResults([], "whole egg")[0].per_serving.kcal, 70);
});
test("whole-food USDA requests exclude branded catalogs without restricting explicit brand searches", () => {
  const plain = usdaDataTypesForQuery("raw salmon");
  assert.ok(Array.isArray(plain));
  assert.ok(plain.includes("Foundation") && plain.includes("SR Legacy"));
  assert.ok(!plain.includes("Branded"));
  assert.ok(usdaDataTypesForQuery("Example brand salmon").includes("Branded"));
});

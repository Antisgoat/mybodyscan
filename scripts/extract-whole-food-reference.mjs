// Reproducible extraction from the official USDA JSON downloads. This script
// prints a small reference table; it never guesses nutrients or writes files.
// Usage: node scripts/extract-whole-food-reference.mjs foundation.json legacy.json
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const [foundationPath, legacyPath] = process.argv.slice(2);
if (!foundationPath || !legacyPath)
  throw new Error("Supply both official USDA JSON files");
const datasets = [foundationPath, legacyPath].map((path) => {
  const bytes = readFileSync(path);
  const data = JSON.parse(bytes.toString("utf8"));
  return {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    foods: Object.values(data).find(Array.isArray).filter(Boolean),
  };
});
const selections = [
  ...[
    [93, 173110, 174755],
    [90, 2514743, 171794],
    [85, 171796, 174034],
    [80, 2514744, 171799],
    [95, 171790, 174028],
    [97, 173111, 174756],
  ].flatMap(([lean, raw, cooked]) => [
    {
      id: raw,
      family: "beef",
      cut: "ground",
      lean,
      state: "raw",
      name: `Ground beef, ${lean}% lean / ${100 - lean}% fat, raw`,
    },
    {
      id: cooked,
      family: "beef",
      cut: "ground",
      lean,
      state: "cooked",
      name: `Ground beef, ${lean}% lean / ${100 - lean}% fat, cooked (pan-browned)`,
    },
  ]),
  ...[
    ["breast", "skinless", 2646170, 171477],
    ["breast", "skin-on", 2727569, 171075],
    ["thigh", "skinless", 2646171, 172388],
    ["thigh", "skin-on", 2727567, 173625],
    ["drumstick", "skin-on", 2727566, 173612],
    ["wing", "skin-on", 2727568, 173630],
  ].flatMap(([cut, skin, raw, cooked]) => [
    {
      id: raw,
      family: "chicken",
      cut,
      skin,
      state: "raw",
      name: `Chicken ${cut}, ${skin}, raw`,
    },
    {
      id: cooked,
      family: "chicken",
      cut,
      skin,
      state: "cooked",
      name: `Chicken ${cut}, ${skin}, roasted`,
    },
  ]),
];
const rows = selections.map(({ id, ...details }) => {
  const dataset = datasets.find((data) =>
    data.foods.some((food) => food.fdcId === id)
  );
  const food = dataset?.foods.find((food) => food.fdcId === id);
  if (!food) throw new Error("Missing official record " + id);
  const nutrient = (...ids) => {
    for (const id of ids) {
      const value = food.foodNutrients.find(
        (n) => n.nutrient?.id === id
      )?.amount;
      if (typeof value === "number" && Number.isFinite(value)) return value;
    }
    throw new Error("Missing nutrient in " + food.fdcId);
  };
  return {
    ...details,
    fdcId: id,
    dataType: food.dataType,
    description: food.description,
    macros: {
      kcal: nutrient(2048, 1008, 2047),
      protein: nutrient(1003),
      carbs: nutrient(1005),
      fat: nutrient(1004),
    },
  };
});
console.log("// Sources: https://fdc.nal.usda.gov/download-datasets/");
console.log(
  "// Foundation: April 2026; SR Legacy: final April 2018 release. Reviewed 2026-10-21."
);
console.log(
  "// Source JSON SHA256: " + datasets.map((data) => data.sha256).join(", ")
);
console.log("export const WHOLE_FOOD_REFERENCE = [");
for (const row of rows) console.log("  " + JSON.stringify(row) + ",");
console.log("] as const;");

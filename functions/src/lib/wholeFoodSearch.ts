import type { FoodItem } from "../nutritionSearch.js";
import { WHOLE_FOOD_REFERENCE } from "../data/wholeFoodReference.js";

export const normalizeWholeFoodQuery = (query: string) =>
  query
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

const COMMON_WORDS = new Set([
  "raw",
  "uncooked",
  "cooked",
  "roasted",
  "roast",
  "grilled",
  "plain",
  "fresh",
  "generic",
  "organic",
  "lean",
  "fat",
  "meat",
  "ground",
  "minced",
  "mince",
  "beef",
  "chicken",
  "breast",
  "breasts",
  "thigh",
  "thighs",
  "drumstick",
  "drumsticks",
  "wing",
  "wings",
  "skin",
  "skinless",
  "skinon",
  "skin-on",
  "on",
  "off",
  "with",
  "without",
  "and",
  "only",
  "boneless",
  "percent",
]);

/** Null means this is not a supported plain-food query; do not reinterpret
 * brands, sauces, prepared dishes, or unsupported cuts as plain meat. */
export function curatedWholeFoods(query: string): FoodItem[] | null {
  const normalized = normalizeWholeFoodQuery(query);
  const tokens = normalized.split(" ").filter(Boolean);
  const family = tokens.includes("beef")
    ? "beef"
    : tokens.includes("chicken")
      ? "chicken"
      : null;
  if (
    !family ||
    tokens.some((token) => !COMMON_WORDS.has(token) && !/^\d{1,3}$/.test(token))
  )
    return null;
  if (tokens.includes("beef") && tokens.includes("chicken")) return null;
  if (
    family === "chicken" &&
    tokens.some((token) =>
      ["ground", "minced", "mince", "lean", "fat"].includes(token)
    )
  )
    return null;
  // A cooking method must match the actual reference, not merely "cooked".
  if (
    tokens.some((token) => ["grilled", "roast"].includes(token)) ||
    (family === "beef" && tokens.includes("roasted"))
  )
    return null;
  const raw = tokens.some((token) => ["raw", "uncooked"].includes(token));
  const cooked = tokens.some((token) => ["cooked", "roasted"].includes(token));
  if (raw && cooked) return null;
  const requestedState = raw ? "raw" : cooked ? "cooked" : null;
  const numbers = tokens.filter((token) => /^\d+$/.test(token)).map(Number);
  let lean: number | undefined;
  if (family === "beef" && numbers.length) {
    if (numbers.length === 2 && numbers[0] + numbers[1] === 100)
      lean = Math.max(...numbers);
    else if (numbers.length === 1)
      lean =
        numbers[0] < 50 && tokens.includes("fat")
          ? 100 - numbers[0]
          : numbers[0];
    else return null;
    if (![80, 85, 90, 93, 95, 97].includes(lean)) return null;
  } else if (numbers.length) return null;
  const cut = ["breast", "thigh", "drumstick", "wing"].find(
    (cut) => tokens.includes(cut) || tokens.includes(cut + "s")
  );
  if (family === "beef" && cut) return null;
  const skinless =
    tokens.includes("skinless") ||
    (tokens.includes("skin") &&
      (tokens.includes("without") || tokens.includes("off"))) ||
    (tokens.includes("meat") && tokens.includes("only"));
  const skinOn =
    tokens.includes("skinon") || (tokens.includes("skin") && !skinless);
  let choices = WHOLE_FOOD_REFERENCE.filter(
    (row) =>
      row.family === family &&
      (!requestedState || row.state === requestedState) &&
      (lean === undefined || ("lean" in row && row.lean === lean)) &&
      (!cut || row.cut === cut) &&
      (!skinless || ("skin" in row && row.skin === "skinless")) &&
      (!skinOn || ("skin" in row && row.skin === "skin-on")) &&
      (!tokens.includes("boneless") ||
        ("skin" in row && row.skin === "skinless"))
  );
  if (!choices.length) return null;
  // Never silently supply another cooking method or composition.
  if (tokens.includes("roasted"))
    choices = choices.filter(
      (row) => row.family === "chicken" && row.state === "cooked"
    );
  return choices.map((row) => {
    const macros = {
      kcal: row.macros.kcal,
      protein: row.macros.protein,
      // USDA "carbohydrate by difference" can be slightly negative for meat.
      // Keep the source table intact, but never log negative carbohydrate grams.
      carbs: Math.max(0, row.macros.carbs),
      fat: row.macros.fat,
    };
    const per100 = {
      kcal: macros.kcal,
      protein_g: macros.protein,
      carbs_g: macros.carbs,
      fat_g: macros.fat,
    };
    return {
      id: `canonical:whole:${row.fdcId}`,
      name: row.name,
      brand: null,
      source: "USDA",
      fdcId: row.fdcId,
      basePer100g: macros,
      servings: [
        {
          id: `fdc-${row.fdcId}-100g`,
          label: "100 g edible portion",
          grams: 100,
          isDefault: true,
        },
      ],
      serving: { qty: 100, unit: "g", text: "100 g edible portion" },
      per_serving: per100,
      per_100g: per100,
      wholeFood: {
        category: row.family,
        preparation: row.state,
        sourceDescription: row.description,
        reviewedAt: "2026-10-21",
        ...("lean" in row ? { leanPercent: row.lean } : {}),
      },
    };
  });
}

const STAPLE_WORDS = new Set([
  "banana",
  "bananas",
  "apple",
  "apples",
  "potato",
  "potatoes",
  "sweet",
  "rice",
  "white",
  "brown",
  "jasmine",
  "basmati",
  "oats",
  "oatmeal",
  "rolled",
  "steel",
  "cut",
  "broccoli",
  "spinach",
  "carrot",
  "carrots",
  "salmon",
  "tuna",
  "beef",
  "ground",
  "chicken",
  "breast",
  "thigh",
  "skinless",
  "skin",
  "on",
  "off",
  "raw",
  "cooked",
  "dry",
  "uncooked",
  "fresh",
  "frozen",
  "plain",
  "generic",
  "boiled",
  "baked",
  "roasted",
  "boneless",
  "lean",
  "fat",
  "meat",
  "only",
  "egg",
  "eggs",
  "whole",
  "large",
  "small",
  "medium",
  "extra",
  "jumbo",
  "white",
  "whites",
  "yolk",
  "yolks",
]);
export function isPlainWholeFoodQuery(query: string): boolean {
  const tokens = normalizeWholeFoodQuery(query).split(" ");
  return (
    tokens.length > 0 &&
    tokens.every((token) => STAPLE_WORDS.has(token) || /^\d+$/.test(token)) &&
    tokens.some((token) =>
      [
        "banana",
        "bananas",
        "apple",
        "apples",
        "potato",
        "potatoes",
        "rice",
        "oats",
        "oatmeal",
        "broccoli",
        "spinach",
        "carrot",
        "carrots",
        "salmon",
        "tuna",
        "beef",
        "chicken",
        "egg",
        "eggs",
      ].includes(token)
    )
  );
}
export function preferWholeFoodMatches(
  items: FoodItem[],
  query: string
): FoodItem[] {
  if (!isPlainWholeFoodQuery(query)) return items;
  const plain = items.filter(
    (item) =>
      !item.brand &&
      item.source === "USDA" &&
      ["Foundation", "SR Legacy"].includes(
        (item.raw as { dataType?: string })?.dataType ?? ""
      )
  );
  if (!plain.length) return items;
  const seen = new Set<string>();
  return plain.filter((item) => {
    // Exact description duplicates only. Keep different cuts, skin, fat ratios,
    // preparation, and added ingredients separate; never average their macros.
    const key = normalizeWholeFoodQuery(item.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

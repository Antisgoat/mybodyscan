import assert from "node:assert/strict";
import test from "node:test";
import { scrubUndefined } from "../src/lib/scrub.ts";

function hasUndefined(value) {
  if (value === undefined) {
    return true;
  }
  if (value === null || typeof value !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some((entry) => hasUndefined(entry));
  }
  return Object.values(value).some((entry) => hasUndefined(entry));
}

test("scrubUndefined removes undefined serving metadata", () => {
  const payload = {
    meals: [
      {
        id: "meal-1",
        name: "Protein Shake",
        item: {
          name: "Whey",
          brand: "Acme",
          serving: {
            qty: 1,
            unit: "scoop",
            originalQty: undefined,
            originalUnit: undefined,
          },
        },
      },
    ],
  };
  const scrubbed = scrubUndefined(payload);
  const serving = scrubbed.meals[0]?.item?.serving;
  assert.ok(serving);
  assert.equal("originalQty" in serving, false);
  assert.equal("originalUnit" in serving, false);
  assert.equal(hasUndefined(scrubbed), false);
});

test("scrubUndefined preserves fully defined meal payloads", () => {
  const payload = {
    meals: [
      {
        id: "meal-2",
        name: "Oatmeal",
        protein: 12,
        carbs: 50,
        fat: 8,
        calories: 320,
        item: {
          id: "food-123",
          name: "Oats",
          brand: "Acme",
          serving: { qty: 1, unit: "cup" },
        },
      },
    ],
    totals: { calories: 320, protein: 12, carbs: 50, fat: 8, alcohol: 0 },
  };
  const scrubbed = scrubUndefined(payload);
  assert.deepEqual(scrubbed, payload);
  assert.equal(hasUndefined(scrubbed), false);
});

test("scrubUndefined removes undefined entries from arrays", () => {
  const payload = {
    meals: [
      {
        id: "meal-3",
        name: "Salad",
        tags: ["lunch", undefined, "greens"],
      },
    ],
  };
  const scrubbed = scrubUndefined(payload);
  const tags = scrubbed.meals[0]?.tags ?? [];
  assert.deepEqual(tags, ["lunch", "greens"]);
  assert.equal(hasUndefined(scrubbed), false);
});

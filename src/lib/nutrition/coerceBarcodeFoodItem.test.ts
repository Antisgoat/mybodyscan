import { describe, expect, it } from "vitest";

import { coerceBarcodeFoodItem } from "./coerceBarcodeFoodItem";

describe("coerceBarcodeFoodItem", () => {
  it("preserves complete normalized nutrients returned by the backend", () => {
    const rawProduct = {
      code: "12345678",
      nutriments: { fiber_100g: 6, sodium_100g: 0.2 },
    };
    const item = coerceBarcodeFoodItem("12345678", {
      id: "12345678",
      name: "Original product",
      brand: "Example",
      source: "Open Food Facts",
      basePer100g: { kcal: 245, protein: 12, carbs: 30, fat: 8 },
      servings: [{ id: "100g", label: "100 g", grams: 100, isDefault: true }],
      serving: { qty: 100, unit: "g", text: "100 g" },
      per_serving: {
        kcal: 245,
        protein_g: 12,
        carbs_g: 30,
        fat_g: 8,
      },
      per_100g: {
        kcal: 245,
        protein_g: 12,
        carbs_g: 30,
        fat_g: 8,
      },
      raw: rawProduct,
    });

    expect(item?.basePer100g).toEqual({
      kcal: 245,
      protein: 12,
      carbs: 30,
      fat: 8,
    });
    expect(item?.per_serving.kcal).toBe(245);
    expect(item?.raw).toBe(rawProduct);
  });

  it("supports a legacy flat provider response without inventing a product", () => {
    const item = coerceBarcodeFoodItem("87654321", {
      code: "87654321",
      product_name: "Legacy food",
      calories: 120,
      protein_g: 4,
      carbs_g: 20,
      fat_g: 3,
    });

    expect(item?.id).toBe("87654321");
    expect(item?.name).toBe("Legacy food");
    expect(item?.basePer100g.kcal).toBe(120);
    expect(coerceBarcodeFoodItem("12345678", null)).toBeNull();
  });
});

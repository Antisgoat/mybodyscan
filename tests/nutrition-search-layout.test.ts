import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const searchSource = readFileSync(
  resolve(process.cwd(), "src/features/meals/NutritionSearch.tsx"),
  "utf8"
);
const mealsSource = readFileSync(
  resolve(process.cwd(), "src/pages/Meals.tsx"),
  "utf8"
);

describe("nutrition search mobile layout", () => {
  it("contains results inside a shrinking grid with full-size Add targets", () => {
    expect(searchSource).toContain(
      "grid-cols-[minmax(0,1fr)_auto] items-center"
    );
    expect(searchSource).toContain("min-h-11 min-w-14");
    expect(searchSource).toContain("overflow-x-hidden");
  });

  it("keeps the add-food dialog inside the mobile viewport", () => {
    expect(mealsSource).toContain("w-[calc(100vw-1rem)]");
    expect(mealsSource).toContain("max-w-[calc(100vw-1rem)]");
    expect(mealsSource).toContain("overflow-x-hidden");
  });
});

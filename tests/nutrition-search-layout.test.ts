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
const rowSource = readFileSync(
  resolve(process.cwd(), "src/components/nutrition/FoodSearchRow.tsx"),
  "utf8"
);

describe("nutrition search mobile layout", () => {
  it("contains results inside shrinking rows with full-size Add targets", () => {
    expect(rowSource).toContain("flex min-w-0 items-center");
    expect(rowSource).toContain("h-11 w-11 shrink-0");
    expect(rowSource).toContain("line-clamp-2 break-words");
    expect(searchSource).toContain("overflow-x-hidden");
  });

  it("keeps the add-food dialog inside the mobile viewport", () => {
    expect(mealsSource).toContain("w-[calc(100vw-1rem)]");
    expect(mealsSource).toContain("max-w-[calc(100vw-1rem)]");
    expect(mealsSource).toContain("overflow-x-hidden");
  });

  it("reveals ranked results in a short, progressive list", () => {
    expect(searchSource).toContain("const INITIAL_RESULT_COUNT = 8");
    expect(searchSource).toContain("slice(0, visibleResultCount)");
    expect(searchSource).toMatch(/Show\s*\{/);
  });
});

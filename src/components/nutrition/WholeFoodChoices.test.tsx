import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { FoodItem } from "@/lib/nutrition/types";
import { useWholeFoodChoices, WholeFoodWeightFilter } from "./WholeFoodChoices";
const food = (id: string, preparation: "raw" | "cooked", leanPercent = 93) =>
  ({
    id,
    name: `Ground beef ${leanPercent}/${100 - leanPercent}, ${preparation}`,
    wholeFood: { category: "beef", preparation, leanPercent },
  }) as FoodItem;
const choices = [
  food("raw93", "raw"),
  food("cooked93", "cooked"),
  food("raw90", "raw", 90),
  food("cooked90", "cooked", 90),
];
function Preview({ foods = choices }: { foods?: FoodItem[] }) {
  const { visibleFoods, weightFilter } = useWholeFoodChoices(foods);
  return (
    <>
      {weightFilter && <WholeFoodWeightFilter {...weightFilter} />}
      <ul>
        {visibleFoods.map((food) => (
          <li key={food.id}>{food.name}</li>
        ))}
      </ul>
    </>
  );
}
afterEach(cleanup);
it("shows a short raw list first and changes weight state locally without mixing lean blends", () => {
  render(<Preview />);
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
  expect(screen.getByText("Ground beef 93/7, raw")).toBeTruthy();
  expect(screen.getByText("Ground beef 90/10, raw")).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "Raw weight" })
      .getAttribute("aria-pressed")
  ).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Cooked weight" }));
  expect(screen.queryByText("Ground beef 93/7, raw")).toBeNull();
  expect(screen.getByText("Ground beef 93/7, cooked")).toBeTruthy();
});
it("does not hide or relabel foods when search already specifies a weight state", () => {
  render(<Preview foods={[food("cooked93", "cooked")]} />);
  expect(screen.queryByRole("button", { name: "Raw weight" })).toBeNull();
  expect(screen.getByText("Ground beef 93/7, cooked")).toBeTruthy();
});
it("keeps normal packaged or mixed search results intact", () => {
  render(
    <Preview
      foods={[
        { id: "rice", name: "Packaged meal" } as FoodItem,
        food("raw93", "raw"),
      ]}
    />
  );
  expect(screen.queryByRole("button", { name: "Cooked weight" })).toBeNull();
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
});
it("resets weight-state selection for a different result set", () => {
  const { rerender } = render(<Preview />);
  fireEvent.click(screen.getByRole("button", { name: "Cooked weight" }));
  rerender(
    <Preview
      foods={[food("raw85", "raw", 85), food("cooked85", "cooked", 85)]}
    />
  );
  expect(screen.getByText("Ground beef 85/15, raw")).toBeTruthy();
});

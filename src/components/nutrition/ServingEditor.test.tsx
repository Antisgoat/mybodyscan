import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ServingEditor } from "./ServingEditor";
import { FoodSearchRow } from "./FoodSearchRow";
import type { FoodItem } from "@/lib/nutrition/types";

const beef: FoodItem = {
  id: "beef-cooked",
  name: "BEEF, GROUND, 90% LEAN, COOKED",
  brand: null,
  source: "USDA",
  basePer100g: { kcal: 230, protein: 28, carbs: 0, fat: 12 },
  servings: [{ id: "100g", label: "100 g", grams: 100, isDefault: true }],
  serving: { qty: 100, unit: "g", text: "100 g" },
  per_serving: { kcal: 230, protein_g: 28, carbs_g: 0, fat_g: 12 },
  per_100g: { kcal: 230, protein_g: 28, carbs_g: 0, fat_g: 12 },
};
afterEach(cleanup);

it("shows source calories and explicit macro names beside the correct portion", () => {
  render(<FoodSearchRow item={beef} onSelect={vi.fn()} />);
  expect(screen.getByText("Beef, Ground, 90% Lean, Cooked")).toBeTruthy();
  expect(screen.getByText("100 g")).toBeTruthy();
  expect(screen.getByText("230")).toBeTruthy();
  expect(screen.getByText("Protein")).toBeTruthy();
  expect(screen.getByText("Carbs")).toBeTruthy();
  expect(screen.getByText("Fat")).toBeTruthy();
});

it("keeps quantity editable when cleared and scales all nutrients from the same portion", () => {
  const confirm = vi.fn();
  render(<ServingEditor item={beef} onConfirm={confirm} />);
  const input = screen.getByLabelText("Quantity");
  fireEvent.change(input, { target: { value: "" } });
  expect(
    (screen.getByRole("button", { name: "Add to diary" }) as HTMLButtonElement)
      .disabled
  ).toBe(true);
  fireEvent.change(input, { target: { value: "150" } });
  fireEvent.change(screen.getByLabelText("Portion"), {
    target: { value: "g" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add to diary" }));
  expect(confirm).toHaveBeenCalledWith(
    expect.objectContaining({
      qty: 150,
      unit: "g",
      result: { grams: 150, calories: 345, protein: 42, carbs: 0, fat: 18 },
      meal: expect.objectContaining({
        calories: 345,
        protein: 42,
        carbs: 0,
        fat: 18,
      }),
    })
  );
});

it("disables portion changes and repeat submissions while saving", () => {
  const confirm = vi.fn();
  render(<ServingEditor item={beef} busy onConfirm={confirm} />);
  expect((screen.getByLabelText("Quantity") as HTMLInputElement).disabled).toBe(
    true
  );
  expect((screen.getByLabelText("Portion") as HTMLSelectElement).disabled).toBe(
    true
  );
  fireEvent.click(screen.getByRole("button", { name: "Saving to diary…" }));
  expect(confirm).not.toHaveBeenCalled();
});

it("does not disguise unknown nutrients as zero", () => {
  render(
    <FoodSearchRow
      item={
        {
          ...beef,
          basePer100g: undefined,
          per_100g: undefined,
          per_serving: {
            kcal: null,
            protein_g: null,
            carbs_g: null,
            fat_g: null,
          },
        } as unknown as FoodItem
      }
      onSelect={vi.fn()}
    />
  );
  expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  expect(screen.queryByText("0")).toBeNull();
});

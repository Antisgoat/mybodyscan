import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FoodItem } from "@/lib/nutrition/types";

const mocks = vi.hoisted(() => ({
  search: vi.fn(),
  save: vi.fn(),
  uid: "review-user",
  demo: false,
}));
vi.mock("@/lib/api/nutrition", () => ({ nutritionSearch: mocks.search }));
vi.mock("@/lib/nutritionCollections", () => ({ saveRecipe: mocks.save }));
vi.mock("@/auth/mbs-auth", () => ({
  useAuthUser: () => ({ user: mocks.uid ? { uid: mocks.uid } : null }),
}));
vi.mock("@/components/DemoModeProvider", () => ({
  useDemoMode: () => mocks.demo,
}));
import { FridgeRecipeCalculator } from "./FridgeRecipeCalculator";

const food: FoodItem = {
  id: "spinach-fixture",
  name: "Spinach, raw",
  brand: null,
  source: "USDA",
  basePer100g: { kcal: 200, protein: 20, carbs: 10, fat: 5 },
  servings: [{ id: "100g", label: "100 g", grams: 100, isDefault: true }],
  serving: { qty: 1, unit: "serving", text: "100 g" },
  per_serving: { kcal: 200, protein_g: 20, carbs_g: 10, fat_g: 5 },
};
const meal = {
  title: "Spinach bowl",
  summary: "Test idea",
  uses: ["Spinach"],
  optional: ["Oil"],
  steps: ["Cook safely."],
  estimatedMinutes: 10,
  whyItFits: "Uses confirmed foods.",
  safetyNote: "Check labels.",
};
const app = () => (
  <MemoryRouter>
    <FridgeRecipeCalculator meal={meal} servings={2} />
  </MemoryRouter>
);
const open = () =>
  fireEvent.click(
    screen.getByRole("button", { name: "Calculate portions & macros" })
  );
const review = () =>
  screen.getByRole("checkbox", { name: /I checked every ingredient/ });
async function measure() {
  fireEvent.click(screen.getByRole("button", { name: "Measure Spinach" }));
  fireEvent.click(screen.getByRole("button", { name: "Search", exact: true }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Review Spinach, raw" })
  );
  fireEvent.click(screen.getByRole("button", { name: "Use this portion" }));
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.uid = "review-user";
  mocks.demo = false;
  mocks.search.mockResolvedValue({ status: "ok", results: [food] });
  mocks.save.mockResolvedValue("saved-recipe");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("fridge idea to measured recipe", () => {
  it("requires every ingredient to be measured or explicitly omitted", async () => {
    render(app());
    open();
    expect(review().getAttribute("data-disabled")).not.toBeNull();
    await measure();
    expect(screen.getByText(/Per-serving subtotal/)).toBeTruthy();
    expect(mocks.search).toHaveBeenCalledTimes(1);
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Not using Oil" }));
    expect(screen.getByText("Calculated per serving")).toBeTruthy();
    fireEvent.click(review());
    fireEvent.click(screen.getByRole("button", { name: "Save to my recipes" }));
    await screen.findByRole("button", { name: "Recipe saved" });
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: meal.title,
        servings: 2,
        ingredients: [{ item: food, qty: 1, unit: "serving" }],
      }),
      "review-user"
    );
    expect(
      screen.getByText(/Nothing was added to your diary automatically/)
    ).toBeTruthy();
  });
  it("recalculates servings locally and invalidates the review", async () => {
    render(app());
    open();
    await measure();
    fireEvent.click(screen.getByRole("button", { name: "Not using Oil" }));
    fireEvent.click(review());
    fireEvent.change(screen.getByLabelText("Servings in the whole recipe"), {
      target: { value: "4" },
    });
    expect(review().getAttribute("data-state")).toBe("unchecked");
    expect(screen.getByText("50")).toBeTruthy();
    expect(mocks.search).toHaveBeenCalledTimes(1);
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Servings in the whole recipe"), {
      target: { value: "1.5" },
    });
    expect(screen.getByText(/whole number of servings/)).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Save to my recipes",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
  });
  it("shows an actionable search error without losing the recipe", async () => {
    mocks.search.mockRejectedValue(new Error("offline"));
    render(app());
    open();
    fireEvent.click(screen.getByRole("button", { name: "Measure Spinach" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Search", exact: true })
    );
    await screen.findByText(/Could not search foods/);
    expect(screen.getByText("Spinach bowl")).toBeTruthy();
  });
  it("retries a failed save with the same recipe id and prevents duplicate clicks", async () => {
    mocks.save.mockRejectedValueOnce(new Error("offline"));
    render(app());
    open();
    await measure();
    fireEvent.click(screen.getByRole("button", { name: "Not using Oil" }));
    fireEvent.click(review());
    const save = screen.getByRole("button", { name: "Save to my recipes" });
    fireEvent.click(save);
    fireEvent.click(save);
    await screen.findByText(/Could not confirm the save/);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Save to my recipes" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
    expect(mocks.save.mock.calls[0][0].id).toBe(mocks.save.mock.calls[1][0].id);
  });
  it("does not offer live calculations to guests", () => {
    mocks.demo = true;
    render(app());
    expect(
      (
        screen.getByRole("button", {
          name: "Calculate portions & macros",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
  });

  it("requires a fresh review while a portion is being edited", async () => {
    render(app());
    open();
    await measure();
    fireEvent.click(screen.getByRole("button", { name: "Not using Oil" }));
    fireEvent.click(review());
    fireEvent.click(screen.getByRole("button", { name: "Measure Spinach" }));
    expect(review().getAttribute("data-state")).toBe("unchecked");
    expect(
      (
        screen.getByRole("button", {
          name: "Save to my recipes",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
  });

  it("unlocks an unconfirmed save after the deadline without losing portions", async () => {
    render(app());
    open();
    await measure();
    fireEvent.click(screen.getByRole("button", { name: "Not using Oil" }));
    fireEvent.click(review());
    mocks.save.mockReturnValue(new Promise(() => {}));
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Save to my recipes" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_001);
    });
    expect(screen.getByText(/Could not confirm the save/)).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Save to my recipes",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false);
    expect(screen.getByText(/Spinach, raw · 1 serving/)).toBeTruthy();
  });
});

import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  daily: vi.fn(),
  history: vi.fn(),
}));
vi.mock("@/lib/nutritionBackend", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/nutritionBackend")>()),
  addMeal: mocks.add,
  getDailyLog: mocks.daily,
  getNutritionHistory: mocks.history,
}));
vi.mock("@/components/DemoModeProvider", () => ({ useDemoMode: () => false }));
vi.mock("@/lib/useAuthUser", () => ({
  useAuthUser: () => ({ user: { uid: "test-member" }, authReady: true }),
}));
vi.mock("@/hooks/useUnits", () => ({ useUnits: () => ({ units: "metric" }) }));
vi.mock("@/hooks/useUserProfile", () => ({
  useUserProfile: () => ({ profile: {}, plan: null }),
}));
vi.mock("@/hooks/useLatestSuccessfulScan", () => ({
  useLatestSuccessfulScan: () => null,
}));
vi.mock("@/hooks/useSystemHealth", () => ({
  useSystemHealth: () => ({ health: {} }),
}));
vi.mock("@/lib/envStatus", () => ({
  computeFeatureStatuses: () => ({ nutritionConfigured: true }),
}));
vi.mock("@/lib/weeklyReview", () => ({
  subscribeActiveWeeklyReview: () => () => {},
}));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
vi.mock("@/components/Seo", () => ({ Seo: () => null }));
vi.mock("@/components/charts/NutritionMacrosChart", () => ({
  NutritionMacrosChart: () => null,
}));
vi.mock("@/features/meals/NutritionSearch", () => ({ default: () => null }));
vi.mock("@/lib/nutritionCollections", () => ({
  subscribeFavorites: () => () => {},
  subscribeTemplates: () => () => {},
  subscribeCustomFoods: () => () => {},
  subscribeRecipes: () => () => {},
  saveTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
}));
import Meals from "./Meals";
const entry = {
  id: "existing-beef",
  name: "Cooked beef",
  mealType: "lunch",
  calories: 230,
  protein: 28,
  carbs: 0,
  fat: 12,
  serving: { qty: 1, unit: "serving", grams: 100 },
  item: {
    id: "beef",
    name: "Cooked beef",
    source: "USDA",
    serving: { qty: 100, unit: "g", text: "100 g" },
    per_serving: { kcal: 230, protein_g: 28, carbs_g: 0, fat_g: 12 },
    per_100g: { kcal: 230, protein_g: 28, carbs_g: 0, fat_g: 12 },
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  mocks.daily.mockResolvedValue({
    meals: [entry],
    totals: { calories: 230, protein: 28, carbs: 0, fat: 12 },
  });
  mocks.history.mockResolvedValue([]);
  mocks.add.mockImplementation(async (_date, meal) => ({
    meal,
    totals: { calories: meal.calories },
  }));
});
afterEach(cleanup);

it("editing a portion updates the existing meal ID and meal bucket without adding another row", async () => {
  render(
    <MemoryRouter>
      <Meals />
    </MemoryRouter>
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Edit", exact: true })
  );
  fireEvent.change(screen.getByLabelText("Quantity"), {
    target: { value: "2" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(mocks.add).toHaveBeenCalledTimes(1));
  expect(mocks.add.mock.calls[0][1]).toMatchObject({
    id: "existing-beef",
    mealType: "lunch",
    calories: 460,
    protein: 56,
  });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(
    within(
      screen.getByRole("region", { name: "Meals by time of day" })
    ).getAllByText("Cooked beef", { exact: true })
  ).toHaveLength(1);
});

it("keeps an unsuccessful edit open for retry and reuses its meal ID", async () => {
  mocks.add.mockRejectedValueOnce(new Error("Connection interrupted"));
  render(
    <MemoryRouter>
      <Meals />
    </MemoryRouter>
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Edit", exact: true })
  );
  fireEvent.change(screen.getByLabelText("Quantity"), {
    target: { value: "2" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await screen.findByRole("alert");
  expect((screen.getByLabelText("Quantity") as HTMLInputElement).value).toBe(
    "2"
  );
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(mocks.add).toHaveBeenCalledTimes(2));
  expect(mocks.add.mock.calls[1][1].id).toBe("existing-beef");
});

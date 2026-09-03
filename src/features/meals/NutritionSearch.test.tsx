import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ search: vi.fn(), add: vi.fn() }));
vi.mock("@/lib/api/nutrition", () => ({ nutritionSearch: mocks.search }));
vi.mock("@/lib/nutritionBackend", () => ({ addMeal: mocks.add }));
vi.mock("@/lib/useAuthUser", () => ({
  useAuthUser: () => ({ user: { uid: "test-member" }, loading: false }),
}));
vi.mock("@/hooks/useSystemHealth", () => ({
  useSystemHealth: () => ({ health: {} }),
}));
vi.mock("@/lib/envStatus", () => ({
  computeFeatureStatuses: () => ({ nutritionConfigured: true }),
}));
vi.mock("@/components/DemoModeProvider", () => ({ useDemoMode: () => false }));
vi.mock("@/lib/demoToast", () => ({ demoToast: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
vi.mock("@/features/barcode/useZxing", () => ({
  cameraAvailable: () => true,
  isSecureContextOrLocal: () => true,
}));
vi.mock("@/features/barcode/BarcodeScanner", () => ({
  default: ({
    open,
    onDetected,
  }: {
    open: boolean;
    onDetected: (code: string) => void;
  }) =>
    open ? (
      <button onClick={() => onDetected("012345678905")}>
        Detect test barcode
      </button>
    ) : null,
}));
vi.mock("@/components/nutrition/ServingEditor", () => ({
  ServingEditor: ({
    onConfirm,
    busy,
  }: {
    onConfirm: (payload: { meal: { name: string; calories: number } }) => void;
    busy: boolean;
  }) => (
    <button
      disabled={busy}
      onClick={() =>
        onConfirm({ meal: { name: "Chicken breast", calories: 165 } })
      }
    >
      Confirm serving
    </button>
  ),
}));
import NutritionSearch from "./NutritionSearch";

const food = {
  id: "chicken",
  name: "Chicken breast",
  source: "USDA",
  brand: null,
  per_serving: { kcal: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6 },
  serving: { qty: 100, unit: "g", text: "100 g" },
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.search.mockResolvedValue({ status: "ok", results: [food] });
  mocks.add.mockResolvedValue({
    meal: { name: "Chicken breast" },
    totals: { calories: 165 },
  });
});
afterEach(cleanup);
async function search() {
  fireEvent.change(screen.getByLabelText("Search foods or enter a barcode"), {
    target: { value: "chicken" },
  });
  fireEvent.click(screen.getByTestId("nutrition-search-button"));
  await screen.findByRole("button", { name: "Add", exact: true });
}

it("searches the detected barcode instead of the previous text", async () => {
  render(<NutritionSearch />);
  fireEvent.change(screen.getByLabelText("Search foods or enter a barcode"), {
    target: { value: "chicken" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Scan barcode" }));
  fireEvent.click(screen.getByRole("button", { name: "Detect test barcode" }));
  await waitFor(() =>
    expect(mocks.search).toHaveBeenCalledWith("012345678905")
  );
  expect(mocks.search).not.toHaveBeenCalledWith("chicken");
});

it("clearing a pending search releases loading and ignores its stale response", async () => {
  let resolve: (value: {
    status: string;
    results: (typeof food)[];
  }) => void = () => {};
  mocks.search.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  render(<NutritionSearch />);
  const input = screen.getByLabelText("Search foods or enter a barcode");
  fireEvent.change(input, { target: { value: "chicken" } });
  fireEvent.submit(input.closest("form")!);
  fireEvent.change(input, { target: { value: "" } });
  fireEvent.submit(input.closest("form")!);
  fireEvent.change(input, { target: { value: "banana" } });
  expect(
    (screen.getByTestId("nutrition-search-button") as HTMLButtonElement)
      .disabled
  ).toBe(false);
  await act(async () => resolve({ status: "ok", results: [food] }));
  expect(screen.queryByRole("button", { name: "Add", exact: true })).toBeNull();
});

it("logs to the selected diary date and meal bucket, keeping retry identity", async () => {
  mocks.add.mockRejectedValueOnce(new Error("temporary"));
  render(<NutritionSearch dateISO="2026-08-31" defaultMealType="breakfast" />);
  await search();
  fireEvent.click(screen.getByRole("button", { name: "Add", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm serving" }));
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Confirm serving",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false)
  );
  const first = mocks.add.mock.calls[0];
  expect(first[0]).toBe("2026-08-31");
  expect(first[1]).toMatchObject({
    mealType: "breakfast",
    name: "Chicken breast",
  });
  expect(first[1].id).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Confirm serving" }));
  await waitFor(() => expect(mocks.add).toHaveBeenCalledTimes(2));
  expect(mocks.add.mock.calls[1][1].id).toBe(first[1].id);
});

it("shows eight results at a time and reveals more only on request", async () => {
  mocks.search.mockResolvedValue({
    status: "ok",
    results: Array.from({ length: 20 }, (_, index) => ({
      ...food,
      id: `food-${index}`,
      name: `Food ${index}`,
    })),
  });
  render(<NutritionSearch />);
  await act(async () => {
    fireEvent.change(screen.getByLabelText("Search foods or enter a barcode"), {
      target: { value: "chicken" },
    });
    fireEvent.click(screen.getByTestId("nutrition-search-button"));
  });
  expect(
    screen.getAllByRole("button", { name: "Add", exact: true })
  ).toHaveLength(8);
  fireEvent.click(screen.getByRole("button", { name: "Show 8 more" }));
  expect(
    screen.getAllByRole("button", { name: "Add", exact: true })
  ).toHaveLength(16);
});

import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  demo: false,
  pro: true,
  call: vi.fn(),
  prepare: vi.fn(),
  save: vi.fn(),
}));
vi.mock("@/components/DemoModeProvider", () => ({
  useDemoMode: () => mocks.demo,
}));
vi.mock("@/lib/entitlements/store", () => ({
  useEntitlements: () => ({ entitlements: { pro: mocks.pro } }),
}));
vi.mock("@/lib/backend/callBackend", () => ({ callCallable: mocks.call }));
vi.mock("@/lib/gymCapture", () => ({ prepareGymPhoto: mocks.prepare }));
vi.mock("@/lib/nutritionBackend", () => ({ addMeal: mocks.save }));
import MealPhoto from "./MealPhoto";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.demo = false;
  mocks.pro = true;
  mocks.prepare.mockResolvedValue("data:image/jpeg;base64,/9j/AA==");
  mocks.call.mockResolvedValue({
    name: "Rice bowl",
    protein: 20,
    carbs: 50,
    fat: 10,
    grams: 300,
    notes: "Oil is uncertain.",
    requestId: "test-id",
    confidence: 0.85,
  });
  mocks.save.mockResolvedValue({});
});
afterEach(cleanup);
function open() {
  return render(
    <MemoryRouter>
      <MealPhoto />
    </MemoryRouter>
  );
}
async function upload(container: HTMLElement) {
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.change(container.querySelector('input[type="file"]')!, {
    target: {
      files: [new File(["photo"], "meal.jpg", { type: "image/jpeg" })],
    },
  });
  await screen.findByText("Review your estimate");
}
it.each(["demo", "nonmember"])(
  "blocks %s uploads even through a direct file event",
  async (mode) => {
    mocks.demo = mode === "demo";
    mocks.pro = mode !== "nonmember";
    const { container } = open();
    expect(
      (screen.getByRole("button", { name: "Take photo" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [new File(["x"], "meal.jpg", { type: "image/jpeg" })] },
    });
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.call).not.toHaveBeenCalled();
  }
);
it("requires consent and explicit review; saves edited macros once", async () => {
  const { container } = open();
  expect(
    (screen.getByRole("button", { name: "Take photo" }) as HTMLButtonElement)
      .disabled
  ).toBe(true);
  await upload(container);
  expect(mocks.save).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("protein (g)"), {
    target: { value: "30" },
  });
  fireEvent.click(
    screen.getByLabelText(/The identified food matches my photo/)
  );
  fireEvent.click(screen.getByRole("button", { name: "Confirm and log meal" }));
  await screen.findByRole("button", { name: "Saved" });
  expect(mocks.save).toHaveBeenCalledTimes(1);
  expect(mocks.save.mock.calls[0][1]).toMatchObject({
    protein: 30,
    calories: 410,
    id: "photo-test-id",
    entrySource: "photo-estimate",
  });
});
it("keeps a stable entry ID when saving fails and is retried", async () => {
  mocks.save.mockRejectedValueOnce(new Error("offline"));
  const { container } = open();
  await upload(container);
  fireEvent.click(
    screen.getByLabelText(/The identified food matches my photo/)
  );
  fireEvent.click(screen.getByRole("button", { name: "Confirm and log meal" }));
  await screen.findByText(/Could not confirm saving/);
  fireEvent.click(screen.getByRole("button", { name: "Confirm and log meal" }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
  expect(mocks.save.mock.calls[0][1].id).toBe(mocks.save.mock.calls[1][1].id);
});

it("shows a local photo preview and requires matching-food review before logging", async () => {
  const { container } = open();
  await upload(container);
  expect(
    screen
      .getByAltText("Your selected meal photo for comparison")
      .getAttribute("src")
  ).toBe("data:image/jpeg;base64,/9j/AA==");
  expect(screen.getByText(/Wrong food\?/)).toBeTruthy();
  expect(
    (
      screen.getByRole("button", {
        name: "Confirm and log meal",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  expect(screen.queryByText(/85%/)).toBeNull();
  fireEvent.click(
    screen.getByLabelText(/The identified food matches my photo/)
  );
  fireEvent.change(screen.getByLabelText("Meal name"), {
    target: { value: "Corrected bowl" },
  });
  expect(
    (
      screen.getByRole("button", {
        name: "Confirm and log meal",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
});

it("logs half a meal with scaled macros and no new AI request", async () => {
  const { container } = open();
  await upload(container);
  expect(screen.getByText(/Review the totals for the entire photo below/)).toBeTruthy();
  fireEvent.change(
    screen.getByLabelText("How much of the pictured meal did you eat?"),
    { target: { value: "50" } }
  );
  fireEvent.click(
    screen.getByLabelText(/The identified food matches my photo/)
  );
  fireEvent.click(screen.getByRole("button", { name: "Confirm and log meal" }));
  await screen.findByRole("button", { name: "Saved" });
  expect(mocks.call).toHaveBeenCalledTimes(1);
  expect(mocks.save.mock.calls[0][1]).toMatchObject({
    name: "Rice bowl · 50% portion",
    protein: 10,
    carbs: 25,
    fat: 5,
    calories: 185,
  });
});

it("rejects malformed estimator output without exposing a broken review", async () => {
  mocks.call.mockResolvedValue({
    name: "Wrong response",
    requestId: undefined,
  });
  const { container } = open();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.change(container.querySelector('input[type="file"]')!, {
    target: {
      files: [new File(["photo"], "meal.jpg", { type: "image/jpeg" })],
    },
  });
  await screen.findByText(/Photo estimates are unavailable/);
  expect(screen.queryByText("Review your estimate")).toBeNull();
  expect(mocks.save).not.toHaveBeenCalled();
});

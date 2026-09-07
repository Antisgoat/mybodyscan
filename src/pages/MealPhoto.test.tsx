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
  fireEvent.click(screen.getByRole("button", { name: "Confirm and log meal" }));
  await screen.findByText(/Could not confirm saving/);
  fireEvent.click(screen.getByRole("button", { name: "Confirm and log meal" }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
  expect(mocks.save.mock.calls[0][1].id).toBe(mocks.save.mock.calls[1][1].id);
});

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

const mocks = vi.hoisted(() => ({
  callable: vi.fn(),
  prepare: vi.fn(),
  demo: false,
  safety: {
    preferences: { allergies: ["egg"], allergyNotes: "Check every label" },
    loading: false,
    error: null as string | null,
  },
}));
vi.mock("@/lib/backend/callBackend", () => ({ callCallable: mocks.callable }));
vi.mock("@/lib/gymCapture", () => ({ prepareGymPhoto: mocks.prepare }));
vi.mock("@/hooks/useUserProfile", () => ({
  useUserProfile: () => ({ profile: { goal: "maintain", diet: "balanced" } }),
}));
vi.mock("@/hooks/useNutritionSafety", () => ({
  useNutritionSafety: () => mocks.safety,
}));
vi.mock("@/components/DemoModeProvider", () => ({
  useDemoMode: () => mocks.demo,
}));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
vi.mock("@/components/Seo", () => ({ Seo: () => null }));
import FridgeMeals from "./FridgeMeals";

const draft = {
  detected: [
    { name: "Spinach", confidence: 0.95, evidence: "Leaves in a container" },
  ],
  uncertain: [],
  notes: "Review the list.",
};
const ideas = {
  meals: [
    {
      title: "Spinach skillet",
      summary: "A quick meal",
      uses: ["Spinach"],
      optional: ["Oil"],
      steps: ["Cook the spinach."],
      estimatedMinutes: 10,
      whyItFits: "Uses your ingredients.",
      safetyNote: "Check all labels.",
    },
  ],
  notes: "Quantities are not measured.",
};
function app() {
  return (
    <MemoryRouter>
      <FridgeMeals />
    </MemoryRouter>
  );
}
function addIngredient(name = "Spinach") {
  const consent = screen.getByRole("checkbox", { name: /I agree to send/ });
  if (consent.getAttribute("data-state") !== "checked")
    fireEvent.click(consent);
  fireEvent.change(screen.getByLabelText("Add a missed ingredient"), {
    target: { value: name },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add", exact: true }));
}
const generate = () =>
  screen.getByRole("button", {
    name: "Create personalized meal ideas",
  }) as HTMLButtonElement;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.demo = false;
  mocks.safety = {
    preferences: { allergies: ["egg"], allergyNotes: "Check every label" },
    loading: false,
    error: null,
  };
  mocks.prepare.mockResolvedValue("data:image/jpeg;base64,AAAA");
  mocks.callable.mockResolvedValue(draft);
});
afterEach(cleanup);

describe("Fridge Scan member workflow", () => {
  it("copies selected files before resetting the live file input and requires explicit confirmation", async () => {
    render(app());
    fireEvent.click(screen.getByRole("checkbox", { name: /I agree to send/ }));
    const input = screen.getByLabelText(
      "Choose refrigerator and pantry photos"
    ) as HTMLInputElement;
    const photo = new File(["image"], "fridge.jpg", { type: "image/jpeg" });
    let files = [photo];
    Object.defineProperty(input, "files", {
      configurable: true,
      get: () => files,
    });
    Object.defineProperty(input, "value", {
      configurable: true,
      get: () => "",
      set: () => {
        files = [];
      },
    });
    fireEvent.change(input);
    await screen.findByRole("checkbox", { name: "Confirm Spinach" });
    expect(mocks.prepare).toHaveBeenCalledWith(photo, 0, [photo]);
    expect(generate().disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Confirm Spinach" }));
    expect(generate().disabled).toBe(false);
  });

  it("passes reviewed ingredients, integer servings, and saved restrictions; locks editing during the request", async () => {
    let resolve: (value: typeof ideas) => void = () => {};
    mocks.callable.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    render(app());
    addIngredient();
    fireEvent.change(screen.getByLabelText("Servings"), {
      target: { value: "3.4" },
    });
    fireEvent.click(generate());
    expect(mocks.callable).toHaveBeenCalledWith(
      "suggestFridgeMeals",
      expect.objectContaining({
        ingredients: ["Spinach"],
        servings: 3,
        allergies: ["egg"],
        allergyNotes: "Check every label",
        processingConsent: true,
        shoppingMode: "staples",
      })
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Take a photo",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    expect(
      screen.getByLabelText("Servings").closest("fieldset")?.disabled
    ).toBe(true);
    await act(async () => resolve(ideas));
    expect(screen.getByText("Spinach skillet")).toBeTruthy();
    expect(screen.getByText("Quantities are not measured.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Servings"), {
      target: { value: "4" },
    });
    expect(screen.queryByText("Spinach skillet")).toBeNull();
  });

  it("does not generate while allergy preferences are loading or unavailable", () => {
    mocks.safety.loading = true;
    const view = render(app());
    addIngredient();
    expect(generate().disabled).toBe(true);
    mocks.safety.loading = false;
    mocks.safety.error = "Your allergy preferences could not be loaded.";
    view.rerender(app());
    expect(generate().disabled).toBe(true);
    expect(screen.getByText(mocks.safety.error)).toBeTruthy();
    expect(mocks.callable).not.toHaveBeenCalled();
  });

  it("ignores suggestions made for preferences that changed during a request", async () => {
    let resolve: (value: typeof ideas) => void = () => {};
    mocks.callable.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const view = render(app());
    addIngredient();
    fireEvent.click(generate());
    mocks.safety.preferences = { allergies: ["milk"], allergyNotes: "Updated" };
    view.rerender(app());
    await act(async () => resolve(ideas));
    expect(screen.queryByText("Spinach skillet")).toBeNull();
    expect(screen.getByText(/Your preferences changed/)).toBeTruthy();
  });

  it("preserves manual ingredients and offers retry after failure", async () => {
    mocks.callable.mockRejectedValueOnce(new Error("offline"));
    render(app());
    addIngredient();
    fireEvent.click(generate());
    await waitFor(() =>
      expect(screen.getByText(/Your ingredients are still here/)).toBeTruthy()
    );
    expect(screen.getByLabelText("Remove Spinach")).toBeTruthy();
    expect(generate().disabled).toBe(false);
  });

  it("keeps demo mode read-only and provides separate camera and library paths", () => {
    mocks.demo = true;
    render(app());
    expect(
      (
        screen.getByRole("button", {
          name: "Take a photo",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    expect(generate().disabled).toBe(true);
    expect(
      screen.getByLabelText("Take a kitchen photo").getAttribute("capture")
    ).toBe("environment");
    expect(
      screen
        .getByLabelText("Choose refrigerator and pantry photos")
        .hasAttribute("capture")
    ).toBe(false);
  });

  it("does not send photos or preferences without explicit processing consent", () => {
    render(app());
    expect(
      (
        screen.getByRole("button", {
          name: "Choose food photos",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    expect(generate().disabled).toBe(true);
    expect(mocks.callable).not.toHaveBeenCalled();
  });
});

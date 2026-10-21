import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  token: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("@/lib/appCheck", () => ({
  ensureAppCheck: mocks.prepare,
  getAppCheckTokenHeader: async () => ({}),
}));
vi.mock("@/auth/mbs-auth", () => ({ requireIdToken: mocks.token }));
vi.mock("@/lib/firebase", () => ({ functions: {} }));
vi.mock("@/lib/backend/fetchJson", () => ({ fetchJson: mocks.fetch }));
vi.mock("@/lib/platform/isNative", () => ({ isCapacitorNative: () => false }));
import { callRequestFunction } from "./callBackend";
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

it("releases a stuck meal save during auth preparation without starting a late write", async () => {
  vi.useFakeTimers();
  let finish = () => {};
  mocks.prepare.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  mocks.token.mockResolvedValue("token");
  const pending = callRequestFunction(
    "addMeal",
    {},
    { preparationTimeoutMs: 10000 }
  );
  const rejected = expect(pending).rejects.toThrow("Connection took too long");
  await vi.advanceTimersByTimeAsync(10000);
  await rejected;
  finish();
  await vi.advanceTimersByTimeAsync(1);
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it("clears the preparation deadline after a successful save", async () => {
  vi.useFakeTimers();
  mocks.prepare.mockResolvedValue(undefined);
  mocks.token.mockResolvedValue("token");
  mocks.fetch.mockResolvedValue({
    meal: { id: "meal-1" },
    totals: { calories: 70 },
  });
  const result = await callRequestFunction(
    "addMeal",
    {},
    { preparationTimeoutMs: 10000 }
  );
  expect(result).toMatchObject({ meal: { id: "meal-1" } });
  expect(vi.getTimerCount()).toBe(0);
});

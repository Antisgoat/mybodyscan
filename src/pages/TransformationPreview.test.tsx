// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  retry: vi.fn(),
  request: vi.fn(),
  imageError: true,
  promptVersion: "2026-09-17-sunburst-scan-context-v3",
  status: "ready",
  updatedAt: null as Date | null,
}));
vi.mock("@/auth/mbs-auth", () => ({
  useAuthUser: () => ({ user: { uid: "test-user" } }),
}));
vi.mock("@/lib/claims", () => ({ useClaims: () => ({ claims: {} }) }));
vi.mock("@/lib/entitlements/store", () => ({
  useEntitlements: () => ({ entitlements: {} }),
}));
vi.mock("@/lib/entitlements/pro", () => ({ hasPro: () => true }));
vi.mock("@/hooks/useLatestScanForUser", () => ({
  useLatestScanForUser: () => ({ scan: {}, loading: false }),
}));
vi.mock("@/hooks/useUserProfile", () => ({
  useUserProfile: () => ({ profile: { age: 30 }, plan: {} }),
}));
vi.mock("@/lib/scanResultViewModel", () => ({
  buildScanResultViewModel: () => ({ isValidResult: true }),
}));
vi.mock("@/lib/flags", () => ({ TRANSFORMATION_PREVIEW_ENTRY_ENABLED: true }));
vi.mock("@/components/Seo", () => ({ Seo: () => null }));
vi.mock("@/hooks/useTransformationPreviewImage", () => ({
  useTransformationPreviewImage: () => ({
    url: mocks.imageError ? null : "blob:private-preview",
    status: mocks.imageError ? "error" : "ready",
    retry: mocks.retry,
    onImageError: vi.fn(),
  }),
}));
vi.mock("@/lib/transformationPreview", () => ({
  TRANSFORMATION_PREVIEW_PROMPT_VERSION: "2026-09-17-sunburst-scan-context-v3",
  requestTransformationPreview: mocks.request,
  subscribeTransformationPreview: (
    _uid: string,
    _id: string,
    receive: (value: unknown) => void
  ) => {
    receive({
      status: mocks.status,
      updatedAt: mocks.updatedAt,
      storagePath: "transformation-previews/test-user/scan-a/image.jpg",
      goal: "recomp",
      timelineWeeks: 12,
      promptVersion: mocks.promptVersion,
    });
    return vi.fn();
  },
}));

import TransformationPreview from "./TransformationPreview";

beforeEach(() => {
  mocks.retry.mockReset();
  mocks.request.mockReset();
  mocks.imageError = true;
  mocks.promptVersion = "2026-09-17-sunburst-scan-context-v3";
  mocks.status = "ready";
  mocks.updatedAt = null;
});
afterEach(cleanup);
function mountPreview() {
  return render(
    <MemoryRouter initialEntries={["/results/scan-a/transformation-preview"]}>
      <Routes>
        <Route
          path="/results/:scanId/transformation-preview"
          element={<TransformationPreview />}
        />
      </Routes>
    </MemoryRouter>
  );
}

it("shows an actionable download error instead of an endless spinner", () => {
  mountPreview();
  expect(screen.getByRole("alert").textContent).toContain(
    "could not be loaded"
  );
  expect(screen.queryByText(/Securely loading preview/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Retry image download" }));
  expect(mocks.retry).toHaveBeenCalledOnce();
  expect(mocks.request).not.toHaveBeenCalled();
});

it("does not advertise a new version when the current preview is already up to date", () => {
  mocks.imageError = false;
  mountPreview();
  expect(screen.getByRole("img")).toBeTruthy();
  expect(
    screen.queryByText("A clearer goal visualization is available")
  ).toBeNull();
  expect(mocks.request).not.toHaveBeenCalled();
});

it("still offers a genuine older preview an explicit, consent-gated update", () => {
  mocks.imageError = false;
  mocks.promptVersion = "2026-07-31-goal-definition-v2";
  mountPreview();
  expect(
    screen.getByText("A clearer goal visualization is available")
  ).toBeTruthy();
  expect(
    (
      screen.getByRole("button", {
        name: "Create updated preview",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  expect(mocks.request).not.toHaveBeenCalled();
});

it("offers explicit recovery of abandoned generation while keeping the old image", () => {
  mocks.imageError = false;
  mocks.status = "processing";
  mocks.updatedAt = new Date(Date.now() - 11 * 60 * 1000);
  mountPreview();
  expect(screen.getByRole("img")).toBeTruthy();
  expect(screen.getByText("Your update did not finish")).toBeTruthy();
  expect(
    (
      screen.getByRole("button", {
        name: "Retry preview creation",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  expect(mocks.request).not.toHaveBeenCalled();
});

it("does not invite duplicate generation while an existing job is still active", () => {
  mocks.imageError = false;
  mocks.status = "processing";
  mocks.updatedAt = new Date();
  mountPreview();
  expect(
    screen.queryByRole("button", { name: "Retry preview creation" })
  ).toBeNull();
  expect(mocks.request).not.toHaveBeenCalled();
});

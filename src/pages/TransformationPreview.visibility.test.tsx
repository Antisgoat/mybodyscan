// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("@/auth/mbs-auth", () => ({
  useAuthUser: () => ({ user: { uid: "user_1" } }),
}));
vi.mock("@/lib/claims", async () => {
  const actual = await vi.importActual<any>("@/lib/claims");
  return {
    ...actual,
    useClaims: () => ({ claims: null, loading: false, refresh: vi.fn() }),
  };
});
vi.mock("@/lib/entitlements/store", () => ({
  useEntitlements: () => ({ entitlements: null }),
}));
vi.mock("@/lib/entitlements/pro", () => ({ hasPro: () => false }));
vi.mock("@/hooks/useLatestScanForUser", () => ({
  useLatestScanForUser: () => ({ scan: null, loading: false }),
}));
vi.mock("@/hooks/useUserProfile", () => ({
  useUserProfile: () => ({ profile: null, plan: null }),
}));
vi.mock("@/lib/transformationPreview", () => ({
  subscribeTransformationPreview: vi.fn(() => () => undefined),
}));
vi.mock("@/components/Seo", () => ({ Seo: () => null }));

import TransformationPreviewPage, {
  shouldShowTransformationPreviewScaffold,
} from "./TransformationPreview";

describe("TransformationPreview visibility", () => {
  it("keeps the scaffold gated unless the feature flag or internal access is present", () => {
    expect(
      shouldShowTransformationPreviewScaffold({
        featureEnabled: false,
        internalAccess: false,
      })
    ).toBe(false);
    expect(
      shouldShowTransformationPreviewScaffold({
        featureEnabled: true,
        internalAccess: false,
      })
    ).toBe(true);
    expect(
      shouldShowTransformationPreviewScaffold({
        featureEnabled: false,
        internalAccess: true,
      })
    ).toBe(true);
  });

  it("stays hidden from normal customers while feature flag is off", () => {
    render(
      <MemoryRouter initialEntries={["/transformation-preview/scan_1"]}>
        <Routes>
          <Route
            path="/transformation-preview/:scanId"
            element={<TransformationPreviewPage />}
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Transformation Preview")).toBeTruthy();
    expect(
      screen.getByText(/will appear here when it is available for customers/i)
    ).toBeTruthy();
    expect(screen.queryByAltText(/Transformation preview/i)).toBeNull();
  });
});

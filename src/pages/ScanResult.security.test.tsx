// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const getScanMock = vi.fn();
const retryMock = vi.fn();
let claimsMock: any = null;

vi.mock("@/lib/api/scan", async () => {
  const actual = await vi.importActual<any>("@/lib/api/scan");
  return {
    ...actual,
    getScan: (...args: any[]) => getScanMock(...args),
    retryScanProcessingClient: (...args: any[]) => retryMock(...args),
  };
});
vi.mock("@/auth/mbs-auth", () => ({
  useAuthUser: () => ({
    user: { uid: "user_1", email: "u@example.com" },
    authReady: true,
  }),
}));
vi.mock("@/lib/claims", async () => {
  const actual = await vi.importActual<any>("@/lib/claims");
  return {
    ...actual,
    useClaims: () => ({ claims: claimsMock, loading: false, refresh: vi.fn() }),
  };
});
vi.mock("@/hooks/useUnits", () => ({ useUnits: () => ({ units: "us" }) }));
vi.mock("@/hooks/useUserProfile", () => ({
  useUserProfile: () => ({ profile: null, plan: null }),
}));
vi.mock("@/hooks/useAppCheckStatus", () => ({
  useAppCheckStatus: () => ({ status: "ok", tokenPresent: true }),
}));
vi.mock("firebase/firestore", () => ({
  doc: vi.fn(),
  collection: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  getDocs: vi.fn(() => Promise.resolve({ docs: [] })),
  onSnapshot: vi.fn(() => () => undefined),
}));
vi.mock("@/lib/firebase", () => ({
  db: {},
  storage: { app: { options: { storageBucket: "secret-bucket" } } },
}));
vi.mock("@/lib/storage/photoUrlCache", () => ({
  getCachedScanPhotoUrlMaybe: vi.fn(() =>
    Promise.resolve({ url: "", nextRetryAt: null })
  ),
}));
vi.mock("@/components/Seo", () => ({ Seo: () => null }));

import ScanResultPage, { canShowScanDebug } from "./ScanResult";

function renderPage(initialEntry = "/results/scan_1?debug=1") {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/results/:scanId" element={<ScanResultPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ScanResult security", () => {
  beforeEach(() => {
    claimsMock = null;
    getScanMock.mockResolvedValue({
      ok: true,
      data: {
        id: "scan_1",
        uid: "user_1",
        status: "failed",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:01:00Z"),
        completedAt: null,
        errorReason: "raw_provider_timeout",
        errorInfo: { message: "backend secret stack", debugId: "debug-secret" },
        photoPaths: {
          front: "private/front.jpg",
          back: "private/back.jpg",
          left: "private/left.jpg",
          right: "private/right.jpg",
        },
        input: { currentWeightKg: 90, goalWeightKg: 82 },
        estimate: null,
        workoutPlan: null,
        nutritionPlan: null,
      },
    });
  });

  it("requires internal claims or DEV for debug query access", () => {
    expect(
      canShowScanDebug({ claims: null, search: "?debug=1", isDev: false })
    ).toBe(false);
    expect(
      canShowScanDebug({
        claims: { staff: true },
        search: "?debug=1",
        isDev: false,
      })
    ).toBe(true);
    expect(canShowScanDebug({ claims: null, search: "", isDev: true })).toBe(
      false
    );
    expect(
      canShowScanDebug({ claims: null, search: "?debug=1", isDev: true })
    ).toBe(true);
  });

  it("does not expose raw backend details in failed scan customer UI", async () => {
    renderPage("/results/scan_1");
    expect(
      await screen.findByText("We could not complete this scan.")
    ).toBeTruthy();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Retry processing" })
      ).toBeTruthy()
    );
    expect(screen.queryByText(/raw_provider_timeout/i)).toBeNull();
    expect(screen.queryByText(/backend secret stack/i)).toBeNull();
    expect(screen.queryByText(/secret-bucket/i)).toBeNull();
    expect(screen.queryByText(/private\/front\.jpg/i)).toBeNull();
  });
});

// @vitest-environment jsdom

import React from "react";
import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { __authTestInternals } from "@/lib/auth";

vi.mock("@/lib/system", () => {
  return { bootstrapSystem: vi.fn().mockResolvedValue(undefined) };
});

const syncEntitlementsSpy = vi
  .fn()
  .mockResolvedValue({ ok: true, didWrite: false, entitlements: null });
vi.mock("@/lib/entitlements/syncEntitlements", () => {
  return { syncEntitlements: (...args: any[]) => syncEntitlementsSpy(...args) };
});

const upsertSpy = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/auth/userProfileUpsert", () => {
  return { upsertUserRootProfile: (...args: any[]) => upsertSpy(...args) };
});

import { useAuthBootstrap } from "./useAuthBootstrap";

function Harness() {
  useAuthBootstrap();
  return <div>ok</div>;
}

describe("useAuthBootstrap", () => {
  const mockUser = {
    uid: "test-user",
    isAnonymous: false,
    getIdToken: vi.fn().mockResolvedValue("token"),
  } as any;

  beforeEach(() => {
    __authTestInternals.reset();
    upsertSpy.mockClear();
    mockUser.getIdToken.mockClear();
    syncEntitlementsSpy.mockClear();
  });

  it("kicks off non-blocking user profile upsert on sign-in", async () => {
    render(<Harness />);

    act(() => {
      __authTestInternals.emit(mockUser, { authReady: true });
    });

    await waitFor(() => {
      expect(upsertSpy).toHaveBeenCalledTimes(1);
      expect(upsertSpy).toHaveBeenCalledWith(mockUser);
    });
  });

  it("calls syncEntitlements once per sign-in", async () => {
    render(<Harness />);

    act(() => {
      __authTestInternals.emit(mockUser, { authReady: true });
    });

    await waitFor(() => {
      expect(syncEntitlementsSpy).toHaveBeenCalledTimes(1);
    });
  });
});


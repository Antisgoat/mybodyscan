// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { __authTestInternals, useAuthUser } from "./auth";

describe("useAuthUser", () => {
  const mockUser = {
    uid: "test-user",
    isAnonymous: false,
    getIdToken: vi.fn().mockResolvedValue("token"),
  } as any;

  beforeEach(() => {
    __authTestInternals?.reset();
    mockUser.getIdToken.mockClear();
  });

  it("transitions from loading to ready when auth emits a user", async () => {
    const { result, rerender } = renderHook(() => useAuthUser());

    expect(result.current.loading).toBe(true);
    expect(result.current.user).toBeNull();

    act(() => {
      __authTestInternals?.emit(mockUser, { authReady: true });
    });
    rerender();

    expect(__authTestInternals?.snapshot().authReady).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.user).toBe(mockUser);
    });
  });

  it("clears the user snapshot when auth emits null", async () => {
    const { result, rerender } = renderHook(() => useAuthUser());

    act(() => {
      __authTestInternals?.emit(mockUser, { authReady: true });
    });
    rerender();
    await waitFor(() => {
      expect(result.current.user).toBe(mockUser);
    });

    act(() => {
      __authTestInternals?.emit(null, { authReady: true });
    });
    rerender();

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.user).toBeNull();
    });
  });
});

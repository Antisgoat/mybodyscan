import { beforeEach, describe, expect, it, vi } from "vitest";

const { logout } = vi.hoisted(() => ({ logout: vi.fn() }));
vi.mock("@mbs-auth-impl", () => ({ signOut: logout }));
vi.mock("@/lib/pushNotifications", () => ({
  releasePushSession: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/firebase/smokeRead", () => ({ smokeFirestoreRead: vi.fn() }));
import { __authTestInternals, signOutToAuth } from "./mbs-auth";
import { queryClient } from "@/lib/queryClient";
import { getCache, setCache } from "@/lib/cache";

describe("private session boundary", () => {
  beforeEach(() => {
    __authTestInternals.reset();
    queryClient.clear();
    logout.mockReset().mockResolvedValue(undefined);
    window.history.replaceState(null, "", "/meals");
  });
  it("clears previous member data before publishing a different identity", () => {
    __authTestInternals.emit({ uid: "member-a" });
    queryClient.setQueryData(["private-report"], { weight: 80 });
    setCache("private-report", { weight: 80 });
    __authTestInternals.emit({ uid: "member-b" });
    expect(queryClient.getQueryData(["private-report"])).toBeUndefined();
    expect(getCache("private-report")).toBeUndefined();
    expect(__authTestInternals.snapshot().user?.uid).toBe("member-b");
  });
  it("does not discard caches for a routine same-user token refresh", () => {
    __authTestInternals.emit({ uid: "member-a" });
    queryClient.setQueryData(["report"], "retained");
    __authTestInternals.emit({ uid: "member-a" });
    expect(queryClient.getQueryData(["report"])).toBe("retained");
  });
  it("does not claim logout succeeded or navigate away on auth failure", async () => {
    __authTestInternals.emit({ uid: "member-a" });
    logout.mockRejectedValueOnce(new Error("logout failed"));
    await expect(signOutToAuth()).rejects.toThrow("logout failed");
    expect(__authTestInternals.snapshot().user?.uid).toBe("member-a");
    expect(window.location.pathname).toBe("/meals");
  });
  it("removes private caches and the user snapshot after successful logout", async () => {
    __authTestInternals.emit({ uid: "member-a" });
    queryClient.setQueryData(["report"], "private");
    await signOutToAuth();
    expect(__authTestInternals.snapshot().user).toBeNull();
    expect(queryClient.getQueryData(["report"])).toBeUndefined();
    expect(window.location.pathname).toBe("/auth");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchJsonMock = vi.fn();

vi.mock("@/lib/backend/fetchJson", () => ({
  fetchJson: (...args: unknown[]) => fetchJsonMock(...args),
}));

vi.mock("@/auth/mbs-auth", () => ({
  getCurrentUser: vi.fn(),
}));

import { fetchSystemHealth, HEALTH_ENDPOINT } from "./system";

describe("system health routing", () => {
  beforeEach(() => {
    fetchJsonMock.mockReset();
  });

  it("uses the Hosting API route for the lightweight health probe", () => {
    expect(HEALTH_ENDPOINT).toBe("/api/health");
  });

  it("falls back to the API health route when systemHealth is unavailable", async () => {
    fetchJsonMock
      .mockRejectedValueOnce(new Error("system health timeout"))
      .mockResolvedValueOnce({ ok: true });

    await expect(fetchSystemHealth()).resolves.toEqual({
      functionsReachable: true,
    });
    expect(fetchJsonMock).toHaveBeenNthCalledWith(
      1,
      "/systemHealth",
      { method: "GET" },
      3500
    );
    expect(fetchJsonMock).toHaveBeenNthCalledWith(
      2,
      "/api/health",
      { method: "GET" },
      3500
    );
  });
});

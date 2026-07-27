import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

const platform = vi.hoisted(() => ({ native: false }));

vi.mock("@/lib/platform/isNative", () => ({
  isCapacitorNative: () => platform.native,
}));

vi.mock("@/auth/mbs-auth", () => ({
  getIdToken: vi.fn().mockResolvedValue("test-id-token"),
}));

vi.mock("@/lib/appCheck", () => ({
  getAppCheckTokenHeader: vi.fn().mockResolvedValue({}),
}));

import { ApiError, apiFetch } from "./http";
import { getIdToken } from "@/auth/mbs-auth";
import { getAppCheckTokenHeader } from "@/lib/appCheck";

const FUNCTIONS_ORIGIN =
  "https://us-central1-mybodyscan-f3daf.cloudfunctions.net";

beforeEach(() => {
  platform.native = false;
  vi.mocked(getIdToken).mockResolvedValue("test-id-token");
  vi.mocked(getAppCheckTokenHeader).mockResolvedValue({});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ApiError", () => {
  it("captures status and code", () => {
    const e = new ApiError("x", 401, "unauthorized");
    expect(e.status).toBe(401);
    expect(e.code).toBe("unauthorized");
  });
});

describe("apiFetch endpoint resolution", () => {
  it("sends native scan starts to the HTTPS Function instead of capacitor://localhost", async () => {
    platform.native = true;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ scanId: "scan-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    await apiFetch("/api/scan/start", {
      method: "POST",
      body: { currentWeightKg: 84, goalWeightKg: 75 },
      retries: 0,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `${FUNCTIONS_ORIGIN}/startScanSession`,
      expect.objectContaining({ method: "POST" })
    );
  });

  it("keeps web scan starts on the Hosting rewrite", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ scanId: "scan-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    await apiFetch("/api/scan/start", {
      method: "POST",
      body: { currentWeightKg: 84, goalWeightKg: 75 },
      retries: 0,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/scan/start",
      expect.objectContaining({ method: "POST" })
    );
  });
});

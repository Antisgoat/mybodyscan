import { beforeEach, describe, expect, it, vi } from "vitest";

const platform = vi.hoisted(() => ({ native: false }));

vi.mock("@/lib/platform/isNative", () => ({
  isCapacitorNative: () => platform.native,
}));

import { resolveEndpoint } from "@/lib/backend/resolveEndpoint";

const FUNCTIONS_ORIGIN =
  "https://us-central1-mybodyscan-f3daf.cloudfunctions.net";

describe("resolveEndpoint", () => {
  beforeEach(() => {
    platform.native = false;
  });

  it("keeps Hosting rewrite paths same-origin in browsers", () => {
    expect(resolveEndpoint("/api/nutrition/search")).toBe(
      "/api/nutrition/search"
    );
    expect(resolveEndpoint("/api/scan/start")).toBe("/api/scan/start");
  });

  it("routes native REST services through the aggregate HTTP API", () => {
    platform.native = true;

    expect(resolveEndpoint("/api/nutrition/search")).toBe(
      `${FUNCTIONS_ORIGIN}/api/nutrition/search`
    );
    expect(resolveEndpoint("/api/coach/chat")).toBe(
      `${FUNCTIONS_ORIGIN}/api/coach/chat`
    );
  });

  it("routes native scan operations to ordinary HTTP functions", () => {
    platform.native = true;

    expect(resolveEndpoint("/api/scan/start")).toBe(
      `${FUNCTIONS_ORIGIN}/startScanSession`
    );
    expect(resolveEndpoint("/api/scan/submit")).toBe(
      `${FUNCTIONS_ORIGIN}/submitScan`
    );
    expect(resolveEndpoint("/api/scan/delete")).toBe(
      `${FUNCTIONS_ORIGIN}/deleteScan`
    );
  });

  it("preserves query strings on native REST routes", () => {
    platform.native = true;

    expect(resolveEndpoint("/api/nutrition/barcode?code=012345")).toBe(
      `${FUNCTIONS_ORIGIN}/api/nutrition/barcode?code=012345`
    );
  });
});

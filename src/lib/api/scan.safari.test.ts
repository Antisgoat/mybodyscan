import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { submitScanClient } from "@/lib/api/scan";

const apiFetchMock = vi.fn();
const fetchMock = vi.fn();

vi.mock("@/lib/http", () => {
  class ApiError extends Error {
    status = 0;
    constructor(message?: string, status = 0) {
      super(message);
      this.status = status;
    }
  }
  return {
    apiFetch: (...args: any[]) => apiFetchMock(...args),
    ApiError,
  };
});

vi.mock("@/features/scan/resizeImage", () => ({
  prepareScanPhoto: vi.fn(async (file: File) => ({
    preparedFile: file,
    meta: {
      original: { size: file.size, name: file.name, type: file.type },
      prepared: { size: file.size, name: file.name, type: file.type },
      debug: {},
    },
  })),
}));

vi.mock("@/lib/firebase", () => {
  return {
    db: {} as any,
    storage: {} as any,
  };
});

vi.mock("@/auth/client", () => {
  return {
    getCurrentUser: vi.fn(async () => ({ uid: "user-123" })),
    getIdToken: vi.fn(async () => "token"),
    requireIdToken: vi.fn(async () => "token"),
  };
});

describe("submitScanClient on Safari", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).fetch = fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ scanId: "scan-1", status: "queued" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    ) as any;
    Object.defineProperty(window.navigator, "userAgent", {
      value:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the HTTPS function even on Safari and submits once", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "front.jpg", {
      type: "image/jpeg",
    });
    apiFetchMock.mockResolvedValue({ scanId: "scan-1" });
    const result = await submitScanClient({
      scanId: "scan-1",
      photos: { front: file, back: file, left: file, right: file },
      currentWeightKg: 70,
      goalWeightKg: 65,
      unit: "kg",
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
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

vi.mock("@/auth/mbs-auth", () => {
  return {
    getCurrentUser: vi.fn(async () => ({ uid: "user-123" })),
    getIdToken: vi.fn(async () => "token"),
    requireIdToken: vi.fn(async () => "token"),
  };
});

describe("submitScanClient upload pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).fetch = fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ scanId: "scan-1", status: "queued" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    ) as any;
  });

  it("uploads all poses via the HTTPS function before submitting", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "p.jpg", { type: "image/jpeg" });
    apiFetchMock.mockResolvedValue({ scanId: "scan-1" });

    const result = await submitScanClient(
      {
        scanId: "scan-1",
        storagePaths: {
          front: "scans/user-123/scan-1/front.jpg",
          back: "scans/user-123/scan-1/back.jpg",
          left: "scans/user-123/scan-1/left.jpg",
          right: "scans/user-123/scan-1/right.jpg",
        },
        photos: { front: file, back: file, left: file, right: file },
        currentWeightKg: 70,
        goalWeightKg: 65,
        heightCm: 180,
        unit: "kg",
      },
      { overallTimeoutMs: 10_000, stallTimeoutMs: 2_000, perPhotoTimeoutMs: 3_000 }
    );

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(apiFetchMock).not.toHaveBeenCalled();
    const submitCall = fetchMock.mock.calls[0];
    expect(String(submitCall?.[0] ?? "")).toContain("/api/scan/upload");
  });
});

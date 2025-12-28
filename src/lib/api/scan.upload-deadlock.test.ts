import { beforeEach, describe, expect, it, vi } from "vitest";
import { submitScanClient } from "@/lib/api/scan";

const apiFetchMock = vi.fn();
const uploadPhotoMock = vi.fn();

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

vi.mock("@/lib/uploads/uploadPhoto", () => ({
  uploadPhoto: (...args: any[]) => uploadPhotoMock(...args),
}));

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
    auth: {
      currentUser: {
        uid: "user-123",
        getIdToken: vi.fn().mockResolvedValue("token"),
      },
    },
    db: {} as any,
    storage: {} as any,
  };
});

describe("submitScanClient upload pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uploads all poses via Firebase Storage before submitting", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "p.jpg", { type: "image/jpeg" });
    apiFetchMock.mockResolvedValue({ scanId: "scan-1" });
    uploadPhotoMock.mockImplementation(async ({ path }: { path: string }) => ({
      method: "storage",
      storagePath: path,
      downloadURL: `https://example.com/${path}`,
      elapsedMs: 5,
      correlationId: "corr",
    }));

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
      },
      { overallTimeoutMs: 10_000, stallTimeoutMs: 2_000, perPhotoTimeoutMs: 3_000 }
    );

    expect(result.ok).toBe(true);
    expect(uploadPhotoMock).toHaveBeenCalledTimes(4);
    const submitCall = apiFetchMock.mock.calls[0];
    expect(String(submitCall?.[0] ?? "")).toContain("/api/scan/submit");
    const body = submitCall?.[1]?.body;
    expect(body).toMatchObject({
      photoPaths: {
        front: "scans/user-123/scan-1/front.jpg",
      },
      heightCm: 180,
    });
  });
});

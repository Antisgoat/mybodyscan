import { beforeEach, describe, expect, it, vi } from "vitest";
import { submitScanClient } from "@/lib/api/scan";
import { uploadPhoto } from "@/lib/uploads/uploadPhoto";

vi.mock("firebase/storage", () => ({
  getMetadata: vi.fn(async () => ({})),
  ref: vi.fn(() => ({})),
}));

vi.mock("@/lib/http", () => ({
  apiFetch: vi.fn(async () => ({ scanId: "scan-1" })),
  ApiError: class ApiError extends Error {},
}));

vi.mock("@/features/scan/resizeImage", () => ({
  prepareScanPhoto: vi.fn(async (file: File) => ({
    preparedFile: file,
    meta: {
      original: { size: file.size },
      prepared: { size: file.size },
      debug: {},
    },
  })),
  isMobileUploadDevice: vi.fn(() => false),
}));

vi.mock("@/lib/firebase", () => {
  const storage = {};
  return {
    auth: {
      currentUser: {
        uid: "user-123",
        getIdToken: vi.fn().mockResolvedValue("token"),
        getIdTokenResult: vi.fn().mockResolvedValue({}),
      },
    },
    db: {} as any,
    getFirebaseStorage: vi.fn(() => storage),
  };
});

vi.mock("@/lib/uploads/uploadPhoto", () => ({
  uploadPhoto: vi.fn(),
}));

const uploadPhotoMock = vi.mocked(uploadPhoto);

describe("submitScanClient upload pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not deadlock: if one pose fails, others can still complete and the call resolves with an error", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "p.jpg", { type: "image/jpeg" });
    uploadPhotoMock.mockImplementation(async ({ pose, path }: any) => {
      if (pose === "front") {
        const err: any = new Error("permission denied");
        err.code = "storage/unauthorized";
        throw err;
      }
      return {
        method: "storage",
        storagePath: path,
        downloadURL: undefined,
        elapsedMs: 10,
        correlationId: "corr",
      };
    });

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
      },
      { posesToUpload: ["front", "back", "left", "right"] }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reason).toBe("upload_failed");
      expect(result.error.pose).toBe("front");
    }
    // Even though one failed, the pipeline attempted the other poses.
    expect(uploadPhotoMock).toHaveBeenCalled();
    const posesCalled = uploadPhotoMock.mock.calls.map((c) => c[0].pose);
    expect(new Set(posesCalled)).toEqual(new Set(["front", "back", "left", "right"]));
  });
});


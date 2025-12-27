import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { submitScanClient } from "@/lib/api/scan";
import { uploadPhoto } from "@/lib/uploads/uploadPhoto";
import { apiFetch } from "@/lib/http";
import { getScanPhotoPath } from "@/lib/uploads/storagePaths";

vi.mock("firebase/storage", () => ({
  getMetadata: vi.fn(async () => ({})),
  ref: vi.fn(() => ({})),
}));

vi.mock("@/lib/uploads/uploadPhoto", () => ({
  uploadPhoto: vi.fn(async (args: any) => ({
    method: "storage",
    storagePath: args.path,
    downloadURL: undefined,
    elapsedMs: 10,
    correlationId: args.correlationId,
  })),
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

const uploadPhotoMock = vi.mocked(uploadPhoto);
const apiFetchMock = vi.mocked(apiFetch);

describe("submitScanClient on Safari", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window.navigator, "userAgent", {
      value:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the Storage SDK upload path and never falls back to HTTP", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "front.jpg", {
      type: "image/jpeg",
    });
    const storagePaths = {
      front: "scans/user-123/scan-1/front.jpg",
      back: "scans/user-123/scan-1/back.jpg",
      left: "scans/user-123/scan-1/left.jpg",
      right: "scans/user-123/scan-1/right.jpg",
    };
    const result = await submitScanClient(
      {
        scanId: "scan-1",
        storagePaths,
        photos: { front: file, back: file, left: file, right: file },
        currentWeightKg: 70,
        goalWeightKg: 65,
      },
      { posesToUpload: ["front"] }
    );

    expect(result.ok).toBe(true);
    expect(uploadPhotoMock).toHaveBeenCalledTimes(1);
    expect(uploadPhotoMock.mock.calls[0][0]).toMatchObject({
      path: getScanPhotoPath("user-123", "scan-1", "front"),
      uid: "user-123",
    });
    const calledUploadEndpoint = apiFetchMock.mock.calls.find(
      ([url]) =>
        typeof url === "string" && url.toString().includes("/scan/upload")
    );
    expect(calledUploadEndpoint).toBeUndefined();
  });
});

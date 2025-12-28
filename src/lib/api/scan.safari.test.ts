import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { submitScanClient } from "@/lib/api/scan";

const apiFetchMock = vi.fn();

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
    auth: {
      currentUser: {
        uid: "user-123",
        getIdToken: vi.fn().mockResolvedValue("token"),
      },
    },
    db: {} as any,
  };
});

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

  it("uses the backend upload endpoint for Safari", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "front.jpg", {
      type: "image/jpeg",
    });
    apiFetchMock.mockResolvedValue({ scanId: "scan-1" });
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
    const calledUploadEndpoint = apiFetchMock.mock.calls.find(
      ([url]) =>
        typeof url === "string" && url.toString().includes("/scan/upload")
    );
    expect(calledUploadEndpoint).toBeTruthy();
  });
});

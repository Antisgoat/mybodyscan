import { describe, expect, it, vi } from "vitest";
import { uploadPhoto } from "@/lib/uploads/uploadPhoto";
import { uploadViaStorage } from "@/lib/uploads/uploadViaStorage";

vi.mock("@/lib/uploads/uploadViaStorage", () => ({
  uploadViaStorage: vi.fn(),
}));

vi.mock("@/lib/authFacade", () => ({
  getCachedUser: () => ({ uid: "user" }),
}));

describe("uploadPhoto", () => {
  it("passes retry configuration to the Storage SDK uploader", async () => {
    const storageMock = {
      app: { options: { storageBucket: "mybodyscan-f3daf.appspot.com" } },
    } as any;
    const file = new File(["data"], "front.jpg", { type: "image/jpeg" });
    vi.mocked(uploadViaStorage).mockResolvedValueOnce({
      method: "storage",
      storagePath: "scans/user/scan/front.jpg",
      downloadURL: undefined,
      elapsedMs: 5,
    } as any);

    const result = await uploadPhoto({
      storage: storageMock,
      path: "scans/user/scan/front.jpg",
      file,
      uid: "user",
      scanId: "scan",
      pose: "front",
      correlationId: "corr",
      storageTimeoutMs: 1000,
      stallTimeoutMs: 500,
    });

    expect(result.method).toBe("storage");
    expect(uploadViaStorage).toHaveBeenCalledTimes(1);
    expect(uploadViaStorage).toHaveBeenLastCalledWith(
      expect.objectContaining({ includeDownloadURL: true, maxRetries: 3 })
    );
  });
});

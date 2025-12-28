import { describe, expect, it, vi } from "vitest";
import { auth } from "@/lib/firebase";
import { uploadPhoto } from "@/lib/uploads/uploadPhoto";
import { uploadViaStorage } from "@/lib/uploads/uploadViaStorage";

vi.mock("@/lib/uploads/uploadViaStorage", () => ({
  uploadViaStorage: vi.fn(),
}));

describe("uploadPhoto", () => {
  it("passes retry configuration to the Storage SDK uploader", async () => {
    const storageMock = {
      app: { options: { storageBucket: "mybodyscan-f3daf.appspot.com" } },
    } as any;
    const fakeUser = {
      uid: "user",
      getIdToken: vi.fn().mockResolvedValue("token"),
    } as any;
    const originalUser = auth.currentUser;
    Object.defineProperty(auth, "currentUser", {
      value: fakeUser,
      configurable: true,
    });
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
    Object.defineProperty(auth, "currentUser", {
      value: originalUser,
      configurable: true,
    });
  });
});

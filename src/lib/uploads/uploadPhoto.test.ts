import { describe, expect, it, vi } from "vitest";
import { uploadPhoto } from "@/lib/uploads/uploadPhoto";
import type { UploadViaServerResult } from "@/lib/uploads/uploadViaServer";
import { uploadViaServer } from "@/lib/uploads/uploadViaServer";
import { uploadViaStorage } from "@/lib/uploads/uploadViaStorage";

vi.mock("@/lib/uploads/uploadViaStorage", () => ({
  uploadViaStorage: vi.fn(),
}));

vi.mock("@/lib/uploads/uploadViaServer", () => ({
  uploadViaServer: vi.fn(),
}));

describe("uploadPhoto", () => {
  it("falls back to server upload when storage reports no progress", async () => {
    const storageMock = {} as any;
    const file = new File(["data"], "front.jpg", { type: "image/jpeg" });
    vi.mocked(uploadViaStorage).mockRejectedValue(
      Object.assign(new Error("Upload started but no bytes were sent."), {
        code: "upload_no_progress",
      })
    );
    vi.mocked(uploadViaServer).mockResolvedValue({
      method: "server",
      storagePath: "scans/user/scan/front.jpg",
      elapsedMs: 5,
    } satisfies UploadViaServerResult);

    const onFallback = vi.fn();
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
      onFallback,
    });

    expect(result.method).toBe("server");
    expect(onFallback).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "storage_failed" })
    );
    expect(uploadViaStorage).toHaveBeenCalledTimes(1);
    expect(uploadViaServer).toHaveBeenCalledTimes(1);
  });
});

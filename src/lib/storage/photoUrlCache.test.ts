import { beforeEach, expect, it, vi } from "vitest";
const { download } = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock("firebase/storage", () => ({
  getBlob: download,
  ref: (_storage: unknown, path: string) => path,
}));
import {
  getCachedScanPhotoUrlMaybe,
  resetScanPhotoUrlCache,
} from "./photoUrlCache";
import type { FirebaseStorage } from "firebase/storage";
const storage = {} as FirebaseStorage;
beforeEach(() => {
  resetScanPhotoUrlCache();
  download.mockReset();
  URL.createObjectURL = vi.fn(() => "blob:private-session-photo");
  URL.revokeObjectURL = vi.fn();
});

it("does not return or re-cache a private URL that resolves after sign-out", async () => {
  let finish!: (blob: Blob) => void;
  download.mockImplementationOnce(
    () =>
      new Promise<Blob>((resolve) => {
        finish = resolve;
      })
  );
  const pending = getCachedScanPhotoUrlMaybe(
    storage,
    "scans/owner/one/front.jpg"
  );
  resetScanPhotoUrlCache();
  finish(new Blob(["private photo"]));
  expect((await pending).url).toBeNull();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  download.mockResolvedValueOnce(new Blob(["new photo"]));
  expect(
    (await getCachedScanPhotoUrlMaybe(storage, "scans/owner/one/front.jpg")).url
  ).toBe("blob:private-session-photo");
  expect(download).toHaveBeenCalledTimes(2);
});

it("does not let a previous session's rejected request poison the next session", async () => {
  let fail!: (error: Error) => void;
  download.mockImplementationOnce(
    () =>
      new Promise<string>((_resolve, reject) => {
        fail = reject;
      })
  );
  const pending = getCachedScanPhotoUrlMaybe(
    storage,
    "scans/owner/one/front.jpg"
  );
  resetScanPhotoUrlCache();
  fail(new Error("old session"));
  expect((await pending).url).toBeNull();
  download.mockResolvedValueOnce(new Blob(["new photo"]));
  expect(
    (await getCachedScanPhotoUrlMaybe(storage, "scans/owner/one/front.jpg")).url
  ).toBe("blob:private-session-photo");
});

it("uses an authenticated bounded blob download and revokes its URL on sign-out", async () => {
  download.mockResolvedValueOnce(new Blob(["photo"]));
  const result = await getCachedScanPhotoUrlMaybe(
    storage,
    "scans/owner/one/front.jpg"
  );
  expect(result.url).toBe("blob:private-session-photo");
  expect(download).toHaveBeenCalledWith(
    "scans/owner/one/front.jpg",
    15 * 1024 * 1024
  );
  resetScanPhotoUrlCache();
  await Promise.resolve();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith(
    "blob:private-session-photo"
  );
});

it("does not make a URL for a denied cross-user read", async () => {
  download.mockRejectedValueOnce(
    Object.assign(new Error("denied"), { code: "storage/unauthorized" })
  );
  expect(
    (await getCachedScanPhotoUrlMaybe(storage, "scans/other/one/front.jpg")).url
  ).toBeNull();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

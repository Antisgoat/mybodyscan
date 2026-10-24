import { beforeEach, expect, it, vi } from "vitest";
const { download } = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock("firebase/storage", () => ({
  getDownloadURL: download,
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
});

it("does not return or re-cache a private URL that resolves after sign-out", async () => {
  let finish!: (url: string) => void;
  download.mockImplementationOnce(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      })
  );
  const pending = getCachedScanPhotoUrlMaybe(
    storage,
    "scans/owner/one/front.jpg"
  );
  resetScanPhotoUrlCache();
  finish("https://private.example/photo?token=private");
  expect((await pending).url).toBeNull();
  download.mockResolvedValueOnce("https://private.example/new");
  expect(
    (await getCachedScanPhotoUrlMaybe(storage, "scans/owner/one/front.jpg")).url
  ).toBe("https://private.example/new");
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
  download.mockResolvedValueOnce("https://private.example/new");
  expect(
    (await getCachedScanPhotoUrlMaybe(storage, "scans/owner/one/front.jpg")).url
  ).toBe("https://private.example/new");
});

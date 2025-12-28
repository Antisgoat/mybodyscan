import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadPreparedPhoto } from "@/lib/uploads/uploadPreparedPhoto";
import type { FirebaseStorage } from "firebase/storage";

type UploadTaskSnapshotState = "running" | "paused" | "success" | "canceled" | "error";

type UploadTaskCallbacks = {
  next?: (snapshot: { bytesTransferred: number; totalBytes: number; state: UploadTaskSnapshotState }) => void;
  error?: (error: unknown) => void;
  complete?: () => void;
};

const uploadBytesResumableMock = vi.fn();
const refMock = vi.fn();
const getDownloadURLMock = vi.fn();

vi.mock("firebase/storage", () => ({
  uploadBytesResumable: (...args: unknown[]) => uploadBytesResumableMock(...args),
  ref: (...args: unknown[]) => refMock(...args),
  getDownloadURL: (...args: unknown[]) => getDownloadURLMock(...args),
}));

function setupDom() {
  const listeners = new Map<string, Set<EventListener>>();
  const addEventListener = vi.fn((event: string, cb: EventListener) => {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(cb);
  });
  const removeEventListener = vi.fn((event: string, cb: EventListener) => {
    listeners.get(event)?.delete(cb);
  });

  const windowLike = {
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    addEventListener,
    removeEventListener,
  };
  const documentLike = {
    visibilityState: "visible",
    addEventListener,
    removeEventListener,
  };
  vi.stubGlobal("window", windowLike);
  vi.stubGlobal("document", documentLike);
  vi.stubGlobal("navigator", { onLine: true });

  return { addEventListener, removeEventListener, listeners };
}

function buildTask(callbacks: UploadTaskCallbacks) {
  const cancel = vi.fn();
  const resume = vi.fn();
  const on = vi.fn((_event: string, next?: any, error?: any, complete?: any) => {
    callbacks.next = next;
    callbacks.error = error;
    callbacks.complete = complete;
    return () => {
      // unsubscribe noop
    };
  });
  return { cancel, resume, on };
}

describe("uploadPreparedPhoto", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    uploadBytesResumableMock.mockReset();
    refMock.mockReset();
    getDownloadURLMock.mockReset();
  });

  it("times out stalled uploads and cleans up", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
    const dom = setupDom();
    const callbacks: UploadTaskCallbacks = {};
    const task = buildTask(callbacks);
    uploadBytesResumableMock.mockReturnValue(task);

    const promise = uploadPreparedPhoto({
      storage: {} as unknown as FirebaseStorage,
      path: "scans/u/s/front.jpg",
      file: new Blob(["hi"], { type: "image/jpeg" }),
      metadata: { contentType: "image/jpeg" },
      stallTimeoutMs: 1000,
      overallTimeoutMs: 5000,
    }).catch((error) => error);

    await vi.advanceTimersByTimeAsync(1200);
    const result = await promise;
    expect(result).toMatchObject({ code: "upload_no_progress" });
    expect(task.cancel).toHaveBeenCalled();
    expect(dom.removeEventListener).toHaveBeenCalled();
  });

  it("resolves on completion and removes listeners", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
    const dom = setupDom();
    const callbacks: UploadTaskCallbacks = {};
    const task = buildTask(callbacks);
    uploadBytesResumableMock.mockReturnValue(task);

    const promise = uploadPreparedPhoto({
      storage: {} as unknown as FirebaseStorage,
      path: "scans/u/s/front.jpg",
      file: new Blob(["hi"], { type: "image/jpeg" }),
      metadata: { contentType: "image/jpeg" },
      stallTimeoutMs: 10_000,
      overallTimeoutMs: 10_000,
    });

    callbacks.next?.({ bytesTransferred: 10, totalBytes: 10, state: "running" });
    callbacks.complete?.();

    await expect(promise).resolves.toEqual({
      storagePath: "scans/u/s/front.jpg",
    });
    expect(dom.removeEventListener).toHaveBeenCalled();
  });

  it("rejects zero-byte files immediately", async () => {
    const task = buildTask({});
    uploadBytesResumableMock.mockReturnValue(task);
    const zero = new Blob([], { type: "image/jpeg" });

    await expect(
      uploadPreparedPhoto({
        storage: {} as unknown as FirebaseStorage,
        path: "scans/u/s/front.jpg",
        file: zero,
        metadata: { contentType: "image/jpeg" },
        stallTimeoutMs: 1_000,
        overallTimeoutMs: 2_000,
      })
    ).rejects.toMatchObject({ code: "upload_zero_bytes" });
    expect(uploadBytesResumableMock).not.toHaveBeenCalled();
  });

  it("aborts zero-progress uploads after three seconds even with long stall timeout", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
    const callbacks: UploadTaskCallbacks = {};
    const task = buildTask(callbacks);
    uploadBytesResumableMock.mockReturnValue(task);
    setupDom();

    const promise = uploadPreparedPhoto({
      storage: {} as unknown as FirebaseStorage,
      path: "scans/u/s/front.jpg",
      file: new Blob(["hi"], { type: "image/jpeg" }),
      metadata: { contentType: "image/jpeg" },
      stallTimeoutMs: 12_000,
      overallTimeoutMs: 20_000,
    }).catch((error) => error);

    await vi.advanceTimersByTimeAsync(3_200);
    const result = await promise;
    expect(result).toMatchObject({ code: "upload_no_progress" });
    expect(task.cancel).toHaveBeenCalled();
  });

  it("returns download URLs and avoids forbidden REST upload targets", async () => {
    const callbacks: UploadTaskCallbacks = {};
    const task = buildTask(callbacks);
    uploadBytesResumableMock.mockReturnValue(task);
    getDownloadURLMock.mockResolvedValue("https://storage.example/scans/u/s/front.jpg");

    const promise = uploadPreparedPhoto({
      storage: {} as unknown as FirebaseStorage,
      path: "scans/u/s/front.jpg",
      file: new Blob(["hi"], { type: "image/jpeg" }),
      metadata: { contentType: "image/jpeg" },
      stallTimeoutMs: 10_000,
      overallTimeoutMs: 10_000,
      includeDownloadURL: true,
    });

    callbacks.next?.({ bytesTransferred: 2, totalBytes: 2, state: "running" });
    callbacks.complete?.();

    await expect(promise).resolves.toEqual({
      storagePath: "scans/u/s/front.jpg",
      downloadURL: "https://storage.example/scans/u/s/front.jpg",
    });
    expect(uploadBytesResumableMock).toHaveBeenCalled();
    const refArg = refMock.mock.calls[0]?.[1];
    expect(refArg).toBe("scans/u/s/front.jpg");
    const forbidden = Buffer.from("L3YwL2Iv", "base64").toString("utf8");
    expect(String(refArg)).not.toContain(forbidden);
  });
});

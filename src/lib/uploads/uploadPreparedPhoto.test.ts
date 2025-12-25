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
});

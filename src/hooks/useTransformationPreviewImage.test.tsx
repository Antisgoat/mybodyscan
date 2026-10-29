// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadTransformationPreviewBlob } from "@/lib/transformationPreview";
import {
  PREVIEW_IMAGE_LOAD_TIMEOUT_MS,
  useTransformationPreviewImage,
} from "./useTransformationPreviewImage";

vi.mock("@/lib/transformationPreview", () => ({
  loadTransformationPreviewBlob: vi.fn(),
}));
const load = vi.mocked(loadTransformationPreviewBlob);
const image = () => new Blob(["test image"], { type: "image/jpeg" });
const revoke = vi.fn();

beforeEach(() => {
  load.mockReset();
  revoke.mockReset();
  let count = 0;
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = vi.fn(() => `blob:preview-${++count}`);
      static revokeObjectURL = revoke;
    }
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("private transformation image loading", () => {
  it("loads an existing image and releases it on unmount", async () => {
    load.mockResolvedValue(image());
    const view = renderHook(() => useTransformationPreviewImage("one.jpg"));
    await waitFor(() => expect(view.result.current.status).toBe("ready"));
    expect(view.result.current.url).toBe("blob:preview-1");
    view.unmount();
    expect(revoke).toHaveBeenCalledWith("blob:preview-1");
  });

  it("allows a failed download to be retried without a new generation request", async () => {
    load
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(image());
    const view = renderHook(() => useTransformationPreviewImage("one.jpg"));
    await waitFor(() => expect(view.result.current.status).toBe("error"));
    act(() => view.result.current.retry());
    await waitFor(() => expect(view.result.current.status).toBe("ready"));
    expect(load.mock.calls).toEqual([["one.jpg"], ["one.jpg"]]);
  });

  it("bounds a hung download and ignores a late response", async () => {
    vi.useFakeTimers();
    let finish!: (value: Blob) => void;
    load.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const view = renderHook(() => useTransformationPreviewImage("one.jpg"));
    await act(async () => {
      vi.advanceTimersByTime(PREVIEW_IMAGE_LOAD_TIMEOUT_MS);
    });
    expect(view.result.current.status).toBe("error");
    await act(async () => {
      finish(image());
    });
    expect(view.result.current.url).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("does not display a previous scan after changing paths", async () => {
    let finish!: (value: Blob) => void;
    load.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    load.mockResolvedValueOnce(image());
    const view = renderHook(({ path }) => useTransformationPreviewImage(path), {
      initialProps: { path: "old.jpg" },
    });
    view.rerender({ path: "new.jpg" });
    await waitFor(() => expect(view.result.current.status).toBe("ready"));
    await act(async () => {
      finish(image());
    });
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(view.result.current.url).toBe("blob:preview-1");
  });

  it("clears and revokes images when access or the scan is cleared", async () => {
    load.mockResolvedValue(image());
    const view = renderHook(({ path }) => useTransformationPreviewImage(path), {
      initialProps: { path: "one.jpg" as string | null },
    });
    await waitFor(() => expect(view.result.current.status).toBe("ready"));
    view.rerender({ path: null });
    expect(view.result.current.url).toBeNull();
    expect(revoke).toHaveBeenCalledWith("blob:preview-1");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("offers recovery when the browser cannot decode the image", async () => {
    load.mockResolvedValue(image());
    const view = renderHook(() => useTransformationPreviewImage("one.jpg"));
    await waitFor(() => expect(view.result.current.status).toBe("ready"));
    act(() => view.result.current.onImageError());
    expect(view.result.current.status).toBe("error");
    expect(view.result.current.url).toBeNull();
    act(() => view.result.current.retry());
    await waitFor(() => expect(view.result.current.status).toBe("ready"));
    expect(revoke).toHaveBeenCalledWith("blob:preview-1");
  });
});

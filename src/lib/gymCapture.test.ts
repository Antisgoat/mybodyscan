import { afterEach, describe, expect, it, vi } from "vitest";
import { waitForMediaEvent } from "./gymCapture";

afterEach(() => vi.useRealTimers());

describe("gym video processing waits", () => {
  it("resolves when metadata or a seek finishes and clears its timeout", async () => {
    vi.useFakeTimers();
    const target = new EventTarget();
    const ready = waitForMediaEvent(target, "seeked");
    target.dispatchEvent(new Event("seeked"));
    await ready;
    expect(vi.getTimerCount()).toBe(0);
  });
  it("rejects stalled decoding instead of leaving the screen busy indefinitely", async () => {
    vi.useFakeTimers();
    const target = new EventTarget();
    const remove = vi.spyOn(target, "removeEventListener");
    const result = expect(
      waitForMediaEvent(target, "loadedmetadata", 100)
    ).rejects.toThrow("video_processing_timeout");
    await vi.advanceTimersByTimeAsync(100);
    await result;
    expect(remove).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("rejects decode errors without waiting for the timeout", async () => {
    vi.useFakeTimers();
    const target = new EventTarget();
    const result = expect(waitForMediaEvent(target, "seeked")).rejects.toThrow(
      "video_processing_failed"
    );
    target.dispatchEvent(new Event("error"));
    await result;
    expect(vi.getTimerCount()).toBe(0);
  });
});

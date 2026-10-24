// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScanPhotoReview } from "./ScanPhotoReview";

describe("ScanPhotoReview", () => {
  const revoke = vi.fn();
  beforeEach(() => {
    let id = 0;
    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: vi.fn(() => `blob:local-${++id}`),
        revokeObjectURL: revoke,
      })
    );
    revoke.mockClear();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows angle-specific guidance without pretending to analyze the photo", () => {
    render(<ScanPhotoReview file={null} pose="left" />);
    expect(screen.getByText(/Show your left side/)).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("shows the full uncropped photo and releases replaced and unmounted previews", () => {
    const first = new File(["one"], "front.jpg", { type: "image/jpeg" });
    const next = new File(["two"], "next.jpg", { type: "image/jpeg" });
    const view = render(<ScanPhotoReview file={first} pose="front" />);
    expect(screen.getByRole("img").getAttribute("src")).toBe("blob:local-1");
    expect(screen.getByRole("img").className).toContain("object-contain");
    view.rerender(<ScanPhotoReview file={next} pose="front" />);
    expect(revoke).toHaveBeenCalledWith("blob:local-1");
    expect(screen.getByRole("img").getAttribute("src")).toBe("blob:local-2");
    view.unmount();
    expect(revoke).toHaveBeenCalledWith("blob:local-2");
  });

  it("removes the previous preview when its file is cleared", () => {
    const file = new File(["photo"], "back.jpg", { type: "image/jpeg" });
    const view = render(<ScanPhotoReview file={file} pose="back" />);
    view.rerender(<ScanPhotoReview file={null} pose="back" />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(revoke).toHaveBeenCalledWith("blob:local-1");
  });
});

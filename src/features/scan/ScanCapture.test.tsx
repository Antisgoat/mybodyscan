// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import ScanCapture from "./ScanCapture";

describe("ScanCapture", () => {
  it("exposes a library input with no capture attribute (iOS Photo Library works)", () => {
    render(<ScanCapture onReady={vi.fn()} />);
    const lib = screen.getByTestId("library-input") as HTMLInputElement;
    expect(lib).toBeTruthy();
    // @ts-expect-error jsdom attribute check
    expect(lib.getAttribute("capture")).toBe(null);
  });
});

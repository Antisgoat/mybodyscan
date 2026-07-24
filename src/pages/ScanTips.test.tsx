// @vitest-environment jsdom

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/Seo", () => ({ Seo: () => null }));

import ScanTips from "@/pages/ScanTips";

describe("ScanTips", () => {
  it("describes the complete four-photo capture sequence without an accuracy claim", () => {
    render(<ScanTips />);

    expect(screen.getByText("Front")).toBeTruthy();
    expect(screen.getByText("Left side")).toBeTruthy();
    expect(screen.getByText("Back")).toBeTruthy();
    expect(screen.getByText("Right side")).toBeTruthy();
    expect(screen.getByText(/more comparable photo estimates/i)).toBeTruthy();
    expect(screen.queryByText(/more accurate body-fat estimates/i)).toBeNull();
  });
});

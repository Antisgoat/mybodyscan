// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BodyVisualizationFallback } from "./BodyVisualizationFallback";
import type { ParametricBodyProfile } from "@/lib/bodyVisualization";

const profile: ParametricBodyProfile = {
  heightScale: 1,
  shoulderScale: 1,
  chestScale: 1,
  waistScale: 1,
  hipScale: 1,
  armScale: 1,
  legScale: 1,
  depthScale: 1,
  regions: [],
};

describe("BodyVisualizationFallback", () => {
  it("provides an accessible visualization and selectable regions", () => {
    const onSelectRegion = vi.fn();
    const { container } = render(
      <BodyVisualizationFallback
        profile={profile}
        selectedRegion="upper"
        onSelectRegion={onSelectRegion}
      />
    );

    expect(
      screen.getByRole("img", {
        name: /accessible two-dimensional body visualization/i,
      })
    ).toBeTruthy();
    const paths = container.querySelectorAll("path");
    fireEvent.click(paths[4]);
    expect(onSelectRegion).toHaveBeenCalledWith("hips");
  });
});

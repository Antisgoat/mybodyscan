// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SettingsHealth from "./SettingsHealth";

describe("Health settings", () => {
  it("shows only the health sources planned for a later release", () => {
    render(<SettingsHealth />);
    expect(screen.getByText("Apple Health")).toBeTruthy();
    expect(screen.getByText("Health Connect")).toBeTruthy();
    expect(screen.queryByText("WHOOP")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

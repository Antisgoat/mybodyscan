import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import PolicyGate from "./PolicyGate";

describe("PolicyGate", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("requires explicit acceptance of every policy", async () => {
    render(<PolicyGate />);

    const dialog = await screen.findByRole("dialog", {
      name: "Welcome to MyBodyScan",
    });
    const acceptButton = screen.getByRole("button", { name: "I Accept" });
    const checkboxes = screen.getAllByRole("checkbox");

    expect(dialog).toBeTruthy();
    expect(checkboxes).toHaveLength(3);
    checkboxes.forEach((checkbox) =>
      expect((checkbox as HTMLInputElement).checked).toBe(false)
    );
    expect((acceptButton as HTMLButtonElement).disabled).toBe(true);

    checkboxes.forEach((checkbox) => fireEvent.click(checkbox));
    expect((acceptButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(acceptButton);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(window.localStorage.getItem("mbs_policy_ok_v1")).toBe("1");
  });
});

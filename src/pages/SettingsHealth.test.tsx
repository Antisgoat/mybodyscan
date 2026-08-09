// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsHealth from "./SettingsHealth";

const healthMocks = vi.hoisted(() => ({
  status: vi.fn(),
  start: vi.fn(),
  sync: vi.fn(),
  disconnect: vi.fn(),
  open: vi.fn(),
}));

vi.mock("@/lib/health/whoop", () => ({
  getWhoopStatus: healthMocks.status,
  startWhoopConnection: healthMocks.start,
  syncWhoopRecovery: healthMocks.sync,
  disconnectWhoop: healthMocks.disconnect,
}));

vi.mock("@/lib/platform", () => ({
  openExternalUrl: healthMocks.open,
}));

describe("Health settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/settings/health");
  });

  it("does not offer WHOOP until server configuration is ready", async () => {
    healthMocks.status.mockResolvedValue({
      ok: true,
      configured: false,
      connected: false,
      connectedAtMs: null,
      lastSyncedAtMs: null,
    });
    render(<SettingsHealth />);
    expect(
      await screen.findByText(/approved WHOOP OAuth client/i)
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /connect WHOOP/i })).toBeNull();
  });

  it("opens only the server-issued WHOOP authorization URL", async () => {
    healthMocks.status.mockResolvedValue({
      ok: true,
      configured: true,
      connected: false,
      connectedAtMs: null,
      lastSyncedAtMs: null,
    });
    healthMocks.start.mockResolvedValue(
      "https://api.prod.whoop.com/oauth/oauth2/auth?state=safe-state"
    );
    healthMocks.open.mockResolvedValue(undefined);
    render(<SettingsHealth />);
    fireEvent.click(
      await screen.findByRole("button", { name: /connect WHOOP/i })
    );
    await waitFor(() =>
      expect(healthMocks.open).toHaveBeenCalledWith(
        "https://api.prod.whoop.com/oauth/oauth2/auth?state=safe-state"
      )
    );
  });
});

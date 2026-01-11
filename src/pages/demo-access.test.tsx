// @vitest-environment jsdom

import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

vi.mock("@/lib/auth", () => {
  return { useAuthUser: () => ({ user: null, authReady: true }) };
});

vi.mock("@/lib/firebase", () => {
  return {
    auth: { currentUser: null },
    providerFlags: { google: false, apple: false, email: false, demo: true },
    signInWithEmail: vi.fn(),
  };
});

vi.mock("@/auth/client", () => ({
  signInApple: vi.fn(),
  signInGoogle: vi.fn(),
  signInEmailPassword: vi.fn(),
  useAuthUser: () => ({ user: null, authReady: true }),
}));

import Login from "@/pages/Login";

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("demo access (signed out)", () => {
  it("clicking Browse demo navigates to /demo and does not sign in", async () => {
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/demo" element={<div data-testid="demo-route" />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("link", { name: /browse demo/i }));

    expect(screen.getByTestId("demo-route")).toBeTruthy();
    expect(window.localStorage.getItem("mbs_demo")).toBe("1");
  });
});


// @vitest-environment jsdom

import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

const signInWithRedirect = vi.fn();
const signInWithPopup = vi.fn();
const signInAnonymously = vi.fn();
const signInWithCustomToken = vi.fn();

vi.mock("firebase/auth", async () => {
  const actual = await vi.importActual<any>("firebase/auth");
  return {
    ...actual,
    signInWithRedirect,
    signInWithPopup,
    signInAnonymously,
    signInWithCustomToken,
  };
});

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

vi.mock("@/lib/authFacade", () => ({
  signInApple: vi.fn(),
  signInGoogle: vi.fn(),
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
    expect(signInWithRedirect).not.toHaveBeenCalled();
    expect(signInWithPopup).not.toHaveBeenCalled();
    expect(signInAnonymously).not.toHaveBeenCalled();
    expect(signInWithCustomToken).not.toHaveBeenCalled();
  });
});


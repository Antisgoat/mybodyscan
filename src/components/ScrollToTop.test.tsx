import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { ScrollToTop } from "@/components/ScrollToTop";

function NavigationFixture() {
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => navigate("/next")}>Next</button>
      <Routes>
        <Route path="*" element={<div>Page</div>} />
      </Routes>
    </>
  );
}

describe("ScrollToTop", () => {
  beforeEach(() => {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  });

  it("resets scroll when the route changes", () => {
    render(
      <MemoryRouter initialEntries={["/start"]}>
        <ScrollToTop />
        <NavigationFixture />
      </MemoryRouter>
    );

    document.documentElement.scrollTop = 120;
    document.body.scrollTop = 120;
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(document.documentElement.scrollTop).toBe(0);
    expect(document.body.scrollTop).toBe(0);
  });

  it("preserves anchor navigation", () => {
    document.documentElement.scrollTop = 120;
    document.body.scrollTop = 120;
    render(
      <MemoryRouter initialEntries={["/legal#privacy"]}>
        <ScrollToTop />
        <div>Page</div>
      </MemoryRouter>
    );

    expect(document.documentElement.scrollTop).toBe(120);
    expect(document.body.scrollTop).toBe(120);
  });
});

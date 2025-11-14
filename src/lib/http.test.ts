import { describe, it, expect } from "vitest";
import { ApiError } from "./http";

describe("ApiError", () => {
  it("captures status and code", () => {
    const e = new ApiError("x", 401, "unauthorized");
    expect(e.status).toBe(401);
    expect(e.code).toBe("unauthorized");
  });
});

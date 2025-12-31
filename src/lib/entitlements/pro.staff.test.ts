import { describe, expect, it, vi } from "vitest";

import { hasPro } from "./pro";

describe("hasPro (entitlements-only)", () => {
  it("does not treat allowlisted staff/test users as Pro without entitlements", () => {
    expect(hasPro({ pro: false })).toBe(false);
  });
});


import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => {
  return {
    auth: {
      currentUser: {
        uid: "ww481RPvMYZzwn5vLX8FXyRlGVV2",
        email: "developer@adlrlabs.com",
      },
    },
  };
});

import { hasPro } from "./pro";

describe("hasPro (staff/test allowlist UX)", () => {
  it("treats allowlisted staff/test users as Pro even when entitlements doc is false", () => {
    expect(hasPro({ pro: false })).toBe(true);
  });
});


import { describe, expect, it } from "vitest";

import { canUseCoach } from "@/lib/entitlements";

describe("Coach Pro gate (entitlements-driven)", () => {
  it("allows Coach when entitlements doc is pro:true (e.g. admin allowlist/unlimited)", () => {
    expect(
      canUseCoach({
        demo: false,
        entitlements: { pro: true, source: "admin", expiresAt: null },
      })
    ).toBe(true);
  });

  it("blocks Coach when entitlements doc is pro:false (shows Pro feature warning in UI)", () => {
    expect(
      canUseCoach({
        demo: false,
        entitlements: { pro: false, source: "stripe", expiresAt: null },
      })
    ).toBe(false);
  });
});


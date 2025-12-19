import { describe, it, expect } from "vitest";
import {
  hasUnlimitedEntitlement,
  hasActiveSubscription,
  canStartPrograms,
} from "./entitlements";

describe("entitlements helpers", () => {
  it("treats unlimited/admin/staff claims as unlimited", () => {
    expect(hasUnlimitedEntitlement({ unlimited: true })).toBe(true);
    expect(hasUnlimitedEntitlement({ unlimitedCredits: true })).toBe(true);
    expect(hasUnlimitedEntitlement({ creditsUnlimited: true })).toBe(true);
    expect(hasUnlimitedEntitlement({ admin: true })).toBe(true);
    expect(hasUnlimitedEntitlement({ staff: true })).toBe(true);
    expect(hasUnlimitedEntitlement({ role: "admin" })).toBe(true);
    expect(hasUnlimitedEntitlement({ role: "ADMIN" })).toBe(true);
  });

  it("treats active/trialing subscription as entitled", () => {
    expect(hasActiveSubscription({ status: "active" })).toBe(true);
    expect(hasActiveSubscription({ status: "trialing" })).toBe(true);
    expect(hasActiveSubscription({ status: "paid" })).toBe(true);
    expect(hasActiveSubscription({ status: "unlimited" })).toBe(true);
    expect(hasActiveSubscription({ status: "lifetime" })).toBe(true);
    expect(hasActiveSubscription({ status: "canceled" })).toBe(false);
    expect(hasActiveSubscription({ status: "none" })).toBe(false);
  });

  it("gates program starts consistently", () => {
    expect(
      canStartPrograms({ demo: true, claims: { unlimited: true }, subscription: { status: "none" } })
    ).toBe(false);
    expect(
      canStartPrograms({ demo: false, claims: { unlimited: true }, subscription: { status: "none" } })
    ).toBe(true);
    expect(
      canStartPrograms({ demo: false, claims: null, subscription: { status: "active" } })
    ).toBe(true);
    expect(
      canStartPrograms({ demo: false, claims: null, subscription: { status: "none" } })
    ).toBe(false);
  });
});


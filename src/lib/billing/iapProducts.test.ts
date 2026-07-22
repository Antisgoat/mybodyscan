import { describe, expect, it } from "vitest";
import {
  getIapProductKind,
  IAP_PRODUCT_IDS,
  isIapSubscription,
} from "./iapProducts";

describe("iOS in-app product allowlist", () => {
  it("recognizes only the canonical production product IDs", () => {
    expect(getIapProductKind(IAP_PRODUCT_IDS.monthly)).toBe("monthly");
    expect(getIapProductKind(IAP_PRODUCT_IDS.yearly)).toBe("yearly");
    expect(getIapProductKind(IAP_PRODUCT_IDS.one)).toBe("one");
    expect(getIapProductKind("unknown.product")).toBeNull();
  });

  it("distinguishes subscriptions from the consumable scan product", () => {
    expect(isIapSubscription("monthly")).toBe(true);
    expect(isIapSubscription("yearly")).toBe(true);
    expect(isIapSubscription("one")).toBe(false);
  });
});

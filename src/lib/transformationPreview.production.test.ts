import { describe, expect, it } from "vitest";
import { isPaidScanPreviewEligible } from "./transformationPreview";

describe("transformation preview eligibility", () => {
  it("allows paid or consumed-credit scans", () => {
    expect(isPaidScanPreviewEligible({ charged: true })).toBe(true);
    expect(isPaidScanPreviewEligible({ paid: true })).toBe(true);
    expect(isPaidScanPreviewEligible({ creditConsumed: true })).toBe(true);
    expect(isPaidScanPreviewEligible({ creditStatus: "consumed" })).toBe(true);
  });

  it("keeps unpaid normal scans locked", () => {
    expect(isPaidScanPreviewEligible({ charged: false, creditStatus: "refunded" })).toBe(false);
    expect(isPaidScanPreviewEligible(null)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { getScanPhotoPath } from "./storagePaths";

describe("getScanPhotoPath", () => {
  it("builds the canonical scan path", () => {
    const path = getScanPhotoPath("user-1", "scan-123", "front");
    expect(path).toBe("scans/user-1/scan-123/front.jpg");
  });

  it("trims uid and scanId", () => {
    const path = getScanPhotoPath(" user-1 ", " scan-123 ", "back");
    expect(path).toBe("scans/user-1/scan-123/back.jpg");
  });

  it("throws on invalid poses", () => {
    expect(() => getScanPhotoPath("user", "scan", "top" as any)).toThrow(
      /Invalid scan pose/
    );
  });

  it("requires uid and scanId", () => {
    expect(() => getScanPhotoPath("", "scan", "left")).toThrow("Missing uid");
    expect(() => getScanPhotoPath("user", "", "right")).toThrow("Missing scanId");
  });
});

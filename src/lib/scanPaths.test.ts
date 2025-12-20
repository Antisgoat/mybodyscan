import { describe, expect, it } from "vitest";
import { buildScanPhotoPath } from "@/lib/scanPaths";

describe("buildScanPhotoPath", () => {
  it("builds canonical storage path", () => {
    expect(
      buildScanPhotoPath({ uid: "user123", scanId: "scanABC", view: "front" })
    ).toBe("user_uploads/user123/scans/scanABC/front.jpg");
  });

  it("trims uid/scanId", () => {
    expect(
      buildScanPhotoPath({ uid: " user123 ", scanId: " scanABC ", view: "left" })
    ).toBe("user_uploads/user123/scans/scanABC/left.jpg");
  });

  it("throws on missing uid", () => {
    expect(() =>
      buildScanPhotoPath({ uid: "", scanId: "scanABC", view: "back" })
    ).toThrow(/Missing uid/i);
  });

  it("throws on invalid pose", () => {
    expect(() =>
      buildScanPhotoPath({ uid: "u", scanId: "s", view: "side" as any })
    ).toThrow(/Invalid scan pose/i);
  });

  it("throws on missing scanId", () => {
    expect(() =>
      buildScanPhotoPath({ uid: "u", scanId: "  ", view: "front" })
    ).toThrow(/Missing scanId/i);
  });
});

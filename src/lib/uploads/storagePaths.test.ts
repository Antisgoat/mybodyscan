import { describe, expect, it } from "vitest";
import { getScanPhotoPath, SCAN_POSES } from "./storagePaths";

describe("getScanPhotoPath", () => {
  it("returns the canonical scans path for every pose", () => {
    const uid = "user123";
    const scanId = "scan456";
    for (const pose of SCAN_POSES) {
      expect(getScanPhotoPath(uid, scanId, pose)).toBe(
        `scans/${uid}/${scanId}/${pose}.jpg`
      );
    }
  });

  it("trims identifiers before building the path", () => {
    const path = getScanPhotoPath("  user123  ", "\nscan789", "front");
    expect(path).toBe("scans/user123/scan789/front.jpg");
  });

  it("throws on invalid poses to avoid writing outside the scans folder", () => {
    expect(() => getScanPhotoPath("u1", "s1", "invalid" as any)).toThrow(
      /Invalid scan pose/
    );
  });
});


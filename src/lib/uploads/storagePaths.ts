export const SCAN_POSES = ["front", "back", "left", "right"] as const;
export type ScanPose = (typeof SCAN_POSES)[number];

export function isScanPose(value: unknown): value is ScanPose {
  return (
    value === "front" || value === "back" || value === "left" || value === "right"
  );
}

export function assertScanPose(value: unknown): asserts value is ScanPose {
  if (isScanPose(value)) return;
  const printable = typeof value === "string" ? value : JSON.stringify(value);
  throw new Error(
    `Invalid scan pose "${printable}". Expected one of: ${SCAN_POSES.join(", ")}`
  );
}

/**
 * Canonical scan photo Storage object path.
 *
 * MUST match backend + rules:
 *   scans/{uid}/{scanId}/{pose}.jpg
 */
export function getScanPhotoPath(uid: string, scanId: string, pose: ScanPose): string {
  const trimmedUid = String(uid || "").trim();
  const trimmedScanId = String(scanId || "").trim();
  assertScanPose(pose);
  if (!trimmedUid) throw new Error("Missing uid for scan photo path.");
  if (!trimmedScanId) throw new Error("Missing scanId for scan photo path.");
  return `scans/${trimmedUid}/${trimmedScanId}/${pose}.jpg`;
}


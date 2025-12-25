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
 * Canonical scan photo object path.
 *
 * IMPORTANT: Scan photos must NOT use `user_uploads/` (legacy). The only supported
 * location for scan images is:
 *   scans/{uid}/{scanId}/{pose}.jpg
 */
export function scanObjectPath(params: {
  uid: string;
  scanId: string;
  pose: ScanPose;
}): string {
  // Single source of truth for scan uploads.
  const uid = String(params.uid || "").trim();
  const scanId = String(params.scanId || "").trim();
  const pose = params.pose;
  assertScanPose(pose);
  if (!uid) throw new Error("Missing uid for scan photo path.");
  if (!scanId) throw new Error("Missing scanId for scan photo path.");
  return `scans/${uid}/${scanId}/${pose}.jpg`;
}

/**
 * Backwards-compatible alias (older code/tests call this name).
 * Prefer `scanObjectPath`.
 */
export function buildScanPhotoPath(params: {
  uid: string;
  scanId: string;
  view: ScanPose;
}): string {
  return scanObjectPath({ uid: params.uid, scanId: params.scanId, pose: params.view });
}


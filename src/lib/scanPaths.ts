import {
  SCAN_POSES,
  type ScanPose,
  isScanPose,
  assertScanPose,
  getScanPhotoPath,
} from "@/lib/uploads/storagePaths";

export { SCAN_POSES, type ScanPose, isScanPose, assertScanPose, getScanPhotoPath };

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
  return getScanPhotoPath(params.uid, params.scanId, params.pose);
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


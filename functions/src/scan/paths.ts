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

export function buildScanPhotoPath(params: {
  uid: string;
  scanId: string;
  pose: ScanPose;
}): string {
  const uid = String(params.uid || "").trim();
  const scanId = String(params.scanId || "").trim();
  const pose = params.pose;
  assertScanPose(pose);
  if (!uid) throw new Error("Missing uid for scan photo path.");
  if (!scanId) throw new Error("Missing scanId for scan photo path.");
  // Canonical scan photo uploads:
  // scans/{uid}/{scanId}/{pose}.jpg
  return `scans/${uid}/${scanId}/${pose}.jpg`;
}

export function scanPhotosPrefix(uid: string): string {
  const trimmed = String(uid || "").trim();
  return trimmed ? `scans/${trimmed}/` : "scans//";
}

export function scanScanIdPrefix(params: { uid: string; scanId: string }): string {
  const uid = String(params.uid || "").trim();
  const scanId = String(params.scanId || "").trim();
  return `scans/${uid}/${scanId}/`;
}


export const REQUIRED_SCAN_POSES = ["front", "back", "left", "right"] as const;
export type RequiredScanPose = (typeof REQUIRED_SCAN_POSES)[number];

export type InternalScanStatus = "queued" | "processing" | "complete" | "error";

export function normalizeScanStatus(
  rawStatus?: string | null
): InternalScanStatus {
  const normalized = String(rawStatus || "")
    .trim()
    .toLowerCase();
  if (
    normalized === "processing" ||
    normalized === "in_progress" ||
    normalized === "analyzing"
  )
    return "processing";
  if (
    normalized === "complete" ||
    normalized === "completed" ||
    normalized === "done" ||
    normalized === "success"
  )
    return "complete";
  if (
    normalized === "error" ||
    normalized === "failed" ||
    normalized === "failure" ||
    normalized === "aborted"
  )
    return "error";
  return "queued";
}

export function hasAllRequiredPhotoPaths(
  photoPaths: unknown
): photoPaths is Record<RequiredScanPose, string> {
  if (!photoPaths || typeof photoPaths !== "object") return false;
  const paths = photoPaths as Record<string, unknown>;
  return REQUIRED_SCAN_POSES.every(
    (pose) => typeof paths[pose] === "string" && paths[pose].trim().length > 0
  );
}

export function isSaneWeightKg(value: unknown): value is number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 25 && n <= 350;
}

export function isRealScanResultSource(source?: string | null): boolean {
  const normalized = String(source || "")
    .trim()
    .toLowerCase();
  return (
    normalized === "real" || normalized === "ai" || normalized === "analysis"
  );
}

export function isValidBodyFatPercent(value: unknown): value is number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 3 && n <= 60;
}

export function isSuccessfulPersistedScan(scan: {
  status?: string | null;
  resultSource?: string | null;
  usedFallback?: boolean | null;
  estimate?: { bodyFatPercent?: unknown } | null;
  input?: { currentWeightKg?: unknown } | null;
  photoPaths?: unknown;
  completedAt?: unknown;
}): boolean {
  return (
    normalizeScanStatus(scan.status) === "complete" &&
    isRealScanResultSource(scan.resultSource) &&
    scan.usedFallback !== true &&
    isValidBodyFatPercent(scan.estimate?.bodyFatPercent) &&
    isSaneWeightKg(scan.input?.currentWeightKg) &&
    hasAllRequiredPhotoPaths(scan.photoPaths) &&
    Boolean(scan.completedAt)
  );
}

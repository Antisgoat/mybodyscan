export function computeUploadConcurrency(
  poseCount: number,
  isMobileSafari: boolean
): number {
  const safeCount = Number.isFinite(poseCount) && poseCount > 0 ? poseCount : 1;
  const cap = isMobileSafari ? 2 : 4;
  return Math.max(1, Math.min(cap, safeCount));
}

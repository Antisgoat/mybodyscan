import type { TransformationPreviewDocument } from "./transformationPreview";

// Matches the backend's abandoned-generation lease. Recovery always requires
// explicit consent; the server still enforces its own lease and quota.
export const TRANSFORMATION_PREVIEW_STALE_MS = 10 * 60 * 1000;
export function isTransformationPreviewStale(
  preview: TransformationPreviewDocument | null,
  now: number
): boolean {
  if (preview?.status !== "processing" && preview?.status !== "queued")
    return false;
  const started =
    preview.updatedAt?.getTime() ?? preview.requestedAt?.getTime();
  return (
    typeof started === "number" &&
    Number.isFinite(started) &&
    Number.isFinite(now) &&
    now - started >= TRANSFORMATION_PREVIEW_STALE_MS
  );
}

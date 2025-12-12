const STALE_PROCESSING_MS = 15 * 60 * 1000;

export type CanonicalScanStatus =
  | "pending"
  | "processing"
  | "complete"
  | "error";

export interface ScanStatusMeta {
  canonical: CanonicalScanStatus;
  label: string;
  helperText: string;
  badgeVariant: "default" | "secondary" | "destructive";
  stale: boolean;
  showMetrics: boolean;
  recommendRescan: boolean;
}

type TimestampLike =
  | { toMillis?: () => number }
  | { seconds?: number; nanoseconds?: number }
  | Date
  | number
  | undefined
  | null;

function toMillis(value: TimestampLike): number | null {
  if (!value) return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "object") {
    const maybeMillis =
      typeof value.toMillis === "function" ? value.toMillis() : null;
    if (maybeMillis != null && Number.isFinite(maybeMillis)) {
      return maybeMillis;
    }
    if (typeof value.seconds === "number") {
      return Math.round(value.seconds * 1000);
    }
  }
  return null;
}

export function canonicalizeScanStatus(
  rawStatus?: string | null
): CanonicalScanStatus {
  const normalized = (rawStatus || "").toLowerCase();
  if (
    normalized === "processing" ||
    normalized === "in_progress" ||
    normalized === "analyzing"
  ) {
    return "processing";
  }
  if (
    normalized === "complete" ||
    normalized === "completed" ||
    normalized === "done" ||
    normalized === "success"
  ) {
    return "complete";
  }
  if (
    normalized === "error" ||
    normalized === "failed" ||
    normalized === "failure" ||
    normalized === "aborted"
  ) {
    return "error";
  }
  return "pending";
}

export function isScanStale(
  status: CanonicalScanStatus,
  updatedAt?: TimestampLike,
  now = Date.now()
): boolean {
  if (status !== "pending" && status !== "processing") {
    return false;
  }
  const updatedAtMs = toMillis(updatedAt);
  if (updatedAtMs == null) {
    return false;
  }
  return now - updatedAtMs > STALE_PROCESSING_MS;
}

export function buildScanStatusMeta(
  statusInput?: string | null,
  updatedAt?: TimestampLike,
  now = Date.now()
): ScanStatusMeta {
  const canonical = canonicalizeScanStatus(statusInput);
  const stale = isScanStale(canonical, updatedAt, now);
  if (canonical === "complete" && !stale) {
    return {
      canonical,
      label: "Complete",
      helperText: "View your latest scan metrics.",
      badgeVariant: "default",
      stale: false,
      showMetrics: true,
      recommendRescan: false,
    };
  }
  if (canonical === "error" || stale) {
    return {
      canonical: canonical === "error" ? "error" : "processing",
      label: stale ? "Failed to complete" : "Failed",
      helperText: "Start a new scan to try again.",
      badgeVariant: "destructive",
      stale,
      showMetrics: false,
      recommendRescan: true,
    };
  }
  // Pending / processing but still running
  return {
    canonical,
    label: "Processing…",
    helperText: "Keep this tab open – this usually takes a minute.",
    badgeVariant: "secondary",
    stale: false,
    showMetrics: false,
    recommendRescan: false,
  };
}

export function scanStatusLabel(
  statusInput?: string | null,
  updatedAt?: TimestampLike,
  now = Date.now()
): ScanStatusMeta {
  return buildScanStatusMeta(statusInput, updatedAt, now);
}

export { STALE_PROCESSING_MS };

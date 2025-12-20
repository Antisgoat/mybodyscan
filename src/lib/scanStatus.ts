const STALE_PROCESSING_MS = 15 * 60 * 1000;

export type CanonicalScanStatus =
  | "uploading"
  | "uploaded"
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
  if (normalized === "uploading") return "uploading";
  if (normalized === "uploaded") return "uploaded";
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
  if (
    status !== "pending" &&
    status !== "processing" &&
    status !== "uploading" &&
    status !== "uploaded"
  ) {
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
    const staleLabel = (() => {
      if (!stale) return "Failed";
      if (canonical === "uploading") return "Upload stalled";
      if (canonical === "uploaded") return "Upload complete, awaiting analysis";
      if (canonical === "pending") return "Scan pending too long";
      if (canonical === "processing") return "Processing timed out";
      return "Failed";
    })();
    const staleHelper = (() => {
      if (!stale) return "Start a new scan to try again.";
      if (canonical === "uploading") {
        return "Check your connection and retry the failed photo upload.";
      }
      if (canonical === "uploaded" || canonical === "pending") {
        return "Open the scan to retry processing or start a new scan.";
      }
      if (canonical === "processing") {
        return "Open the scan to retry processing or contact support.";
      }
      return "Start a new scan to try again.";
    })();
    return {
      canonical: canonical === "error" ? "error" : "processing",
      label: staleLabel,
      helperText: staleHelper,
      badgeVariant: "destructive",
      stale,
      showMetrics: false,
      recommendRescan: true,
    };
  }
  if (canonical === "uploading") {
    return {
      canonical,
      label: "Uploading photos…",
      helperText: "Keep this tab open – uploads usually complete in seconds.",
      badgeVariant: "secondary",
      stale: false,
      showMetrics: false,
      recommendRescan: false,
    };
  }
  if (canonical === "uploaded") {
    return {
      canonical,
      label: "Upload complete",
      helperText: "Starting analysis…",
      badgeVariant: "secondary",
      stale: false,
      showMetrics: false,
      recommendRescan: false,
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

export type UploadTaskState = "running" | "paused" | "success" | "canceled" | "error";

export type UploadStallReason = "no_progress" | "stalled" | "paused";

export function getUploadStallReason(params: {
  lastBytes: number;
  lastBytesAt: number;
  lastState?: UploadTaskState;
  now: number;
  stallTimeoutMs: number;
}): UploadStallReason | null {
  const stallTimeoutMs = Number(params.stallTimeoutMs);
  if (!Number.isFinite(stallTimeoutMs) || stallTimeoutMs <= 0) return null;
  const lastState = params.lastState ?? "running";
  const elapsed = params.now - params.lastBytesAt;
  if (!Number.isFinite(elapsed) || elapsed < stallTimeoutMs) return null;
  // iOS Safari frequently flips uploads to PAUSED during backgrounding / transient
  // radio changes, and can leave them paused forever. If we see "paused" with no
  // byte movement for long enough, treat it as a stuck upload and force a retry.
  if (lastState === "paused") return "paused";
  if (lastState !== "running") return null;
  return params.lastBytes > 0 ? "stalled" : "no_progress";
}

export type Retryability = {
  retryable: boolean;
  reason:
    | "stall"
    | "firebase_retry_limit"
    | "transient_network"
    | "unknown_no_bytes"
    | "unauthorized"
    | "canceled"
    | "invalid"
    | "non_retryable";
};

/**
 * Classifies whether an upload failure is safe to retry.
 *
 * NON-NEGOTIABLES:
 * - Do NOT retry unauthorized/canceled/invalid-argument without explicit user action.
 * - Only retry unknown errors when we never transferred bytes (optional, but helps Safari edge cases).
 */
export function classifyUploadRetryability(params: {
  code?: string;
  bytesTransferred?: number;
  wasOffline?: boolean;
}): Retryability {
  const code = String(params.code || "");
  const bytes = typeof params.bytesTransferred === "number" ? params.bytesTransferred : 0;
  const wasOffline = Boolean(params.wasOffline);

  if (wasOffline) {
    return { retryable: true, reason: "transient_network" };
  }

  if (!code) {
    return bytes <= 0
      ? { retryable: true, reason: "unknown_no_bytes" }
      : { retryable: false, reason: "non_retryable" };
  }

  if (code === "upload_stalled" || code === "upload_no_progress" || code === "upload_paused") {
    return { retryable: true, reason: "stall" };
  }

  if (code === "upload_timeout") {
    return { retryable: true, reason: "transient_network" };
  }

  if (code === "cors_blocked") {
    return { retryable: true, reason: "transient_network" };
  }

  if (code === "storage/retry-limit-exceeded") {
    return { retryable: true, reason: "firebase_retry_limit" };
  }

  // Firebase transient-ish errors.
  if (code === "storage/unknown" || code === "storage/timeout") {
    return bytes <= 0
      ? { retryable: true, reason: "unknown_no_bytes" }
      : { retryable: true, reason: "transient_network" };
  }

  // Safari / Blob slicing quirks can sometimes be transient if no bytes were sent.
  if (code === "storage/cannot-slice-blob" || code === "storage/server-file-wrong-size") {
    return bytes <= 0
      ? { retryable: true, reason: "transient_network" }
      : { retryable: true, reason: "firebase_retry_limit" };
  }

  if (code === "storage/unauthorized") return { retryable: false, reason: "unauthorized" };
  if (code === "function/unauthenticated" || code === "function/permission-denied") {
    return { retryable: false, reason: "unauthorized" };
  }
  if (code === "storage/canceled" || code === "upload_cancelled") {
    return { retryable: false, reason: "canceled" };
  }
  if (code === "storage/invalid-argument" || code === "preprocess_failed") {
    return { retryable: false, reason: "invalid" };
  }

  if (code.startsWith("function/")) {
    return { retryable: true, reason: "transient_network" };
  }

  // Default: only retry if nothing was uploaded (keeps retries safe).
  return bytes <= 0
    ? { retryable: true, reason: "unknown_no_bytes" }
    : { retryable: false, reason: "non_retryable" };
}

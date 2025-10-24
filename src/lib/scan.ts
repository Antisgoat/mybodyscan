import { SCAN_POLL_MIN_MS, SCAN_POLL_MAX_MS, SCAN_POLL_TIMEOUT_MS } from "./flags";
import { fetchClaims } from "./claims";

/** Canonical scan states returned by backend. */
export type ScanStatus = "queued" | "uploading" | "processing" | "complete" | "failed" | "timeout";

export type StartScanResponse = {
  sessionId: string;
  uploadUrl: string;
  uploadHeaders?: Record<string, string>;
};

export type PollResponse = {
  status: ScanStatus;
  resultUrl?: string;
  error?: string;
};

/**
 * Start a new scan session.
 * The caller must upload the file to uploadUrl (usually via PUT) before polling.
 */
export async function startScanSession(meta?: { mime?: string; size?: number }): Promise<StartScanResponse> {
  const res = await fetch("/api/scan/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mime: meta?.mime, size: meta?.size }),
  });
  if (!res.ok) {
    throw new Error(`scan/start failed: ${res.status}`);
  }
  const j = await res.json();
  const sessionId = String(j?.sessionId ?? "");
  const uploadUrl = String(j?.uploadUrl ?? "");
  const uploadHeaders =
    j?.uploadHeaders && typeof j.uploadHeaders === "object"
      ? (j.uploadHeaders as Record<string, string>)
      : undefined;
  if (!sessionId || !uploadUrl) {
    throw new Error("scan/start: invalid response");
  }
  return { sessionId, uploadUrl, uploadHeaders };
}

/** Single poll of session status from backend. */
export async function pollStatus(sessionId: string): Promise<PollResponse> {
  const params = new URLSearchParams({ sessionId });
  const res = await fetch(`/api/scan/status?${params.toString()}`, { method: "GET" });
  if (!res.ok) {
    return { status: "failed", error: `status ${res.status}` };
  }
  const j = await res.json();
  const status = normalizeStatus(String(j?.status ?? ""));
  const resultUrl = j?.resultUrl ? String(j.resultUrl) : undefined;
  const error = j?.error ? String(j.error) : undefined;
  return { status, resultUrl, error };
}

/**
 * Poll until terminal state or timeout.
 * Progressively backs off from SCAN_POLL_MIN_MS to SCAN_POLL_MAX_MS.
 */
export async function pollUntilComplete(
  sessionId: string,
  onTick?: (response: PollResponse) => void
): Promise<PollResponse> {
  const start = Date.now();
  let delay = clamp(SCAN_POLL_MIN_MS, 1000, 15_000);

  while (Date.now() - start < SCAN_POLL_TIMEOUT_MS) {
    const response = await pollStatus(sessionId);
    onTick?.(response);

    if (response.status === "complete" || response.status === "failed") {
      return response;
    }

    await sleep(delay);
    delay = Math.min(SCAN_POLL_MAX_MS, Math.round(delay * 1.25));
  }

  return { status: "timeout", error: "Scan timed out." };
}

/**
 * Idempotent client-side credit consumption: refreshes claims once per session.
 * Server still enforces credits; this only updates UI promptly.
 */
const refreshedSessions = new Set<string>();
export async function consumeCreditUI(sessionId: string): Promise<void> {
  if (refreshedSessions.has(sessionId)) {
    return;
  }
  refreshedSessions.add(sessionId);
  try {
    await fetchClaims();
  } catch {
    // non-fatal refresh failure
  }
}

/* ----------------- helpers ----------------- */
function normalizeStatus(status: string): ScanStatus {
  switch (status.toLowerCase()) {
    case "queued":
    case "pending":
      return "queued";
    case "uploading":
      return "uploading";
    case "processing":
    case "running":
      return "processing";
    case "complete":
    case "done":
    case "succeeded":
      return "complete";
    case "failed":
    case "error":
      return "failed";
    default:
      return "processing";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

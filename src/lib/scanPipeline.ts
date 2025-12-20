export type ScanPipelineStage =
  | "init"
  | "preprocess"
  | "upload_front"
  | "upload_back"
  | "upload_left"
  | "upload_right"
  | "submit_scan"
  | "processing_wait"
  | "result_ready"
  | "failed";

export type ScanPipelineError = {
  message: string;
  code?: string;
  reason?: string;
  pose?: string;
  stage?: ScanPipelineStage;
  requestId?: string;
  details?: unknown;
  occurredAt?: number;
};

export type ScanPipelineState = {
  scanId: string;
  stage: ScanPipelineStage;
  createdAt: number;
  updatedAt: number;
  stageStartedAt: number;
  requestId?: string;
  storagePaths?: Record<string, string>;
  lastError?: ScanPipelineError | null;
  lastServerStatus?: string | null;
  lastServerUpdatedAt?: number | null;
};

const STORAGE_PREFIX = "mbs.scanPipeline:";
const ACTIVE_SCAN_KEY = `${STORAGE_PREFIX}active`;

function storage(): Storage | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
    if (typeof globalThis !== "undefined" && "localStorage" in globalThis) {
      return (globalThis as { localStorage?: Storage }).localStorage ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

function stateKey(scanId: string) {
  return `${STORAGE_PREFIX}${scanId}`;
}

export function readScanPipelineState(scanId: string): ScanPipelineState | null {
  const store = storage();
  if (!store || !scanId) return null;
  try {
    const raw = store.getItem(stateKey(scanId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ScanPipelineState;
    if (!parsed || parsed.scanId !== scanId) return null;
    if (!parsed.stage) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function updateScanPipelineState(
  scanId: string,
  patch: Partial<ScanPipelineState>
): ScanPipelineState | null {
  const store = storage();
  if (!store || !scanId) return null;
  const now = Date.now();
  const existing =
    readScanPipelineState(scanId) ??
    ({
      scanId,
      stage: "init",
      createdAt: now,
      updatedAt: now,
      stageStartedAt: now,
    } satisfies ScanPipelineState);
  const nextStage = patch.stage ?? existing.stage;
  const stageChanged = nextStage !== existing.stage;
  const next: ScanPipelineState = {
    ...existing,
    ...patch,
    scanId,
    stage: nextStage,
    updatedAt: now,
    stageStartedAt: stageChanged ? now : existing.stageStartedAt,
  };
  if (patch.lastError === null) {
    next.lastError = null;
  }
  try {
    store.setItem(stateKey(scanId), JSON.stringify(next));
    if (next.stage === "result_ready") {
      if (store.getItem(ACTIVE_SCAN_KEY) === scanId) {
        store.removeItem(ACTIVE_SCAN_KEY);
      }
    } else {
      store.setItem(ACTIVE_SCAN_KEY, scanId);
    }
  } catch {
    return null;
  }
  return next;
}

export function clearScanPipelineState(scanId: string): void {
  const store = storage();
  if (!store || !scanId) return;
  try {
    store.removeItem(stateKey(scanId));
    if (store.getItem(ACTIVE_SCAN_KEY) === scanId) {
      store.removeItem(ACTIVE_SCAN_KEY);
    }
  } catch {
    // ignore
  }
}

export function readActiveScanId(): string | null {
  const store = storage();
  if (!store) return null;
  try {
    const scanId = store.getItem(ACTIVE_SCAN_KEY);
    return scanId && scanId.trim() ? scanId : null;
  } catch {
    return null;
  }
}

export function readActiveScanPipelineState(): ScanPipelineState | null {
  const scanId = readActiveScanId();
  if (!scanId) return null;
  return readScanPipelineState(scanId);
}

const STAGE_LABELS: Record<ScanPipelineStage, string> = {
  init: "Starting scan",
  preprocess: "Preparing photos",
  upload_front: "Uploading front photo",
  upload_back: "Uploading back photo",
  upload_left: "Uploading left photo",
  upload_right: "Uploading right photo",
  submit_scan: "Submitting scan",
  processing_wait: "Processing scan",
  result_ready: "Scan complete",
  failed: "Scan paused",
};

export function describeScanPipelineStage(
  stage: ScanPipelineStage | null | undefined
): string {
  if (!stage) return "—";
  return STAGE_LABELS[stage] ?? stage;
}

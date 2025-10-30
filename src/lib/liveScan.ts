import { auth as firebaseAuth, db } from "@/lib/firebase";
import { ensureAppCheck, getAppCheckHeader } from "@/lib/appCheck";
import { doc, onSnapshot, type Unsubscribe } from "firebase/firestore";

export type PoseKey = "front" | "back" | "left" | "right";

export interface ScanStartResponse {
  scanId: string;
  uploadUrls: Record<PoseKey, string>;
  expiresAt: string;
}

export interface ScanResultResponse {
  id: string;
  createdAt: number;
  completedAt: number;
  engine: string;
  status: string;
  inputs: Record<string, unknown>;
  result: {
    bfPercent: number;
    low: number;
    high: number;
    confidence: "low" | "medium" | "high";
    notes: string;
  };
  metadata: {
    sessionId: string;
    images: Array<{ pose: PoseKey; sizeBytes: number; md5Hash: string | null }>;
  };
  creditsRemaining: number | null;
  provider?: string;
}

export interface ScanStatus {
  id: string;
  status: string;
  createdAt: number;
  completedAt: number | null;
  engine: string | null;
  inputs: Record<string, unknown>;
  result?: ScanResultResponse["result"];
  metadata: {
    sessionId: string;
    images: Array<{ pose: PoseKey; sizeBytes: number; md5Hash: string | null }>;
  };
  creditsRemaining: number | null;
  provider?: string | null;
  error?: string | null;
}

interface SubmitPayload {
  scanId: string;
  weightLb?: number;
  heightIn?: number;
  age?: number;
  sex?: "male" | "female";
  idempotencyKey?: string;
}

async function authedRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const user = firebaseAuth.currentUser;
  if (!user) {
    const error = new Error("auth_required");
    (error as any).code = "auth_required";
    throw error;
  }
  await ensureAppCheck();
  const [idToken, appCheckHeaders] = await Promise.all([
    user.getIdToken(),
    getAppCheckHeader(),
  ]);

  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("Authorization", `Bearer ${idToken}`);
  if (appCheckHeaders["X-Firebase-AppCheck"]) {
    headers.set("X-Firebase-AppCheck", appCheckHeaders["X-Firebase-AppCheck"]);
  }

  return fetch(path, { ...init, headers });
}

async function parseJsonResponse(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (err) {
    return { raw: text };
  }
}

function buildError(status: number, data: any): Error {
  const message = data?.error || data?.reason || `request_failed_${status}`;
  const error = new Error(message);
  (error as any).status = status;
  (error as any).details = data;
  return error;
}

export async function startLiveScan(): Promise<ScanStartResponse> {
  const response = await authedRequest("/api/scan/start", {
    method: "POST",
    body: JSON.stringify({}),
  });
  const data = await parseJsonResponse(response);
  if (!response.ok) {
    throw buildError(response.status, data);
  }
  return data as ScanStartResponse;
}

export async function uploadScanImages(
  uploadUrls: Record<PoseKey, string>,
  files: Record<PoseKey, File>,
  onProgress?: (info: { pose: PoseKey; index: number; total: number }) => void
): Promise<void> {
  const entries = Object.entries(uploadUrls) as Array<[PoseKey, string]>;
  const total = entries.length;
  for (let index = 0; index < entries.length; index += 1) {
    const [pose, url] = entries[index];
    const file = files[pose];
    if (!file) {
      const error = new Error(`missing_${pose}`);
      (error as any).code = "missing_file";
      throw error;
    }
    onProgress?.({ pose, index, total });
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "image/jpeg",
      },
      body: file,
    });
    if (!response.ok) {
      const error = new Error(`upload_failed_${pose}`);
      (error as any).status = response.status;
      throw error;
    }
  }
}

export async function submitLiveScan(payload: SubmitPayload): Promise<ScanResultResponse> {
  const response = await authedRequest("/api/scan/submit", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const data = await parseJsonResponse(response);
  if (!response.ok) {
    throw buildError(response.status, data);
  }
  return data as ScanResultResponse;
}

export function listenToScan(
  scanId: string,
  handler: (snapshot: ScanStatus | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const user = firebaseAuth.currentUser;
  if (!user) {
    throw new Error("auth_required");
  }
  const ref = doc(db, `users/${user.uid}/scans/${scanId}`);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        handler(null);
        return;
      }
      handler(normalizeScanStatus(snap.id, snap.data() as Record<string, unknown>));
    },
    onError,
  );
}

function normalizeScanStatus(id: string, raw: Record<string, unknown>): ScanStatus {
  const createdAt = timestampToMillis(raw.createdAt) ?? Date.now();
  const completedAt = timestampToMillis(raw.completedAt);
  const status = typeof raw.status === "string" ? raw.status : "processing";
  const engine = typeof raw.engine === "string" ? raw.engine : null;
  const provider = typeof raw.provider === "string" ? raw.provider : null;
  const creditsRemaining = toNumber(raw.creditsRemaining);
  const inputs = raw.inputs && typeof raw.inputs === "object" ? (raw.inputs as Record<string, unknown>) : {};
  const metadataRaw = raw.metadata && typeof raw.metadata === "object" ? (raw.metadata as Record<string, unknown>) : {};
  const sessionId = typeof metadataRaw.sessionId === "string" && metadataRaw.sessionId
    ? metadataRaw.sessionId
    : id;
  const imagesRaw = Array.isArray(metadataRaw.images) ? metadataRaw.images : [];
  const images = imagesRaw.map((entry: any) => ({
    pose: normalizePose(entry?.pose),
    sizeBytes: typeof entry?.sizeBytes === "number" ? entry.sizeBytes : 0,
    md5Hash: typeof entry?.md5Hash === "string" ? entry.md5Hash : null,
  }));
  const result = normalizeResult(raw.result);
  const error = typeof raw.error === "string" ? raw.error : null;

  return {
    id,
    status,
    createdAt,
    completedAt: completedAt ?? null,
    engine,
    inputs,
    result: result ?? undefined,
    metadata: { sessionId, images },
    creditsRemaining,
    provider,
    error,
  };
}

function normalizeResult(raw: unknown): ScanResultResponse["result"] | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const source = raw as Record<string, unknown>;
  const bfPercent = toNumber(source.bfPercent ?? source.bf_percent);
  if (bfPercent == null) return undefined;
  const low = toNumber(source.low ?? source.lower) ?? bfPercent;
  const high = toNumber(source.high ?? source.upper) ?? bfPercent;
  const confidenceRaw = typeof source.confidence === "string" ? source.confidence.toLowerCase() : "";
  const confidence: "low" | "medium" | "high" =
    confidenceRaw === "high" || confidenceRaw === "medium" || confidenceRaw === "low"
      ? (confidenceRaw as "low" | "medium" | "high")
      : "medium";
  const notes = typeof source.notes === "string" ? source.notes : "";
  return { bfPercent, low, high, confidence, notes };
}

function timestampToMillis(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "object") {
    const maybe = value as { toMillis?: () => number; seconds?: number };
    if (typeof maybe.toMillis === "function") {
      return maybe.toMillis();
    }
    if (typeof maybe.seconds === "number") {
      return Math.round(maybe.seconds * 1000);
    }
  }
  return null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizePose(value: unknown): PoseKey {
  if (value === "back" || value === "left" || value === "right") {
    return value;
  }
  return "front";
}

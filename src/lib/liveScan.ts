import { auth } from "@/lib/firebase";
import { getAppCheckToken } from "@/appCheck";

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

interface SubmitPayload {
  scanId: string;
  weightLb?: number;
  heightIn?: number;
  age?: number;
  sex?: "male" | "female";
  idempotencyKey?: string;
}

async function authedRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const user = auth.currentUser;
  if (!user) {
    const error = new Error("auth_required");
    (error as any).code = "auth_required";
    throw error;
  }
  const [idToken, appCheckToken] = await Promise.all([
    user.getIdToken(),
    getAppCheckToken(),
  ]);
  if (!appCheckToken) {
    const error = new Error("app_check_unavailable");
    (error as any).code = "app_check_unavailable";
    throw error;
  }

  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("Authorization", `Bearer ${idToken}`);
  headers.set("X-Firebase-AppCheck", appCheckToken);

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

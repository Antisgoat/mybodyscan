import { auth } from "@/lib/firebase";
import { getScanPhotoPath, type ScanPose } from "@/lib/uploads/storagePaths";
import { SCAN_UPLOAD_CONTENT_TYPE } from "@/lib/uploads/uploadViaStorage";
import { assertNoForbiddenStorageRestUrl } from "@/lib/storage/restGuards";

export type UploadViaServerResult = {
  method: "server";
  storagePath: string;
  elapsedMs: number;
};

type UploadViaServerPayload = {
  path: string;
  scanId: string;
  pose: string;
  contentType: string;
  data: string; // base64 (no data: prefix)
  correlationId?: string;
  metadata?: Record<string, string>;
};

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("encode_failed"));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("encode_failed"));
        return;
      }
      const commaIndex = result.indexOf(",");
      const base64 = commaIndex >= 0 ? result.slice(commaIndex + 1) : result;
      resolve(base64);
    };
    reader.readAsDataURL(blob);
  });
}

type UploadViaServerParams = {
  path: string;
  scanId: string;
  pose: string;
  file: Blob;
  correlationId: string;
  metadata?: Record<string, string>;
  signal?: AbortSignal;
};

export async function uploadViaServer(params: UploadViaServerParams): Promise<UploadViaServerResult> {
  assertNoForbiddenStorageRestUrl(params.path, "upload_fallback_path");
  const startedAt = Date.now();
  const user = auth.currentUser;
  if (!user) {
    const err: any = new Error("Please sign in again before uploading.");
    err.code = "storage/unauthorized";
    throw err;
  }
  const authUid = user.uid;
  const token = await user.getIdToken().catch((error) => {
    const err: any = new Error("Could not refresh sign-in session.");
    err.code = "auth/token-refresh-failed";
    err.original = error;
    throw err;
  });
  const expectedPath = getScanPhotoPath(authUid, params.scanId, params.pose as ScanPose);
  if (params.path !== expectedPath) {
    const err: any = new Error("Upload blocked: invalid scan storage path.");
    err.code = "storage/invalid-path";
    throw err;
  }
  const base64 = await toBase64(params.file);
  const payload: UploadViaServerPayload = {
    path: params.path,
    scanId: params.scanId,
    pose: params.pose,
    contentType: SCAN_UPLOAD_CONTENT_TYPE,
    data: base64,
    correlationId: params.correlationId,
    metadata: params.metadata,
  };
  const response = await fetch("/api/scan/uploadPhoto", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Correlation-Id": params.correlationId,
      "X-Scan-Id": params.scanId,
    },
    body: JSON.stringify(payload),
    signal: params.signal,
  });
  const elapsedMs = Date.now() - startedAt;
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.ok) {
    const message =
      (body?.error?.message as string | undefined) ||
      response.statusText ||
      "Upload failed.";
    const err: any = new Error(message);
    err.code = (body?.error?.code as string | undefined) || "function/upload_failed";
    err.status = response.status;
    err.debugId = body?.error?.debugId;
    err.response = body;
    throw err;
  }
  return {
    method: "server",
    storagePath: String(body.path || params.path),
    elapsedMs,
  };
}

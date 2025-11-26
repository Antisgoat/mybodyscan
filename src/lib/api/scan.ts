import { apiFetch, apiPost } from "@/lib/http";
import { resolveFunctionUrl } from "@/lib/api/functionsBase";
import { auth, db } from "@/lib/firebase";
import { doc } from "firebase/firestore";
import { uploadScanImages, type PoseKey } from "@/lib/liveScan";

export type Pose = PoseKey;

export type StartScanResponse = {
  scanId: string;
  uploadUrls: Record<Pose, string>;
  expiresAt?: string;
};

function startUrl(): string {
  return resolveFunctionUrl("VITE_SCAN_START_URL", "startScanSession");
}

function submitUrl(): string {
  return resolveFunctionUrl("VITE_SCAN_SUBMIT_URL", "submitScan");
}

function deleteUrl(): string {
  return resolveFunctionUrl("VITE_DELETE_SCAN_URL", "deleteScan");
}

export async function startScanSession(): Promise<StartScanResponse> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  const data = await apiFetch<StartScanResponse>(startUrl(), { method: "POST" });
  const scanId = typeof data?.scanId === "string" ? data.scanId : "";
  if (!scanId) throw new Error("startScan did not return scanId");
  const uploadUrls = data?.uploadUrls && typeof data.uploadUrls === "object" ? data.uploadUrls : {};
  return { scanId, uploadUrls: uploadUrls as Record<Pose, string>, expiresAt: data?.expiresAt };
}

export async function uploadScanBlobs(opts: {
  scanId: string;
  uploadUrls: Record<Pose, string>;
  blobs: Record<Pose, Blob>;
  onProgress?: (p: { pose: Pose; bytesTransferred: number; totalBytes: number; percent: number }) => void;
}): Promise<void> {
  const files: Record<PoseKey, File> = {} as Record<PoseKey, File>;
  (Object.keys(opts.uploadUrls) as Pose[]).forEach((pose) => {
    const blob = opts.blobs[pose];
    if (!blob) {
      throw new Error(`Missing ${pose} image`);
    }
    const type = blob.type || "image/jpeg";
    files[pose] = blob instanceof File ? blob : new File([blob], `${pose}.jpg`, { type });
  });

  await uploadScanImages(opts.uploadUrls, files, {
    onProgress: ({ pose, index, total }) => {
      const percent = Math.max(0, Math.min(100, Math.round(((index + 1) / total) * 100)));
      opts.onProgress?.({ pose, bytesTransferred: index + 1, totalBytes: total, percent });
    },
  });
}

export async function submitScan(scanId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  await apiFetch(submitUrl(), { method: "POST", body: { scanId } });
}

export function scanDocRef(scanId: string) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("No user");
  return doc(db, "users", uid, "scans", scanId);
}

export async function deleteScanApi(scanId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  await apiPost(deleteUrl(), { scanId });
}

// Legacy aliases for existing call sites
export { startScanSession as startScanCallable };
export { submitScan as triggerScanProcessing };

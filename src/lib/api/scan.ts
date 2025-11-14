import { httpsCallable, getFunctions } from "firebase/functions";
import { auth, db } from "@/lib/firebase";
import { apiPost } from "@/lib/http";
import { doc } from "firebase/firestore";

export function getScanProcessUrl(): string {
  // Allow env override; fallbacks cover common rewrites in hosting
  const env = (import.meta as any).env || {};
  return (
    env.VITE_SCAN_PROCESS_URL ||
    "/api/scan/process" ||
    "/api/processQueuedScanHttp"
  );
}

export async function startScanCallable(): Promise<{ scanId: string }> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  const fn = httpsCallable(getFunctions(), "startScan");
  const res: any = await fn({ mode: "photos", poses: ["front","back","left","right"] });
  const scanId = res?.data?.scanId || res?.scanId || res?.data?.id;
  if (!scanId) throw new Error("startScan did not return scanId");
  return { scanId: String(scanId) };
}

export async function triggerScanProcessing(scanId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  await apiPost(getScanProcessUrl(), { scanId });
}

export function scanDocRef(scanId: string) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("No user");
  // Per data model, scans live under users/{uid}/scans/{scanId}
  return doc(db, "users", uid, "scans", scanId);
}

export async function deleteScanApi(scanId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  await apiPost("/api/scan/delete", { scanId });
}

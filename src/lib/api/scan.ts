import { httpsCallable, getFunctions } from "firebase/functions";
import { auth, appCheck, db } from "@/lib/firebase";
import { getToken as getAppCheckToken } from "firebase/app-check";
import { getIdToken } from "firebase/auth";
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
  const [idToken, ac] = await Promise.all([
    getIdToken(user, false).catch(() => ""),
    getAppCheckToken(appCheck, false).catch(() => null),
  ]);
  const res = await fetch(getScanProcessUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      ...(ac?.token ? { "X-Firebase-AppCheck": ac.token } : {}),
    },
    body: JSON.stringify({ scanId }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`process trigger failed (${res.status}): ${text || "no body"}`);
  }
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
  const [idToken, ac] = await Promise.all([
    user.getIdToken(/*forceRefresh*/ true).catch(() => ""),
    getAppCheckToken(appCheck, false).catch(() => null),
  ]);
  const res = await fetch("/api/scan/delete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      ...(ac?.token ? { "X-Firebase-AppCheck": ac.token } : {}),
    },
    body: JSON.stringify({ scanId }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(t || `Delete failed (${res.status})`);
  }
}

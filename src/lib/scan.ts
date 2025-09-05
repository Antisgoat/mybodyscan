import { db, storage, app } from "@/lib/firebase";
import { doc, setDoc, serverTimestamp, onSnapshot } from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";
import { authedFetch } from "@/lib/api";
import { httpsCallable, getFunctions } from "firebase/functions";

export interface StartScanResponse {
  scanId: string;
  remaining: number;
}

export async function startScan(params: {
  filename: string;
  size: number;
  contentType: string;
}): Promise<StartScanResponse> {
  const response = await authedFetch("/startScan", {
    method: "POST",
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to start scan: ${error}`);
  }

  return response.json();
}

export async function uploadScanFile(
  uid: string,
  scanId: string,
  file: File
): Promise<void> {
  const fileExt = file.name.split('.').pop() || 'jpg';
  const storageRef = ref(storage, `scans/${uid}/${scanId}/original.${fileExt}`);
  
  await uploadBytes(storageRef, file);
}

export async function processScan(scanId: string): Promise<void> {
  const response = await authedFetch("/processQueuedScanHttp", {
    method: "POST",
    body: JSON.stringify({ scanId }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to process scan: ${error}`);
  }
}

export function listenToScan(
  uid: string,
  scanId: string,
  callback: (scan: any) => void,
  onError?: (error: Error) => void
) {
  const scanRef = doc(db, "users", uid, "scans", scanId);
  
  return onSnapshot(
    scanRef,
    (snapshot) => {
      if (snapshot.exists()) {
        callback({ id: snapshot.id, ...snapshot.data() });
      }
    },
    (error) => {
      console.error("Error listening to scan:", error);
      onError?.(error);
    }
  );
}

export async function runBodyScan(files: string[]): Promise<any> {
  const functions = getFunctions(app);
  const call = httpsCallable(functions, "runBodyScan");
  const { data } = await call({ files });
  return data as any;
}
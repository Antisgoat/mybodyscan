import { db, storage, functions } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";
import { authedFetch } from "@/lib/api";
import { httpsCallable } from "firebase/functions";

export type ScanStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface ScanResult {
  id: string;
  status: ScanStatus;
  bodyFatPercentage?: number;
  muscleMass?: number;
  createdAt: Date;
  completedAt?: Date;
}

// TODO: Implement when Leanlense API is ready
export async function startScan(imageData: FormData): Promise<{ scanId: string }> {
  throw new Error('Scan functionality not yet implemented - pending Leanlense integration');
}

// TODO: Implement scan polling
export async function pollScan(scanId: string): Promise<ScanResult> {
  throw new Error('Scan polling not yet implemented - pending Leanlense integration');
}

// TODO: Implement result saving
export async function saveResult(scanId: string, result: Partial<ScanResult>): Promise<void> {
  throw new Error('Result saving not yet implemented - pending Leanlense integration');
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

export async function runBodyScan(file: string): Promise<any> {
  const call = httpsCallable(functions, "runBodyScan");
  const { data } = await call({ file });
  return data as any;
}
